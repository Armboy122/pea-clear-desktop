import type { Dispatch, SetStateAction } from 'react';
import { MAX_EXTRA_EXPENSES, type ExtraExpense, type Member, type Trip } from '@pea/contracts';
import { addMoney } from '@pea/core';
import { Field, Icon, money, Section } from './components';

const amount = (value: number) => Number.isFinite(value) ? Math.min(100000, Math.max(0, Math.round(value * 100) / 100)) : 0;

export function Expenses({ trip, team, update }: { trip: Trip; team: Member[]; update: Dispatch<SetStateAction<Trip>> }) {
  const rows = trip.extraExpenses ?? [];
  const people = team.filter((member) => trip.participants.some(({ memberId, selected }) => member.id === memberId && selected));
  const costCenters = [...new Set(trip.orders.flatMap(({ pms }) => pms.map(({ costCenter }) => costCenter.trim())).filter(Boolean))];
  const mutate = (fn: (expenses: ExtraExpense[]) => ExtraExpense[]) => update((current) => ({ ...current, extraExpenses: fn(current.extraExpenses ?? []) }));
  const change = (id: string, patch: Partial<ExtraExpense>) => mutate((current) => current.map((expense) => expense.id === id ? { ...expense, ...patch } : expense));

  return <Section number="06" title="ค่าใช้จ่ายเพิ่มเติม" description="เพิ่มค่าใช้จ่ายรายคน เช่น ค่าน้ำ กรอกภาษีตามหลักฐานและแบ่งยอดให้ PM ที่ใช้จริง">
    {!rows.length && <p className="empty-inline">{people.length ? 'ยังไม่มีค่าใช้จ่ายเพิ่มเติม' : 'เลือกผู้ร่วมเดินทางก่อนเพิ่มค่าใช้จ่าย'}</p>}
    {rows.map((expense, index) => {
      const { id, allocations } = expense;
      const remainingNet = addMoney(expense.net, ...allocations.map(({ net }) => -net));
      const remainingVat = addMoney(expense.vat, ...allocations.map(({ vat }) => -vat));
      const nextCenter = costCenters.find((code) => !allocations.some(({ costCenter }) => costCenter === code));
      const changeAllocation = (position: number, patch: Partial<ExtraExpense['allocations'][number]>) => {
        change(id, { allocations: allocations.map((row, i) => i === position ? { ...row, ...patch } : row) });
      };
      return <div className="line-item expense-item" key={id}>
        <div className="line-title"><span>ค่าใช้จ่าย {String(index + 1).padStart(2, '0')}</span>
          <button type="button" className="icon-button remove" aria-label={'ลบค่าใช้จ่าย ' + (index + 1)}
            onClick={() => mutate((current) => current.filter((item) => item.id !== id))}><Icon name="close" /></button>
        </div>
        <div className="fields two-fields">
          <label className="field"><span>ผู้เบิก</span><select value={expense.memberId} onChange={(event) => change(id, { memberId: event.target.value })}>
            {!people.some((member) => member.id === expense.memberId) && <option value={expense.memberId}>{expense.memberId} · กรุณาเลือกผู้เบิก</option>}
            {people.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <Field label="วันที่หลักฐาน" type="date" value={expense.date} onChange={(event) => change(id, { date: event.target.value })} />
          <Field label="รายละเอียด" className="full" placeholder="เช่น ค่าน้ำ" value={expense.description} maxLength={160} onChange={(event) => change(id, { description: event.target.value })} />
          <Field label="เลขที่หลักฐาน" value={expense.receiptNo} maxLength={60} onChange={(event) => change(id, { receiptNo: event.target.value })} />
          <Field label="รหัสบัญชี" inputMode="numeric" value={expense.accountCode} maxLength={8} onChange={(event) => change(id, { accountCode: event.target.value })} />
          <Field label="ก่อนภาษี (บาท)" type="number" min={0} step="0.01" value={expense.net} onChange={(event) => change(id, { net: amount(event.target.valueAsNumber) })} />
          <Field label="ภาษี (บาท)" type="number" min={0} step="0.01" value={expense.vat} onChange={(event) => change(id, { vat: amount(event.target.valueAsNumber) })} />
          <label className="field full"><span>ภาษีซื้อ</span><select value={expense.vatCredit ? 'credit' : 'no-credit'} onChange={(event) => change(id, { vatCredit: event.target.value === 'credit' })}>
            <option value="no-credit">ไม่เครดิต</option><option value="credit">เครดิต</option>
          </select></label>
        </div>
        <div className="expense-allocations">
          <strong>แบ่งยอดตาม PM</strong>
          {allocations.map((row, position) => <div className="allocation-fields" key={position}>
            <label className="field"><span>เลข PM</span><select value={row.costCenter} onChange={(event) => changeAllocation(position, { costCenter: event.target.value })}>
              {!costCenters.includes(row.costCenter) && <option value={row.costCenter}>{row.costCenter || 'เลือก PM'}</option>}
              {costCenters.filter((code) => code === row.costCenter || !allocations.some(({ costCenter }) => costCenter === code)).map((code) => <option key={code}>{code}</option>)}
            </select></label>
            <Field label="ก่อนภาษี" type="number" min={0} step="0.01" value={row.net} onChange={(event) => changeAllocation(position, { net: amount(event.target.valueAsNumber) })} />
            <Field label="ภาษี" type="number" min={0} step="0.01" value={row.vat} onChange={(event) => changeAllocation(position, { vat: amount(event.target.valueAsNumber) })} />
            <button type="button" className="icon-button remove" aria-label={'ลบการจัดสรร PM ' + (position + 1)}
              onClick={() => change(id, { allocations: allocations.filter((_, i) => i !== position) })}><Icon name="close" /></button>
          </div>)}
          <button type="button" className="button secondary" disabled={!nextCenter} onClick={() => {
            if (nextCenter) change(id, { allocations: [...allocations, { costCenter: nextCenter, net: Math.max(0, remainingNet), vat: Math.max(0, remainingVat) }] });
          }}><Icon name="plus" />เพิ่มการจัดสรร PM</button>
          <p className="field-note" aria-live="polite">ส่วนต่างก่อนภาษี {money.format(remainingNet)} บาท · ส่วนต่างภาษี {money.format(remainingVat)} บาท</p>
        </div>
      </div>;
    })}
    <div className="sheet-footer"><button type="button" className="button secondary" disabled={!people.length || rows.length >= MAX_EXTRA_EXPENSES}
      onClick={() => mutate((current) => [...current, {
        id: crypto.randomUUID(), memberId: people[0].id, date: '', accountCode: '', description: '',
        receiptNo: '', net: 0, vat: 0, vatCredit: false, allocations: [],
      }])}><Icon name="plus" />เพิ่มค่าใช้จ่าย</button>
      <span className="counter">{rows.length} / {MAX_EXTRA_EXPENSES} รายการ</span></div>
  </Section>;
}
