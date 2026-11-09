import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { MAX_ORDERS, MAX_PM_ROWS, MAX_SEGMENTS, type Member, type Order, type PmRow, type Segment, type Trip, type WorkEntry } from '@pea/contracts';
import { calculateTrip, createRoute, createWorkEntries } from '@pea/core';
import { Field, Icon, money, Section } from './components';
import { Expenses } from './Expenses';

export const blankOrder: Order = { orderNo: '', work: '', location: '', pms: [] };
const blankSegment: Segment = { fromPlace: '', departDate: '', departTime: '', toPlace: '', arriveDate: '', arriveTime: '' };
const blankEntry: WorkEntry = { date: '', text: '', workNumber: '' };
type UpdateTrip = Dispatch<SetStateAction<Trip>>;
export type PmOptions = { costCenter: string; description: string; sourceDocumentId: string; fileName: string }[];
type Calculation = ReturnType<typeof calculateTrip>;

function ImportDesk({ onImport, disabled, fileNames, count }: {
  onImport: (files: File[]) => void;
  disabled: boolean;
  fileNames: string[];
  count: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  return (
    <section className={'intake' + (isDragging ? ' dragging' : '')} aria-label="นำเข้า PDF"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (!disabled) onImport(Array.from(event.dataTransfer.files));
      }}>
      <div className="intake-icon"><Icon name="upload" /></div>
      <div className="intake-copy">
        <h2>นำเข้าจาก PDF</h2>
        <p>ลากคำสั่งเดินทาง PEA-Life หรือใบสั่งซ่อม PM มาวางที่นี่</p>
        {fileNames.length > 0 && <p className="imported" title={fileNames.join(', ')}>{fileNames.join(' · ')}</p>}
        {count > 0 && <p className="imported">มีเลข PM ให้เลือก {count} รายการ</p>}
      </div>
      <input ref={input} type="file" accept=".pdf,application/pdf" multiple hidden aria-label="เลือกไฟล์ PDF"
        onChange={(event) => {
          onImport(Array.from(event.target.files ?? []));
          event.target.value = '';
        }} />
      <button type="button" className="button secondary" disabled={disabled} onClick={() => input.current?.click()}>เลือก PDF</button>
    </section>
  );
}

