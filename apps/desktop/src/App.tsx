import { useEffect, useMemo, useState } from 'react';
import { defaultTeam, documentDefaults, MAX_ORDERS, MAX_PDF_BYTES, settingsSchema, tripSchema,
  type DocumentRecord, type DocumentStatus, type ExportFiles, type HistoryEntry, type Member, type PdfImport, type Settings, type Trip } from '@pea/contracts';
import { calculateTrip, createRoute, formatThaiShortDate } from '@pea/core';
import { Icon } from './components';
import { Documents } from './Documents';
import { ExportDesk, Preview } from './Preview';
import { History, SettingsEditor } from './Records';
import { blankOrder, TripEditor, type PmOptions } from './TripEditor';
import './styles.css';

type Page = 'trip' | 'documents' | 'history' | 'settings';

const navigation = [
  { id: 'trip', label: 'จัดทำทริป', icon: 'file' },
  { id: 'documents', label: 'เช็กลิสต์เอกสาร', icon: 'check' },
  { id: 'history', label: 'ประวัติทริป', icon: 'archive' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'settings' },
] satisfies { id: Page; label: string; icon: Parameters<typeof Icon>[0]['name'] }[];
type Pending = 'import' | 'save' | 'export' | 'folder' | 'settings' | 'history';
type Notice = { kind: 'error' | 'success'; message: string };
type TravelImport = Extract<PdfImport, { kind: 'travel' }>;

const pendingLabels: Record<Pending, string> = {
  import: 'กำลังอ่านเอกสาร',
  save: 'กำลังบันทึกทริป',
  export: 'กำลังสร้างชุดเอกสาร',
  folder: 'กำลังเปิดไฟล์',
  settings: 'กำลังบันทึกการตั้งค่า',
  history: 'กำลังอ่านประวัติ',
};

function newTrip(team: Member[]): Trip {
  return {
    id: crypto.randomUUID(), orders: [{ ...blankOrder, pms: [] }], travelSegments: [],
    participants: team.map(({ id }) => ({ memberId: id, selected: false })),
    orderDate: '', documentDate: '', vehicle: '', note: '', office: '', voucherNo: '', officeNo: '', flew: false,
    ...documentDefaults,
  };
}

function attachDocumentToTrip(trip: Trip, record: DocumentRecord): Trip {
  const documentIds = [...new Set([...(trip.documentIds ?? []), record.id])];
  if (record.data.kind !== 'pm') return { ...trip, documentIds };
  const codes = new Set(record.data.options.map((option) => option.costCenter));
  const orders = trip.orders.map((order) => ({
    ...order,
    pms: order.pms.map((pm) => !pm.sourceDocumentId && codes.has(pm.costCenter) ? { ...pm, sourceDocumentId: record.id } : pm),
  }));
  return { ...trip, documentIds, orders };
}

function travelToTrip(trip: Trip, team: Member[], imported: TravelImport, sourceDocumentId?: string): Trip {
  const sameOrder = trip.orders.findIndex((order) => order.orderNo === imported.orderNo);
  const emptyOrder = trip.orders.findIndex((order) => !order.orderNo.trim());
  const target = sameOrder >= 0 ? sameOrder : emptyOrder;
  if (target < 0 && trip.orders.length === MAX_ORDERS) throw new Error('ตารางคำสั่งเต็ม 5 รายการ');
  const existing = trip.orders[target];
  const order = {
    ...(existing ?? { ...blankOrder, pms: [] }),
    orderNo: imported.orderNo,
    work: imported.work.trim().slice(0, 220),
    location: imported.location.trim().slice(0, 90),
    sourceDocumentId: sourceDocumentId ?? existing?.sourceDocumentId,
  };
  const orders = target < 0 ? [...trip.orders, order] : trip.orders.map((item, index) => index === target ? order : item);
  const alreadyHasRoute = trip.travelSegments.length > 0;
  return {
    ...trip,
    orders,
    documentIds: [...new Set([...(trip.documentIds ?? []), ...(sourceDocumentId ? [sourceDocumentId] : [])])],
    orderDate: imported.orderDate || trip.orderDate,
    vehicle: imported.vehicle.trim().slice(0, 100) || trip.vehicle,
    travelSegments: alreadyHasRoute ? trip.travelSegments : createRoute(orders, imported.departDate, imported.returnDate),
    participants: team.map(({ id }) => ({
      ...trip.participants.find((person) => person.memberId === id), memberId: id, selected: imported.employeeIds.includes(id),
    })),
  };
}

function errorText(error: unknown) {
  if (!(error instanceof Error)) return 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
  return error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '').trim();
}

