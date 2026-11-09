import { useState } from 'react';
import type { HistoryEntry, Member, Settings } from '@pea/contracts';
import { formatThaiDate } from '@pea/core';
import { Field, Icon, Section } from './components';

const historyDate = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export function History({ entries, busy, onOpen, onFolder, onNew }: {
  entries: HistoryEntry[];
  busy: boolean;
  onOpen: (entry: HistoryEntry) => void;
  onFolder: (folder: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="records-panel" aria-labelledby="history-heading">
      <header className="records-heading"><div><h1 id="history-heading">ประวัติทริป</h1><p>เปิดทริปที่บันทึกไว้เพื่อแก้ไขหรือส่งออกอีกครั้ง</p></div>
        <span className="tag"><strong>{entries.length}</strong> ทริป</span>
      </header>
      {!entries.length ? (
        <div className="records-empty"><Icon name="archive" /><h2>ยังไม่มีทริปที่บันทึก</h2>
          <p>ทริปจะปรากฏที่นี่หลังจากบันทึกหรือส่งออกชุดเอกสาร</p>
          <button type="button" className="button secondary" onClick={onNew} disabled={busy}>กลับไปที่ทริป <Icon name="arrow" /></button>
        </div>
      ) : (
        <ul className="record-list">
          {entries.map((entry, index) => {
            const { trip, files, updatedAt } = entry;
            const order = [...new Set(trip.orders.map((item) => item.orderNo).filter(Boolean))].join(', ');
            const places = [...new Set(trip.orders.map((item) => item.location).filter(Boolean))].join(', ');
            const start = formatThaiDate(trip.travelSegments[0]?.departDate ?? '');
            const end = formatThaiDate(trip.travelSegments.at(-1)?.arriveDate ?? '');
            const dates = [...new Set([start, end].filter(Boolean))].join(' ถึง ');
            return (
              <li className="record" key={trip.id}>
                <span className="index">{String(index + 1).padStart(2, '0')}</span>
                <div className="record-copy">
                  <h2>{order || 'ทริปยังไม่มีเลขที่คำสั่ง'}</h2>
                  {places && <p>{places}</p>}
                  <p>{dates || 'ยังไม่ได้ระบุช่วงเดินทาง'} · {trip.participants.filter((person) => person.selected).length} คน</p>
                  <small>บันทึก {historyDate.format(new Date(updatedAt))}</small>
                </div>
                <div className="record-actions">
                  {files && <button type="button" className="button secondary" disabled={busy} onClick={() => onFolder(files.folder)}><Icon name="folder" />Finder</button>}
                  <button type="button" className="button secondary" disabled={busy} onClick={() => onOpen(entry)}>เปิดทริป <Icon name="arrow" /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const identityFields = [
  { key: 'name', label: 'ชื่อและนามสกุล', maxLength: 65 },
  { key: 'nickname', label: 'ชื่อเล่น', maxLength: 23 },
  { key: 'id', label: 'รหัสพนักงาน', maxLength: 6 },
  { key: 'position', label: 'ตำแหน่ง', maxLength: 40 },
  { key: 'department', label: 'สังกัด', maxLength: 50 },
  { key: 'phone', label: 'เบอร์ภายใน', maxLength: 30 },
] satisfies { key: keyof Member; label: string; maxLength: number }[];

const rateFields = [
  { key: 'dailyAllowanceRate', label: 'เบี้ยเลี้ยง / วัน' },
  { key: 'extraAllowanceRate', label: 'ส่วนเพิ่ม / วัน' },
  { key: 'flatHotelRate', label: 'ค่าที่พัก / คืน' },
] satisfies { key: keyof Member; label: string }[];

const blankMember: Member = { id: '', name: '', nickname: '', position: '', department: '', phone: '',
  dailyAllowanceRate: 270, extraAllowanceRate: 30, flatHotelRate: 650 };

export function SettingsEditor({ settings, busy, onChoose, onSave }: {
  settings: Settings;
  busy: boolean;
  onChoose: () => Promise<string | undefined>;
  onSave: (draft: Settings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const change = (index: number, patch: Partial<Member>) => setDraft((current) => ({
    ...current, team: current.team.map((member, position) => index === position ? { ...member, ...patch } : member),
  }));
  return (
    <form className="settings-panel" onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
      <header className="records-heading"><div><h1>ตั้งค่า</h1><p>แก้รายชื่อทีม อัตราเหมาจ่าย และโฟลเดอร์ส่งออกเริ่มต้น</p></div>
        <button type="submit" className="button primary" disabled={busy || draft === settings}><Icon name="save" />บันทึกการตั้งค่า</button>
      </header>
      <fieldset className="editor" disabled={busy} aria-label="ตั้งค่าแอป">
        <Section number="01" title="โฟลเดอร์ส่งออก" description="ระบบสร้างโฟลเดอร์เดือนและช่วงวันเดินทางภายในพาธนี้">
          <div className="settings-folder padded">
            <Field label="พาธโฟลเดอร์เริ่มต้น" value={draft.exportRoot} maxLength={4096} required
              onChange={(event) => setDraft((current) => ({ ...current, exportRoot: event.target.value }))} />
            <button type="button" className="button secondary" onClick={() => {
              void onChoose().then((folder) => { if (folder) setDraft((current) => ({ ...current, exportRoot: folder })); });
            }}><Icon name="folder" />เลือกโฟลเดอร์</button>
          </div>
        </Section>
        <Section number="02" title="สมาชิกและอัตราเหมาจ่าย" description="อัตราทั้งหมดเป็นบาท รายชื่อและอัตรานี้ใช้กับทริปใหม่"
          action={<span className="tag"><strong>{draft.team.length}</strong> คน</span>}>
          <div className="settings-team">
            {draft.team.map((member, index) => (
              <details className="member-settings" key={index}>
                <summary><span className="index">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{member.name || 'สมาชิกใหม่'}</strong><span>{member.id || 'ยังไม่มีรหัส'}</span>
                </summary>
                <div className="fields member-fields">
                  {identityFields.map(({ key, label, maxLength }) => <Field key={key} label={label} maxLength={maxLength}
                    value={member[key]} inputMode={key === 'id' ? 'numeric' : undefined}
                    onChange={(event) => change(index, { [key]: event.target.value })} />)}
                  {rateFields.map(({ key, label }) => <Field key={key} label={label} type="number" min={0} max={100000} step={0.01}
                    value={member[key]} onChange={(event) => change(index, { [key]: event.target.valueAsNumber || 0 })} />)}
                </div>
                <div className="member-footer">
                  <button className="text-button danger" type="button" disabled={draft.team.length <= 1}
                    onClick={() => setDraft((current) => ({ ...current, team: current.team.filter((_, position) => position !== index) }))}><Icon name="close" />นำออกจากทีม</button>
                </div>
              </details>
            ))}
          </div>
          <div className="sheet-footer"><button type="button" className="button secondary" disabled={draft.team.length >= 30}
            onClick={() => setDraft((current) => ({ ...current, team: [...current.team, { ...blankMember }] }))}><Icon name="plus" />เพิ่มสมาชิก</button></div>
        </Section>
      </fieldset>
    </form>
  );
}