function Orders({ trip, update, pmOptions, totalPmDays }: { trip: Trip; update: UpdateTrip; pmOptions: PmOptions; totalPmDays: number }) {
  const pmCount = trip.orders.reduce((total, order) => total + order.pms.length, 0);
  const changeOrder = (index: number, patch: Partial<Order>) => {
    update((current) => ({ ...current, orders: current.orders.map((order, position) => position === index ? { ...order, ...patch } : order) }));
  };
  const changePm = (orderIndex: number, pmIndex: number, patch: Partial<PmRow>) => {
    const { pms } = trip.orders[orderIndex];
    changeOrder(orderIndex, { pms: pms.map((row, position) => position === pmIndex ? { ...row, ...patch } : row) });
  };
  return (
    <Section number="01" title="คำสั่งและศูนย์ต้นทุน" description="กรอกงานและสถานที่ครั้งเดียว แล้วเพิ่มเลข PM ภายใต้คำสั่งเดียวกัน"
      action={<span className="tag">รวม PM <strong>{totalPmDays}</strong> วัน</span>}>
      <div className="line-items">
        {trip.orders.map((order, index) => (
          <div className="line-item" key={index}>
            <div className="line-title"><span>คำสั่ง {String(index + 1).padStart(2, '0')}</span>
              <button className="icon-button remove" type="button" disabled={trip.orders.length === 1} aria-label={'ลบคำสั่งรายการ ' + (index + 1)}
                onClick={() => update((current) => ({ ...current, orders: current.orders.filter((_, position) => position !== index) }))}><Icon name="close" /></button>
            </div>
            <div className="fields grouped-order-fields">
              <Field label="เลขที่คำสั่ง" placeholder="TL26249743" value={order.orderNo} maxLength={32} onChange={(event) => changeOrder(index, { orderNo: event.target.value })} />
              <Field label="สถานที่" placeholder="เช่น กฟจ.ปัตตานี" value={order.location} maxLength={90} onChange={(event) => changeOrder(index, { location: event.target.value })} />
              <Field label="งานที่ทำ" className="full" placeholder="ระบุงานที่ได้รับมอบหมาย" value={order.work} maxLength={220} onChange={(event) => changeOrder(index, { work: event.target.value })} />
            </div>
            <div className="order-pms">
              <strong>เลข PM ของคำสั่งนี้</strong>
              {order.pms.map((pm, pmIndex) => {
                const source = pmOptions.find((option) => option.costCenter === pm.costCenter && option.sourceDocumentId === pm.sourceDocumentId)
                  ?? pmOptions.find((option) => option.costCenter === pm.costCenter);
                return <div className="pm-line" key={pmIndex}>
                  <div className="pm-fields">
                    <Field label="เลข PM / ศูนย์ต้นทุน" placeholder="พิมพ์เลขหรือเลือกจากคลัง" value={pm.costCenter} maxLength={40}
                      onChange={(event) => {
                        const costCenter = event.target.value;
                        const match = pmOptions.find((option) => option.costCenter === costCenter.trim());
                        changePm(index, pmIndex, { costCenter, sourceDocumentId: match?.sourceDocumentId });
                      }} />
                    <Field label="วันตัดงบ" type="number" min={0} max={366} step={1} value={pm.pmDays}
                      onChange={(event) => changePm(index, pmIndex, { pmDays: boundedInteger(event.target.value) ?? 0 })} />
                    <button className="icon-button remove" type="button" aria-label={'ลบ PM ' + (pmIndex + 1) + ' จากคำสั่ง ' + (index + 1)}
                      onClick={() => changeOrder(index, { pms: order.pms.filter((_, position) => position !== pmIndex) })}><Icon name="close" /></button>
                  </div>
                  {pmOptions.length > 0 && <label className="field">
                    <span>เลือก PM จากคลัง</span>
                    <select value={source ? source.sourceDocumentId + ':' + source.costCenter : ''} onChange={(event) => {
                      const selected = pmOptions.find((option) => option.sourceDocumentId + ':' + option.costCenter === event.target.value);
                      if (selected) changePm(index, pmIndex, { costCenter: selected.costCenter, sourceDocumentId: selected.sourceDocumentId });
                    }}>
                      <option value="">เลือกจากต้นฉบับที่เก็บไว้</option>
                      {pmOptions.map(({ costCenter, description, sourceDocumentId }) => <option key={sourceDocumentId + ':' + costCenter} value={sourceDocumentId + ':' + costCenter}>{costCenter} · {description}</option>)}
                    </select>
                  </label>}
                  {source && <p className="field-note" title={source.fileName}>ต้นฉบับ · {source.fileName}</p>}
                </div>;
              })}
              <button type="button" className="button secondary" disabled={pmCount >= MAX_PM_ROWS}
                onClick={() => changeOrder(index, { pms: [...order.pms, { costCenter: '', pmDays: 0 }] })}><Icon name="plus" />เพิ่ม PM</button>
            </div>
          </div>
        ))}
      </div>
      <div className="sheet-footer">
        <button type="button" className="button secondary" disabled={trip.orders.length >= MAX_ORDERS}
          onClick={() => update((current) => ({ ...current, orders: [...current.orders, { ...blankOrder, pms: [] }] }))}><Icon name="plus" />เพิ่มคำสั่ง</button>
        <span className="counter">{pmCount} / {MAX_PM_ROWS} PM</span>
      </div>
    </Section>
  );
}

const timeOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const hourOptions = timeOptions.slice(0, 24);