export function App() {
  const [page, setPage] = useState<Page>('trip');
  const [settings, setSettings] = useState<Settings>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [library, setLibrary] = useState<DocumentRecord[]>([]);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus>();
  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState(() => newTrip(defaultTeam));
  const [savedTrip, setSavedTrip] = useState(trip);
  const [teamSnapshot, setTeamSnapshot] = useState<Member[]>();
  const [importNames, setImportNames] = useState<string[]>([]);
  const [importedDates, setImportedDates] = useState<Pick<TravelImport, 'departDate' | 'returnDate'>>();
  const [exportRoot, setExportRoot] = useState<string>();
  const [files, setFiles] = useState<ExportFiles>();
  const [pending, setPending] = useState<Pending>();
  const [notice, setNotice] = useState<Notice>();
  const [editorKey, setEditorKey] = useState(0);
  const dirty = trip !== savedTrip;
  const team = teamSnapshot ?? settings?.team ?? defaultTeam;
  const calculation = useMemo(() => calculateTrip(trip, team), [trip, team]);
  const pmOptions = useMemo<PmOptions>(() => library.flatMap((record) =>
    record.data.kind === 'pm'
      ? record.data.options.map((option) => ({ ...option, sourceDocumentId: record.id, fileName: record.fileName }))
      : [],
  ), [library]);
  const working = pending !== undefined;
  const busy = loading || working;

  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const [result, docs] = await Promise.all([window.pea.settings(), window.pea.documents()]);
        if (current) {
          const draft = newTrip(result.team);
          setTrip(draft);
          setSavedTrip(draft);
          setSettings(result);
          setLibrary(docs);
        }
      } catch (error) {
        if (current) setNotice({ kind: 'error', message: 'เปิดการตั้งค่าไม่ได้ · ' + errorText(error) });
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    void window.pea.exportedDocuments(trip.id).then((status) => {
      if (current) setDocumentStatus(status);
    }).catch(() => {
      if (current) setDocumentStatus({ clear: false, budget: false });
    });
    return () => { current = false; };
  }, [trip.id, files]);

  async function run<T>(task: Pending, action: () => Promise<T>) {
    if (busy) return undefined;
    setPending(task);
    setNotice(undefined);
    try {
      return await action();
    } catch (error) {
      setNotice({ kind: 'error', message: errorText(error) });
      return undefined;
    } finally {
      setPending(undefined);
    }
  }

  function navigate(target: Page) {
    setPage(target);
    setNotice(undefined);
    if (target === 'history') void run('history', async () => setHistory(await window.pea.history()));
    if (target === 'documents') {
      void Promise.all([window.pea.documents(), window.pea.exportedDocuments(trip.id)]).then(([docs, status]) => {
        setLibrary(docs);
        setDocumentStatus(status);
      }).catch(() => undefined);
    }
  }

  function loadTrip(next: Trip, snapshot?: Member[], previousFiles?: ExportFiles) {
    setTrip(next);
    setSavedTrip(next);
    setTeamSnapshot(snapshot);
    setImportNames([]);
    setImportedDates(undefined);
    setExportRoot(undefined);
    setFiles(previousFiles);
    setNotice(undefined);
    setEditorKey((key) => key + 1);
    setPage('trip');
  }

  function allowReplace() {
    return !dirty || window.confirm('ทริปปัจจุบันมีข้อมูลที่ยังไม่ได้บันทึก เปลี่ยนทริปหรือไม่?');
  }

  function importFiles(incoming: File[], attachment = false) {
    if (!incoming.length) return;
    void run('import', async () => {
      let updated = trip;
      let travelDates = importedDates;
      const successful: string[] = [];
      const errors: string[] = [];
      let keptRoute = false;
      for (const file of incoming) {
        try {
          if (!attachment && !file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') throw new Error('เลือกไฟล์ PDF');
          if (file.size > MAX_PDF_BYTES) throw new Error(attachment ? 'ไฟล์ใหญ่เกิน 24 MB' : 'ไฟล์ PDF ใหญ่เกิน 24 MB');
          const record = await window.pea.importDocument(file.name, new Uint8Array(await file.arrayBuffer()), attachment);
          if (record.data.kind === 'travel') {
            const hasRoute = updated.travelSegments.length > 0;
            updated = travelToTrip(updated, team, record.data, record.id);
            keptRoute ||= hasRoute;
            travelDates = { departDate: record.data.departDate, returnDate: record.data.returnDate };
          } else {
            updated = attachDocumentToTrip(updated, record);
          }
          successful.push(record.fileName);
        } catch (error) {
          errors.push(file.name + ' · ' + errorText(error));
        }
      }
      if (successful.length) setLibrary(await window.pea.documents());
      setTrip(updated);
      setImportedDates(travelDates);
      setImportNames((names) => [...new Set([...names, ...successful])]);
      const imported = successful.length ? (attachment ? 'แนบเอกสารแล้ว ' : 'นำเข้า PDF แล้ว ') + successful.length + ' ไฟล์' : '';
      const routeMessage = keptRoute ? 'เก็บตารางเดินทางเดิมไว้ กรุณาตรวจวันที่และสถานที่หลังนำเข้า' : '';
      setNotice({
        kind: errors.length ? 'error' : 'success',
        message: [imported, routeMessage, ...errors].filter(Boolean).join('\n'),
      });
    });
  }

  function useDocument(record: DocumentRecord) {
    if (record.data.kind === 'travel') {
      try {
        const hasRoute = trip.travelSegments.length > 0;
        const updated = travelToTrip(trip, team, record.data, record.id);
        setTrip(updated);
        setImportedDates({ departDate: record.data.departDate, returnDate: record.data.returnDate });
        setImportNames((names) => [...new Set([...names, record.fileName])]);
        setNotice({
          kind: 'success',
          message: hasRoute
            ? `นำคำสั่ง ${record.data.orderNo} เข้าทริปแล้ว (เก็บตารางเดินทางเดิมไว้)`
            : `นำคำสั่ง ${record.data.orderNo} เข้าทริปแล้ว`,
        });
      } catch (error) {
        setNotice({ kind: 'error', message: errorText(error) });
      }
      return;
    }
    setTrip((current) => attachDocumentToTrip(current, record));
    setImportNames((names) => [...new Set([...names, record.fileName])]);
    setNotice({ kind: 'success', message: `เชื่อม ${record.fileName} เข้ากับทริปนี้แล้ว` });
  }

  function checkedTrip() {
    const parsed = tripSchema.safeParse(trip);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const fields: Record<string, string> = {
      orders: 'คำสั่งและศูนย์ต้นทุน', travelSegments: 'ตารางเดินทาง', participants: 'ผู้ร่วมเดินทาง',
      workEntries: 'รายการปฏิบัติงาน', extraExpenses: 'ค่าใช้จ่ายเพิ่มเติม',
    };
    throw new Error('ตรวจข้อมูลในส่วน' + (fields[String(issue.path[0])] ?? 'รายละเอียดเอกสาร') + ' · ' + issue.message);
  }

  function save() {
    void run('save', async () => {
      const entry = await window.pea.saveTrip(checkedTrip(), team);
      setTrip(entry.trip);
      setSavedTrip(entry.trip);
      setNotice({ kind: 'success', message: 'บันทึกทริปแล้ว เปิดกลับมาแก้ไขได้จากประวัติทริป' });
    });
  }

  function exportTrip() {
    void run('export', async () => {
      const result = await window.pea.exportTrip(checkedTrip(), team, exportRoot);
      setFiles(result);
      setSavedTrip(trip);
      setNotice({ kind: 'success', message: 'ส่งออกชุดเอกสารแล้ว 3 ไฟล์' });
    });
  }

  function saveSettings(draft: Settings) {
    void run('settings', async () => {
      const parsed = settingsSchema.safeParse(draft);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        if (issue.path[0] === 'exportRoot') throw new Error('ระบุพาธโฟลเดอร์ส่งออก');
        const member = draft.team[Number(issue.path[1])];
        throw new Error('ตรวจข้อมูลสมาชิก ' + (member?.name || member?.nickname || '') + ' · ' + issue.message);
      }
      const saved = await window.pea.saveSettings(parsed.data);
      if (!teamSnapshot) {
        const revised = {
          ...trip, participants: saved.team.map(({ id }) => trip.participants.find((person) => person.memberId === id) ?? { memberId: id, selected: false }),
        };
        setTrip(revised);
        if (!dirty) setSavedTrip(revised);
      }
      setSettings(saved);
      setNotice({ kind: 'success', message: 'บันทึกการตั้งค่าแล้ว' });
    });
  }

  const chooseFolder = () => run('folder', () => window.pea.chooseFolder());
  const openFolder = (folder: string) => { void run('folder', () => window.pea.openFolder(folder)); };
  const openDocument = (id: string) => { void run('folder', () => window.pea.openDocument(id)); };
  const start = formatThaiShortDate(trip.travelSegments[0]?.departDate ?? '');
  const end = formatThaiShortDate(trip.travelSegments.at(-1)?.arriveDate ?? '');
  const period = [...new Set([start, end].filter(Boolean))].join(' – ');
  const active = navigation.find(({ id }) => id === page);

  return (
    <div className="app-shell" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
      onDrop={(event) => {
        event.preventDefault();
        if ((page === 'trip' || page === 'documents') && !busy) importFiles(Array.from(event.dataTransfer.files));
      }}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span>PEA</span></div>
          <div className="brand-copy"><strong>PEA Clear</strong><small>TRAVEL DOCUMENTS</small></div>
        </div>
        <p className="rail-caption">สำนักงานเอกสาร</p>
        <nav aria-label="เมนูหลัก">
          {navigation.map(({ id, label, icon }, index) => (
            <button key={id} type="button" aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)} disabled={working} title={label}>
              <small>0{index + 1}</small><Icon name={icon} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-footer"><Icon name="shield" /><span><strong>เก็บข้อมูลในเครื่อง</strong><small>PEA CLEAR DESKTOP</small></span></div>
      </aside>

      <main className="main">
        <div className="window-bar">
          <span><b>PEA CLEAR DESKTOP</b><span className="bar-divider">/</span>{active?.label}</span>
          <span className={'window-status' + (working ? ' working' : '')} role="status">
            <i />{pending ? pendingLabels[pending] : loading ? 'กำลังเปิดแอป' : page === 'trip' && dirty ? 'ยังไม่ได้บันทึก' : 'พร้อมใช้งาน'}
          </span>
        </div>
        {notice && <div className={'notice ' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={notice.kind === 'success' ? 'check' : 'info'} /><span>{notice.message}</span>
          <button type="button" className="icon-button" onClick={() => setNotice(undefined)} aria-label="ปิดข้อความ"><Icon name="close" /></button>
        </div>}

        {page === 'trip' && <>
          <header className="workspace-heading">
            <div className="heading-copy">
              <span className="eyebrow"><i /> ทะเบียนเดินทางปฏิบัติงาน</span>
              <h1>{calculation.combinedOrderNo || 'จัดทำชุดเอกสารเดินทาง'}</h1>
              <p>{[calculation.combinedLocation, period].filter(Boolean).join(' · ') || 'ใบเคลียเบี้ยเลี้ยงและใบตัดงบประมาณ กฟภ.'}</p>
            </div>
            <div className="workspace-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={() => { if (allowReplace()) loadTrip(newTrip(settings?.team ?? defaultTeam)); }}>
                <Icon name="plus" />ทริปใหม่</button>
              <button type="button" className="button secondary" disabled={busy} onClick={save}><Icon name="save" />บันทึกทริป</button>
            </div>
          </header>
          <div className="metric-strip" aria-label="สรุปทริป">
            <div><span>เวลาเดินทาง</span><strong>{calculation.tripDays}<small> วัน </small>{calculation.tripNights}<small> คืน</small></strong></div>
            <div><span>วันตัดงบ PM</span><strong>{calculation.totalPmDays}<small> วัน</small></strong></div>
            <div><span>ผู้ร่วมเดินทาง</span><strong>{calculation.people.length}<small> คน</small></strong></div>
            <div className="metric-record"><Icon name="file" /><span>ใบเคลีย / ใบตัดงบ</span></div>
          </div>
          <div className="workspace">
            <div className="editor-scroll" key={editorKey}>
              <TripEditor trip={trip} team={team} update={setTrip} calculation={calculation} pmOptions={pmOptions}
                importNames={importNames} importedDates={importedDates} onImport={importFiles} busy={busy} />
            </div>
            <div className="proof-desk" key={trip.id}>
              <Preview trip={trip} people={calculation.people} />
              <ExportDesk exportRoot={exportRoot ?? settings?.exportRoot ?? ''} files={files} busy={busy} isExporting={pending === 'export'}
                canExport={Boolean(settings && calculation.people.length)} onChoose={() => {
                  void chooseFolder().then((folder) => { if (folder) setExportRoot(folder); });
                }} onExport={exportTrip} onOpen={openFolder} />
            </div>
          </div>
        </>}

        {page === 'documents' && <div className="records-scroll">
          <Documents trip={trip} library={library} status={documentStatus} files={files} busy={busy}
            onOpen={openDocument} onFolder={openFolder} onUse={useDocument} onImport={importFiles}
            onRestricted={(required) => setTrip((current) => ({ ...current, requiresRestrictedAttachment: required }))}
            onDetach={(id) => setTrip((current) => ({ ...current, documentIds: (current.documentIds ?? []).filter((item) => item !== id) }))} />
        </div>}

        {page === 'history' && <div className="records-scroll">
          <History entries={history} busy={busy} onOpen={(entry) => { if (allowReplace()) loadTrip(entry.trip, entry.team, entry.files); }}
            onFolder={openFolder} onNew={() => navigate('trip')} />
        </div>}

        {page === 'settings' && <div className="records-scroll">
          {settings ? <SettingsEditor key={JSON.stringify(settings)} settings={settings} busy={busy} onChoose={chooseFolder} onSave={saveSettings} />
            : <p className="empty-inline">{loading ? 'กำลังอ่านการตั้งค่า…' : 'เปิดการตั้งค่าไม่ได้'}</p>}
        </div>}
      </main>
    </div>
  );
}

export default App;
