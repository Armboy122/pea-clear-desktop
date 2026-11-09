import { useRef, useState } from 'react';
import type { DocumentRecord, DocumentStatus, ExportFiles, Trip } from '@pea/contracts';
import { Icon } from './components';

const names = { travel: 'คำสั่ง PEA-Life', pm: 'ใบ PM', attachment: 'เอกสารแนบ' };
const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });

export function linkedDocumentIds(trip: Trip): string[] {
  const sources = trip.orders.flatMap((order) => [order.sourceDocumentId, ...order.pms.map((pm) => pm.sourceDocumentId)]);
  return [...new Set([...(trip.documentIds ?? []), ...sources.filter((id) => id !== undefined)])];
}

function checklistSources(trip: Trip, library: DocumentRecord[]) {
  const ids = new Set(linkedDocumentIds(trip));
  const linked = library.filter((record) => ids.has(record.id));
  const orders = [...new Set(trip.orders.map((order) => order.orderNo).filter(Boolean))];
  const pmCodes = [...new Set(trip.orders.flatMap((order) => order.pms.map((pm) => pm.costCenter)).filter(Boolean))];
  const archivedOrders = new Set(linked.flatMap(({ data }) => data.kind === 'travel' ? [data.orderNo] : []));
  const archivedPms = new Set(linked.flatMap(({ data }) => data.kind === 'pm' ? data.options.map((option) => option.costCenter) : []));
  return {
    linked, orders, pmCodes, missingOrders: orders.filter((order) => !archivedOrders.has(order)),
    missingPms: pmCodes.filter((code) => !archivedPms.has(code)),
  };
}