function TravelTime({ label, value, onChange }: { label: string; value: string; onChange: (time: string) => void }) {
  const match = /^(\d{1,2})[.:](\d{2})/.exec(value);
  const hour = match ? match[1].padStart(2, '0') : '';
  const minute = match?.[2] ?? '';

  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="travel-time">
        <select value={hour} aria-label={label + ' ชั่วโมง'} onChange={(event) => {
          const selected = event.target.value;
          onChange(selected ? selected + '.' + (minute || '00') : '');
        }}>
          <option value="">--</option>
          {hourOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <span aria-hidden="true">:</span>
        <select value={minute} aria-label={label + ' นาที'} disabled={!hour}
          onChange={(event) => onChange(hour + '.' + event.target.value)}>
          {!hour && <option value="">--</option>}
          {timeOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>
    </div>
  );
}

function Route({ trip, update, importedDates }: { trip: Trip; update: UpdateTrip; importedDates?: { departDate: string; returnDate: string } }) {
  const change = (index: number, patch: Partial<Segment>) => {
    update((current) => ({ ...current, travelSegments: current.travelSegments.map((segment, position) => position === index ? { ...segment, ...patch } : segment) }));
  };
  const generate = () => {
    if (trip.travelSegments.length && !window.confirm('สร้างตารางเดินทางใหม่แทนตารางปัจจุบันหรือไม่?')) return;
    update((current) => {
      const departDate = current.travelSegments[0]?.departDate || importedDates?.departDate || '';
      const returnDate = current.travelSegments.at(-1)?.arriveDate || importedDates?.returnDate || '';
      return { ...current, travelSegments: createRoute(current.orders, departDate, returnDate) };
    });
  };
  return (
    <Section number="02" title="ตารางเดินทาง" description="จำนวนวันและคืนคำนวณจากวันออกเดินทางถึงวันกลับ"
      action={<button type="button" className="button secondary" onClick={generate} disabled={!trip.orders.some(({ location }) => location.trim())}>
        <Icon name="route" />สร้างตารางไป–กลับ</button>}>
      {!trip.travelSegments.length && <p className="empty-inline">ระบุสถานที่ในคำสั่งเพื่อสร้างเส้นทางจาก ฝปบ. หรือเพิ่มช่วงเดินทางเอง</p>}
      <div className="line-items">
        {trip.travelSegments.map((segment, index) => (
          <div className="line-item" key={index}>
            <div className="line-title"><span>ช่วงเดินทาง {String(index + 1).padStart(2, '0')}</span>
              <button className="icon-button remove" type="button" aria-label={'ลบช่วงเดินทาง ' + (index + 1)}
                onClick={() => update((current) => ({ ...current, travelSegments: current.travelSegments.filter((_, position) => position !== index) }))}><Icon name="close" /></button>
            </div>
            <div className="fields route-fields">
              <Field label="ออกจาก" value={segment.fromPlace} maxLength={90} onChange={(event) => change(index, { fromPlace: event.target.value })} />
              <Field label="วันที่ออก" type="date" value={segment.departDate} onChange={(event) => change(index, { departDate: event.target.value })} />
              <TravelTime label="เวลาออก" value={segment.departTime} onChange={(departTime) => change(index, { departTime })} />
              <Field label="ถึง" value={segment.toPlace} maxLength={90} onChange={(event) => change(index, { toPlace: event.target.value })} />
              <Field label="วันที่ถึง" type="date" value={segment.arriveDate} onChange={(event) => change(index, { arriveDate: event.target.value })} />
              <TravelTime label="เวลาถึง" value={segment.arriveTime} onChange={(arriveTime) => change(index, { arriveTime })} />
            </div>
          </div>
        ))}
      </div>
      <div className="sheet-footer">
        <button type="button" className="button secondary" disabled={trip.travelSegments.length >= MAX_SEGMENTS}
          onClick={() => update((current) => {
            const previous = current.travelSegments.at(-1);
            const segment = { ...blankSegment, fromPlace: previous?.toPlace ?? '', departDate: previous?.arriveDate ?? '' };
            return { ...current, travelSegments: [...current.travelSegments, segment] };
          })}><Icon name="plus" />เพิ่มช่วงเดินทาง</button>
        <span className="counter">{trip.travelSegments.length} / {MAX_SEGMENTS} ช่วง</span>
      </div>
    </Section>
  );
}

function boundedInteger(value: string, max = 366) {
  if (value === '' || !Number.isFinite(Number(value))) return undefined;
  return Math.min(max, Math.max(0, Math.trunc(Number(value))));
}

function Participants({ trip, team, update, calculation }: { trip: Trip; team: Member[]; update: UpdateTrip; calculation: Calculation }) {
  const change = (memberId: string, patch: Partial<Omit<Trip['participants'][number], 'memberId'>>) => {
    update((current) => ({
      ...current,
      participants: current.participants.some((person) => person.memberId === memberId)
        ? current.participants.map((person) => person.memberId === memberId ? { ...person, ...patch } : person)
        : [...current.participants, { memberId, selected: false, ...patch }],
    }));
  };
  const overrides: { key: 'customDays' | 'customNights' | 'customBudgetDays'; label: string; base: number }[] = [
    { key: 'customDays', label: 'วันเบี้ยเลี้ยง', base: calculation.tripDays },
    { key: 'customNights', label: 'คืนพัก', base: calculation.tripNights },
    { key: 'customBudgetDays', label: 'วันตัดงบ', base: calculation.totalPmDays },
  ];
  const differences = calculation.people.filter((person) => person.dayDifference !== 0);
  return (
    <Section number="03" title="ผู้ร่วมเดินทาง" description="เว้นช่องวันและคืนว่างเพื่อใช้ค่าตามตารางเดินทางและยอดรวม PM"
      action={<span className="tag">เลือกแล้ว <strong>{calculation.people.length}</strong> คน</span>}>
      <div className="participant-list">
        {team.map((member) => {
          const participant = trip.participants.find((person) => person.memberId === member.id);
          const person = calculation.people.find((item) => item.member.id === member.id);
          return (
            <div className={'participant' + (person ? ' selected' : '')} key={member.id}>
              <label className="participant-choice">
                <input type="checkbox" checked={participant?.selected ?? false} onChange={(event) => change(member.id, { selected: event.target.checked })} />
                <span><strong>{member.name}</strong><small>{member.nickname} · {member.id} · {member.position}</small></span>
              </label>
              {person && <>
                <div className="fields override-fields">
                  {overrides.map(({ key, label, base }) => <Field key={key} label={label} aria-label={label + ' ' + member.nickname}
                    type="number" min={0} max={366} step={1} value={participant?.[key] ?? ''} placeholder={String(base)}
                    onChange={(event) => change(member.id, { [key]: boundedInteger(event.target.value) })} />)}
                </div>
                <dl className="person-totals">
                  <div><dt>ใบเคลีย</dt><dd>{money.format(person.clearTotal)} ฿</dd></div>
                  <div><dt>ใบตัดงบ</dt><dd>{money.format(person.budgetTotal)} ฿</dd></div>
                </dl>
              </>}
            </div>
          );
        })}
      </div>
      {differences.length > 0 && (
        <div className="advisory" aria-live="polite"><Icon name="info" /><div><strong>วันใบเคลียและวันรวม PM ต่างกัน</strong>
          {differences.map(({ member, effectiveDays, totalPmDays, dayDifference }) => (
            <p key={member.id}>{member.nickname} · จำนวนวันในใบเคลีย ({effectiveDays} วัน) ต่างจากจำนวนวันรวมที่ตัดงบ PM ({totalPmDays} วัน) ส่วนต่าง {dayDifference} วัน</p>
          ))}
        </div></div>
      )}
    </Section>
  );
}

const documentFields = [
  { key: 'orderDate', label: 'วันที่อนุมัติคำสั่ง', type: 'date' },
  { key: 'documentDate', label: 'วันที่เอกสาร', type: 'date' },
  { key: 'vehicle', label: 'พาหนะ / ทะเบียนรถ', maxLength: 100 },
  { key: 'toWhom', label: 'เรียน', maxLength: 60 },
  { key: 'budgetType', label: 'งบ', maxLength: 40 },
  { key: 'workNumber', label: 'หมายเลขงาน', maxLength: 40 },
  { key: 'departmentCode', label: 'รหัสแผนก', maxLength: 30 },
  { key: 'office', label: 'กอง / สำนักงาน', maxLength: 65 },
  { key: 'voucherNo', label: 'เลขที่ใบสำคัญจ่ายเงิน', maxLength: 32 },
  { key: 'officeNo', label: 'เลขที่ ตจ. / กฟฟ.', maxLength: 32 },
  { key: 'budgetControllerName', label: 'ชื่อผู้ควบคุมงบ', maxLength: 65 },
  { key: 'budgetControllerPosition', label: 'ตำแหน่งผู้ควบคุมงบ', maxLength: 65 },
] satisfies { key: keyof Trip; label: string; type?: string; maxLength?: number }[];

function DocumentDetails({ trip, update }: { trip: Trip; update: UpdateTrip }) {
  return (
    <Section number="04" title="รายละเอียดเอกสาร" description="เว้นวันที่เอกสารว่างเพื่อใช้วันที่เดินทางกลับ">
      <div className="fields two-fields padded">
        {documentFields.map(({ key, label, type, maxLength }) => (
          <Field key={key} label={label} type={type} maxLength={maxLength} value={trip[key]}
            onChange={(event) => update((current) => ({ ...current, [key]: event.target.value }))} />
        ))}
        <Field label="จำนวนเอกสารแนบ" type="number" min={0} max={100} step={1} value={trip.attachments ?? ''}
          onChange={(event) => update((current) => ({ ...current, attachments: boundedInteger(event.target.value, 100) }))} />
        <label className="flight"><input type="checkbox" checked={trip.flew}
          onChange={(event) => update((current) => ({ ...current, flew: event.target.checked }))} />เดินทางโดยเครื่องบิน</label>
        <label className="field full"><span>หมายเหตุ</span><textarea value={trip.note} rows={2} maxLength={250}
          onChange={(event) => update((current) => ({ ...current, note: event.target.value }))} /></label>
      </div>
    </Section>
  );
}

function WorkEntries({ trip, update, entries }: { trip: Trip; update: UpdateTrip; entries: WorkEntry[] }) {
  const edit = (modify: (rows: WorkEntry[]) => WorkEntry[]) => {
    update((current) => ({ ...current, workEntries: modify(current.workEntries ?? createWorkEntries(current)) }));
  };
  return (
    <Section number="05" title="รายการปฏิบัติงาน"
      description={trip.workEntries ? 'ใช้รายการที่แก้ไขในทริปนี้' : 'สร้างอัตโนมัติจากตารางเดินทาง แก้ข้อความก่อนส่งออกได้'}
      action={trip.workEntries && <button type="button" className="button secondary" onClick={() => {
        if (window.confirm('แทนที่รายการที่แก้ไขด้วยรายการจากตารางเดินทางหรือไม่?')) update((current) => ({ ...current, workEntries: undefined }));
      }}>ใช้รายการอัตโนมัติ</button>}>
      {!entries.length && <p className="empty-inline">เมื่อมีตารางเดินทาง รายการปฏิบัติงานจะแสดงที่นี่</p>}
      <div className="line-items">
        {entries.map((entry, index) => {
          const change = (patch: Partial<WorkEntry>) => edit((rows) => rows.map((row, position) => position === index ? { ...row, ...patch } : row));
          return (
            <div className="line-item" key={index}>
              <div className="line-title"><span>รายการ {String(index + 1).padStart(2, '0')}</span>
                <button className="icon-button remove" type="button" aria-label={'ลบรายการปฏิบัติงาน ' + (index + 1)}
                  onClick={() => edit((rows) => rows.filter((_, position) => position !== index))}><Icon name="close" /></button>
              </div>
              <div className="fields two-fields">
                <Field label="วัน / เดือน / ปี" value={entry.date} maxLength={30} onChange={(event) => change({ date: event.target.value })} />
                <Field label="หมายเลขงาน" value={entry.workNumber} maxLength={40} onChange={(event) => change({ workNumber: event.target.value })} />
                <label className="field full"><span>รายการปฏิบัติงาน</span><textarea value={entry.text} rows={2} maxLength={400}
                  onChange={(event) => change({ text: event.target.value })} /></label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="sheet-footer">
        <button type="button" className="button secondary" disabled={entries.length >= 20} onClick={() => edit((rows) => [...rows, { ...blankEntry }])}>
          <Icon name="plus" />เพิ่มรายการ</button>
        <span className="counter">{entries.length} / 20 รายการ</span>
      </div>
    </Section>
  );
}

export function TripEditor({ trip, team, update, calculation, pmOptions, importNames, importedDates, onImport, busy }: {
  trip: Trip;
  team: Member[];
  update: UpdateTrip;
  calculation: Calculation;
  pmOptions: PmOptions;
  importNames: string[];
  importedDates?: { departDate: string; returnDate: string };
  onImport: (files: File[]) => void;
  busy: boolean;
}) {
  return (
    <fieldset className="editor" disabled={busy} aria-label="ข้อมูลทริป">
      <ImportDesk onImport={onImport} disabled={busy} fileNames={importNames} count={pmOptions.length} />
      <Orders trip={trip} update={update} pmOptions={pmOptions} totalPmDays={calculation.totalPmDays} />
      <Route trip={trip} update={update} importedDates={importedDates} />
      <Participants trip={trip} team={team} update={update} calculation={calculation} />
      <DocumentDetails trip={trip} update={update} />
      <WorkEntries trip={trip} update={update} entries={calculation.workEntries} />
      <Expenses trip={trip} team={team} update={update} />
    </fieldset>
  );
}