export function Documents({ trip, library, status, files, busy, onOpen, onFolder, onUse, onImport, onRestricted, onDetach }: {
  trip: Trip;
  library: DocumentRecord[];
  status?: DocumentStatus;
  files?: ExportFiles;
  busy: boolean;
  onOpen: (id: string) => void;
  onFolder: (folder: string) => void;
  onUse: (record: DocumentRecord) => void;
  onImport: (files: File[], attachment?: boolean) => void;
  onRestricted: (required: boolean) => void;
  onDetach: (id: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const attachmentUpload = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const { linked, orders, pmCodes, missingOrders, missingPms } = checklistSources(trip, library);
  const attachments = linked.filter(({ data }) => data.kind === 'attachment');
  const filtered = library.filter(({ fileName, data }) => [
    fileName, names[data.kind], data.kind === 'travel' ? data.orderNo : '',
    ...(data.kind === 'pm' ? data.options.map(({ costCenter, description }) => costCenter + ' ' + description) : []),
  ].some((text) => text.toLowerCase().includes(filter.trim().toLowerCase())));
  const pmFiles = linked.filter(({ data }) => data.kind === 'pm');
  const travelFiles = linked.filter(({ data }) => data.kind === 'travel');
  const itemRows = [
    { label: 'ใบเคลีย', result: status?.clear ? 'มีไฟล์ชุดส่งออกล่าสุด' : 'ยังไม่มีไฟล์ชุดส่งออก', ready: status?.clear, sources: [] },
    { label: 'ใบตัดงบ', result: status?.budget ? 'มีไฟล์ชุดส่งออกล่าสุด' : 'ยังไม่มีไฟล์ชุดส่งออก', ready: status?.budget, sources: [] },
    { label: 'ใบ PM', result: pmCodes.length ? missingPms.length ? 'ยังขาดต้นฉบับสำหรับ ' + missingPms.join(', ') : 'มีต้นฉบับครบทุกเลข PM' : 'ยังไม่ได้ระบุเลข PM ในทริป', ready: Boolean(pmCodes.length && !missingPms.length), sources: pmFiles },
    { label: 'คำสั่ง PEA-Life', result: orders.length ? missingOrders.length ? 'ยังขาดต้นฉบับสำหรับ ' + missingOrders.join(', ') : 'มีต้นฉบับครบทุกคำสั่ง' : 'ยังไม่ได้ระบุเลขคำสั่งในทริป', ready: Boolean(orders.length && !missingOrders.length), sources: travelFiles },
    { label: 'เอกสารแนบพื้นที่ห้ามเบิก', result: attachments.length ? 'แนบแล้ว ' + attachments.length + ' ไฟล์' : trip.requiresRestrictedAttachment ? 'ยังขาดเอกสารแนบ' : 'ไม่ต้องใช้ในทริปนี้', ready: Boolean(attachments.length || !trip.requiresRestrictedAttachment), sources: attachments },
  ];
  return (
    <div className="records-panel documents-panel">
      <header className="records-heading">
        <div><h1>เช็กลิสต์เอกสาร</h1><p>{orders.join(', ') || 'ทริปที่กำลังจัดทำ'} · ตรวจชุดส่งออกและต้นฉบับที่เชื่อมกับทริป</p></div>
        {files && (status?.clear || status?.budget) && <button className="button secondary" type="button" onClick={() => onFolder(files.folder)} disabled={busy}><Icon name="folder" />เปิดชุดส่งออก</button>}
      </header>
      <ul className="checklist">
        {itemRows.map(({ label, result, ready, sources }, index) => (
          <li key={label} className={ready ? 'ready' : undefined}>
            <span className="index">0{index + 1}</span>
            <div>
              <strong>{label}</strong>
              <p>{result}</p>
              {sources.map((source) => <div className="document-source" key={source.id}>
                <button type="button" className="text-button" disabled={busy} onClick={() => onOpen(source.id)}>{source.fileName} <Icon name="arrow" /></button>
                {source.data.kind === 'attachment' && <button type="button" className="text-button danger" onClick={() => onDetach(source.id)} disabled={busy}>ยกเลิกการแนบ</button>}
              </div>)}
              {index === 4 && <label className="restricted-check"><input type="checkbox" checked={trip.requiresRestrictedAttachment ?? false} disabled={busy}
                onChange={(event) => onRestricted(event.target.checked)} /> ทริปนี้อยู่ในพื้นที่ห้ามเบิกและต้องใช้เอกสารแนบ</label>}
            </div>
            <span className="tag">{ready ? index === 4 && !attachments.length ? 'ไม่ต้องใช้' : 'ครบ' : 'ขาด'}</span>
          </li>
        ))}
      </ul>
      <div className="records-heading library-heading">
        <div><h2>คลังเอกสาร</h2><p>ต้นฉบับเก็บในเครื่องและเลือกใช้ซ้ำกับทริปอื่นได้</p></div>
        <div className="record-actions">
          <input hidden type="file" multiple accept=".pdf,application/pdf" ref={upload} onChange={(event) => {
            onImport(Array.from(event.target.files ?? []));
            event.target.value = '';
          }} />
          <input hidden type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" ref={attachmentUpload} onChange={(event) => {
            onImport(Array.from(event.target.files ?? []), true);
            event.target.value = '';
          }} />
          <button type="button" className="button secondary" onClick={() => upload.current?.click()} disabled={busy}><Icon name="upload" />นำเข้า PEA-Life / PM</button>
          <button type="button" className="button secondary" onClick={() => attachmentUpload.current?.click()} disabled={busy}><Icon name="plus" />แนบ PDF หรือรูป</button>
        </div>
      </div>
      <label className="field library-search"><span>ค้นหาเอกสารจากชื่อไฟล์ เลขที่คำสั่ง หรือเลข PM</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
      {!filtered.length && <p className="empty-inline">{library.length ? 'ไม่พบเอกสารที่ค้นหา' : 'ยังไม่มีเอกสารในคลัง'}</p>}
      <ul className="record-list">
        {filtered.map((record) => {
          const { id, data, importedAt, fileName } = record;
          const attached = linked.some((entry) => entry.id === id);
          return <li className="record" key={id}>
            <span className="index"><Icon name="file" /></span>
            <div className="record-copy">
              <h3>{fileName}</h3>
              <p>{names[data.kind]} · {dateFormat.format(new Date(importedAt))}</p>
              {data.kind === 'travel' && <small>{data.orderNo} · {data.location}</small>}
              {data.kind === 'pm' && <details className="pm-source"><summary>ดู {data.options.length} เลข PM ในต้นฉบับ</summary>
                <ul>{data.options.map(({ costCenter, description }) => <li key={costCenter}>{costCenter} · {description}</li>)}</ul></details>}
            </div>
            <div className="record-actions">
              <button className="button secondary" type="button" onClick={() => onOpen(id)} disabled={busy}>เปิดต้นฉบับ</button>
              <button className="button secondary" type="button" onClick={() => onUse(record)} disabled={busy || attached}>
                {attached ? 'อยู่ในทริปนี้' : data.kind === 'travel' ? 'ใช้คำสั่งนี้' : 'ใช้กับทริปนี้'}
              </button>
            </div>
          </li>;
        })}
      </ul>
    </div>
  );
}
