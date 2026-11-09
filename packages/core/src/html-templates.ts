import { ALLOWANCE_ACCOUNT, HOTEL_ACCOUNT, MAX_PM_ROWS, MAX_SEGMENTS, type DocumentKind, type Trip } from '@pea/contracts'
import type { PersonCalculation } from './calculator'
import { formatThaiDate, formatThaiShortDate } from './dates'

type PrintAssets = {
  css: string
  fontRegular: string
  fontBold: string
  logo: string
}

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateLine = '......../......../........'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function text(value: string | number | undefined | null): string {
  return escapeHtml(String(value ?? '').replace(/รอยืนยันข้อมูล|\bfalse\b/giu, ''))
}

function shortDate(value?: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && value
    ? formatThaiShortDate(value)
    : value ?? ''
}

function clockTime(value?: string): string {
  return value?.trim().replace(/\s*น\.?$/u, '').replace(':', '.') ?? ''
}

function displayTime(value?: string): string {
  const time = clockTime(value)
  return time ? `${time} น.` : ''
}

function field(label: string, value?: string | number, className = ''): string {
  return `<span class="field ${className}"><span class="field-label">${label}</span><span class="entry">${text(value)}</span></span>`
}

function accountBoxes(code = ''): string {
  return `<span class="account-boxes" aria-label="${code}">${Array.from(
    { length: 8 },
    (_, index) => `<span>${code[index] ?? ''}</span>`,
  ).join('')}</span>`
}

function voucherHeader(trip: Trip, person: PersonCalculation, logo: string): string {
  const { member } = person
  const first = trip.travelSegments[0]
  const last = trip.travelSegments.at(-1)
  return `<header class="voucher-header">
    <div class="voucher-emblem">
      <img src="${escapeHtml(logo)}" alt="ตราการไฟฟ้าส่วนภูมิภาค">
      <div>ใบสำคัญจ่ายเงิน</div>
      <div>ค่าใช้จ่ายในการเดินทางไปปฏิบัติงาน</div>
      <div>และรายงานการเดินทาง</div>
    </div>
    <div class="voucher-fields">
      <div class="form-line identifiers">
        ${field('เลขที่', trip.voucherNo)}
        ${field('เลขที่ ตจ./กฟฟ', trip.officeNo)}
        ${field('งบ', trip.budgetType)}
        ${field('หมายเลขงาน', trip.workNumber)}
      </div>
      <div class="form-line claimant">
        ${field('ชื่อผู้เบิก', member.name, 'claimant-name')}
        ${field('เลขประจำตัว', member.id, 'claimant-id')}
        ${field('ตำแหน่ง', member.position, 'claimant-position')}
        ${field('สังกัด', member.department, 'claimant-department')}
        ${field('รหัสแผนก', trip.departmentCode, 'claimant-code')}
      </div>
      <div class="form-line recipient">${field('เรียน', trip.toWhom)}</div>
      <div class="form-line order">
        ${field('ตามคำสั่ง/อนุมัติที่', person.combinedOrderNo, 'order-number')}
        ${field('ลงวันที่', shortDate(trip.orderDate), 'order-date')}
        ${field('ให้ข้าพเจ้าเดินทางไปปฏิบัติงาน', person.combinedWork, 'order-work')}
      </div>
      <div class="form-line location">
        ${field('ที่', person.combinedLocation, 'order-location')}
        ${field('ข้าพเจ้าได้ออกจากที่พักโดยพาหนะ', trip.vehicle, 'vehicle')}
      </div>
      <div class="form-line travel-period">
        ${field('ตั้งแต่วันที่', shortDate(first?.departDate), 'trip-date')}
        ${field('เวลา', clockTime(first?.departTime), 'trip-time')}<span>น.</span>
        ${field('ถึงวันที่', shortDate(last?.arriveDate), 'trip-date')}
        ${field('เวลา', clockTime(last?.arriveTime), 'trip-time')}<span>น.</span>
        ${field('รวมเวลาปฏิบัติงานครั้งนี้', person.effectiveDays, 'trip-length')}<span>วัน</span>
        <span class="entry trip-nights">${text(person.effectiveNights)}</span><span>คืน</span>
      </div>
      <div class="form-line voucher-declaration">จึงขอเบิกเงินค่าใช้จ่ายในการปฏิบัติงานครั้งนี้และได้แนบเอกสารประกอบการเบิกจ่ายมาพร้อมนี้ด้วยแล้ว</div>
    </div>
  </header>`
}

function voucherExpenses(trip: Trip, person: PersonCalculation): string {
  const { member, effectiveDays, effectiveNights, extraExpenseTotals } = person
  const expenses = [
    {
      label: `ค่าเบี้ยเลี้ยงวันละ ${number.format(member.dailyAllowanceRate)} บาท ${number.format(effectiveDays)} วัน`,
      account: ALLOWANCE_ACCOUNT,
      center: trip.budgetType,
      amount: money.format(person.dailyAllowanceAmount),
    },
    {
      label: `ค่าเบี้ยเลี้ยงส่วนเพิ่ม ${number.format(member.extraAllowanceRate)} บาท ${number.format(effectiveDays)} วัน (TAX)`,
      center: person.extraAllowanceAmount > 0 ? trip.budgetType : '',
      amount: money.format(person.extraAllowanceAmount),
    },
    { label: 'ค่าที่พักจ่ายจริง - บาท - วัน', amount: '-' },
    {
      label: `ค่าที่พักเหมาจ่าย ${number.format(member.flatHotelRate)} บาท ${number.format(effectiveNights)} คืน (TAX)`,
      account: HOTEL_ACCOUNT,
      center: trip.budgetType,
      amount: money.format(person.flatHotelAmount),
    },
    ...(person.extraExpenses.length ? [{
      label: 'รายการเพิ่ม',
      center: 'ตามใบแนบ',
      amount: money.format(extraExpenseTotals.net),
      vat: money.format(extraExpenseTotals.vat),
      gross: money.format(extraExpenseTotals.gross),
    }] : []),
  ]
  const rows = Array.from({ length: MAX_SEGMENTS }, (_, index) => {
    const segment = trip.travelSegments[index]
    const expense = expenses[index]
    return `<tr>
      <td><span class="travel-place">${text(segment?.fromPlace)}</span></td>
      <td>${text(shortDate(segment?.departDate))}</td>
      <td>${text(displayTime(segment?.departTime))}</td>
      <td><span class="travel-place">${text(segment?.toPlace)}</span></td>
      <td>${text(shortDate(segment?.arriveDate))}</td>
      <td>${text(displayTime(segment?.arriveTime))}</td>
      <td></td>
      <td class="account-cell">${expense?.gross ? 'ตามใบแนบ' : accountBoxes(expense?.account)}</td>
      <td class="expense-description">${text(expense?.label)}</td>
      <td>${text(expense?.center)}</td>
      <td class="amount">${expense?.amount ?? ''}</td>
      <td${expense?.vat === undefined ? '' : ' class="amount"'}>${expense?.vat ?? (expense ? '-' : '')}</td>
      <td class="amount">${expense?.gross ?? expense?.amount ?? ''}</td>
    </tr>`
  }).join('')
  const total = money.format(person.clearTotal)
  return `<table class="voucher-expenses">
    <colgroup>
      <col class="place-column"><col class="date-column"><col class="time-column">
      <col class="place-column"><col class="date-column"><col class="time-column"><col class="receipt-column"><col class="account-column">
      <col class="description-column"><col class="cost-column"><col class="amount-column">
      <col class="tax-column"><col class="total-column">
    </colgroup>
    <thead>
      <tr>
        <th colspan="3" scope="colgroup">ออกจาก</th><th colspan="3" scope="colgroup">ถึง</th>
        <th rowspan="2" scope="col">เลขที่ใบเสร็จ<br>/ใบกำกับภาษี</th>
        <th rowspan="2" scope="col">รหัสบัญชี</th><th rowspan="2" scope="col">รายการค่าใช้จ่าย</th>
        <th rowspan="2" scope="col">รหัส<br>ศูนย์ต้นทุน</th><th rowspan="2" scope="col">จำนวนเงิน</th>
        <th rowspan="2" scope="col">ภาษี<br>มูลค่าเพิ่ม</th><th rowspan="2" scope="col">รวม</th>
      </tr>
      <tr><th>กฟฟ.</th><th>วันที่</th><th>เวลา</th><th>กฟฟ.</th><th>วันที่</th><th>เวลา</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="10"><div class="voucher-total"><span>รวมเงินที่ขอเบิก (</span><span>${text(person.clearTotalText)}</span><span>)</span></div></td>
        <td class="amount">${money.format(person.clearSubtotal)}</td>
        ${person.extraExpenses.length ? `<td class="amount">${money.format(extraExpenseTotals.vat)}</td>` : '<td>-</td>'}
        <td class="amount">${total}</td>
      </tr>
    </tfoot>
  </table>`
}

function voucherFooter(person: PersonCalculation): string {
  const signatureCells = [
    { role: 'ผู้ตรวจ' },
    { role: 'หผ.' },
    { approval: 'อนุมัติจ่ายเงินได้' },
    { role: 'หผ. / ผู้จ่ายเงิน' },
    { role: 'ผู้รับเงิน', name: person.member.name },
  ]
  return `<div class="form-line payment-line">
    ${field('ข้าพเจ้าได้ยืมเงินเมื่อวันที่')}
    ${field('ตามเลขที่เอกสารการยืม')}
    ${field('จำนวนเงิน')}<span>บาท (</span><span class="entry"></span><span>)</span>
  </div>
  <div class="form-line payment-line">
    ${field('ได้รับเงินจำนวน', money.format(person.clearTotal))}<span>บาท (</span>
    <span class="entry money-words">${text(person.clearTotalText)}</span><span>)</span>
    ${field('ไว้ถูกต้องแล้วเมื่อวันที่')}${field('ตามเอกสารการจ่ายเงินเลขที่')}
  </div>
  <div class="voucher-signatures">${signatureCells.map((signature) => `
    <div class="voucher-signature">
      <div class="signature-approval">${signature.approval ?? ''}</div>
      <div class="signature-name">${signature.name ? `( ${text(signature.name)} )` : ''}</div>
      <div>${signature.role ?? ''}</div>
      <div>${dateLine}</div>
    </div>`).join('')}</div>`
}

function voucherPage(trip: Trip, person: PersonCalculation, logo: string): string {
  const expanded = person.combinedOrderNo.length > 26 || person.combinedWork.length > 160 || person.combinedLocation.length > 55
  return `<section class="page clear-page voucher-page${expanded ? ' expanded-voucher' : ''}">
    <div class="voucher-form">
      ${voucherHeader(trip, person, logo)}
      ${voucherExpenses(trip, person)}
      ${voucherFooter(person)}
    </div>
    <p class="voucher-note"><u>หมายเหตุ</u> ค่าเบี้ยเลี้ยงส่วนเพิ่ม หมายถึงค่าเบี้ยเลี้ยงส่วนที่เกิน 270 บาท</p>
  </section>`
}

function reportPage(trip: Trip, person: PersonCalculation): string {
  const { member, workEntries } = person
  const rowCount = Math.max(13, workEntries.length)
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const entry = workEntries[index]
    return `<tr>
      <td>${text(shortDate(entry?.date))}</td>
      <td class="report-activity">${text(entry?.text)}</td>
      <td>${text(entry?.workNumber)}</td>
    </tr>`
  }).join('')
  return `<section class="page clear-page report-page${rowCount > 13 ? ' expanded-report' : ''}">
    <h1>รายการปฏิบัติงาน</h1>
    <div class="report-form">
      <table class="report-table" style="--work-row-count:${rowCount}">
        <colgroup><col class="report-date-column"><col class="report-activity-column"><col class="report-number-column"></colgroup>
        <thead><tr><th>วัน เดือน ปี</th><th>รายการ</th><th>หมายเลขงาน</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="flight-row"><td></td>
            <td class="report-activity"><span class="flight-box${trip.flew ? ' checked' : ''}"></span> ขอรับรองว่าเดินทางโดยเครื่องบิน เพื่อไปปฏิบัติงานจริง</td>
            <td></td></tr>
        </tbody>
      </table>
      <div class="report-note"><strong>หมายเหตุ</strong><span>${text(trip.note)}</span></div>
      <div class="report-certification">
        <p>ขอรับรองว่ารายงานการเดินทางและรายการปฏิบัติงานถูกต้องเป็นตามจริงทุกประการ</p>
        <div class="report-signatures">
          <div>
            <div class="report-signature-line">(ลงชื่อ)<span></span>ผู้ขอเบิก</div>
            <div>( ${text(member.name)} ) เบอร์ภายใน ${text(member.phone)}</div>
            <div>${text(member.position)} ${text(member.department)}</div>
            <div>${dateLine}</div>
          </div>
          <div>
            <div class="report-signature-line">(ลงชื่อ)<span></span>ผู้บังคับบัญชาชั้นต้น</div>
            <div>( ........................................ )</div>
            <div></div>
            <div>${dateLine}</div>
          </div>
          <div>
            <div class="report-signature-line">(ลงชื่อ)<span></span>ผู้บังคับบัญชาหน่วยงาน</div>
            <div>( ........................................ )</div>
            <div></div>
            <div>${dateLine}</div>
          </div>
        </div>
      </div>
    </div>
  </section>`
}

function budgetExpenses(trip: Trip, person: PersonCalculation): string {
  const { member, budgetDays, extraExpenseTotals } = person
  const days = number.format(budgetDays)
  const expenses: { label: string; amount: number; vat?: number; gross?: number }[] = [
    { label: `ค่าที่พักเหมาจ่ายคืนละ ${number.format(member.flatHotelRate)} จำนวน ${days} คืน`, amount: person.budgetHotel },
    { label: `ค่าเบี้ยเลี้ยงวันละ ${number.format(member.dailyAllowanceRate)} จำนวน ${days} วัน`, amount: person.budgetDailyAllowance },
  ]
  if (member.extraAllowanceRate > 0) {
    expenses.push({
      label: `ค่าเบี้ยเลี้ยงส่วนเพิ่มวันละ ${number.format(member.extraAllowanceRate)} จำนวน ${days} วัน`,
      amount: person.budgetExtraAllowance,
    })
  }
  if (person.extraExpenses.length) {
    expenses.push({
      label: 'ค่าใช้จ่ายเพิ่มเติม (รายละเอียดตามใบแนบ)',
      amount: extraExpenseTotals.net,
      vat: extraExpenseTotals.vat,
      gross: extraExpenseTotals.gross,
    })
  }
  const rows = Array.from({ length: 5 }, (_, index) => {
    const expense = expenses[index]
    const amount = expense ? money.format(expense.amount) : ''
    return `<tr><td>${index + 1}</td><td class="budget-description">${expense?.label ?? ''}</td>
      <td class="amount">${amount}</td><td class="amount">${expense?.vat === undefined ? '' : money.format(expense.vat)}</td>
      <td class="amount">${expense?.gross === undefined ? amount : money.format(expense.gross)}</td></tr>`
  }).join('')
  const total = money.format(person.budgetTotal)
  return `<table class="budget-table budget-expenses">
    <colgroup><col class="budget-sequence-column"><col class="budget-description-column">
      <col class="budget-amount-column"><col class="budget-amount-column"><col class="budget-total-column"></colgroup>
    <thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวนเงิน</th><th>ภาษีมูลค่าเพิ่ม</th><th>รวม</th></tr></thead>
    <tbody>
      ${rows}
      <tr><td></td><td>(มีหลักฐานประกอบแนบรวม <span class="attachment-count">${text(trip.attachments)}</span> ฉบับ)</td><td></td><td></td><td></td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">${text(person.budgetTotalText)}</td><td class="amount">${money.format(person.budgetSubtotal)}</td>
      ${person.extraExpenses.length ? `<td class="amount">${money.format(extraExpenseTotals.vat)}</td>` : '<td>-</td>'}<td class="amount">${total}</td></tr></tfoot>
  </table>`
}

function budgetAllocations(person: PersonCalculation): string {
  const showExtras = person.extraExpenses.length > 0
  const extraCell = (value?: number) => showExtras ? `<td class="amount">${value === undefined ? '' : money.format(value)}</td>` : ''
  const rows = Array.from({ length: MAX_PM_ROWS }, (_, index) => {
    const allocation = person.allocations[index]
    return allocation
      ? `<tr><td class="allocation-code">${text(allocation.costCenter)}</td><td class="amount">${money.format(allocation.allowance)}</td>
        <td class="amount">${money.format(allocation.hotel)}</td>${extraCell(allocation.extraExpense)}<td class="amount">${money.format(allocation.total)}</td></tr>`
      : `<tr><td></td><td></td><td></td>${extraCell()}<td></td></tr>`
  }).join('')
  const { allowance, hotel, extraExpense, total } = person.allocationTotals
  const extraColumn = showExtras ? '<col class="allocation-extra-column">' : ''
  return `<table class="budget-table allocation-table${showExtras ? ' allocation-with-extras' : ''}">
    <colgroup><col class="allocation-code-column"><col class="budget-amount-column"><col class="budget-amount-column">${extraColumn}<col class="budget-total-column"></colgroup>
    <thead><tr>
      <th class="allocation-title"><span>ชื่อ-รหัสบัญชี</span><span>รหัสศูนย์ต้นทุน</span></th>
      <th>ค่าเบี้ยเลี้ยง<br>${ALLOWANCE_ACCOUNT}</th><th>ค่าที่พัก<br>${HOTEL_ACCOUNT}</th>
      ${showExtras ? '<th>รายการเพิ่ม<br>ตามใบแนบ</th>' : ''}<th>รวมค่าใช้จ่าย</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><th scope="row">รวม</th><td class="amount">${money.format(allowance)}</td><td class="amount">${money.format(hotel)}</td>${extraCell(extraExpense)}<td class="amount">${money.format(total)}</td></tr>
      <tr><td>งบประมาณคงเหลือหลังเบิกจ่ายครั้งนี้</td><td></td><td></td>${extraCell()}<td></td></tr>
    </tfoot>
  </table>`
}

type ExpenseAnnexGroup = { expense: PersonCalculation['extraExpenses'][number]; number: number }

function expenseAnnexGroups(person: PersonCalculation): ExpenseAnnexGroup[][] {
  const pages: ExpenseAnnexGroup[][] = []
  let page: ExpenseAnnexGroup[] = []
  let rows = 0
  person.extraExpenses.forEach((expense, index) => {
    const size = 1 + expense.allocations.length
    if (rows + size > 8 && page.length) {
      pages.push(page)
      page = []
      rows = 0
    }
    page.push({ expense, number: index + 1 })
    rows += size
  })
  if (page.length) pages.push(page)
  return pages
}

export function documentPageCount(kind: DocumentKind, people: PersonCalculation[]): number {
  return kind === 'budget' ? people.length : people.reduce((count, person) => count + 2 + expenseAnnexGroups(person).length, 0)
}

function expenseAnnex(person: PersonCalculation): string {
  const pages = expenseAnnexGroups(person)
  const amountCell = (value: number) => `<td class="amount">${money.format(value)}</td>`
  return pages.map((groups, index) => {
    const rows = groups.map(({ expense, number }) => {
      const details = `<tr class="annex-expense">
        <th scope="row">${number}</th><td>${text(shortDate(expense.date))}</td><td>${text(expense.receiptNo)}</td><td>${text(expense.accountCode)}</td>
        <td class="expense-description">${text(expense.description)}</td><td>${expense.vatCredit ? 'เครดิตภาษีซื้อ' : 'ไม่เครดิตภาษีซื้อ'}</td>
        ${amountCell(expense.net)}${amountCell(expense.vat)}${amountCell(expense.gross)}${amountCell(expense.budgetAmount)}
      </tr>`
      const allocations = expense.allocations.map((allocation) => `<tr>
        <td>${number}</td><td colspan="4" class="annex-allocation-label">จัดสรร PM</td><td>${text(allocation.costCenter)}</td>
        ${amountCell(allocation.net)}${amountCell(allocation.vat)}${amountCell(allocation.gross)}${amountCell(allocation.budgetAmount)}
      </tr>`).join('')
      return details + allocations
    }).join('')
    const { net, vat, gross, budgetAmount } = person.extraExpenseTotals
    const totals = index === pages.length - 1
      ? `<tfoot><tr><th colspan="6" scope="row">รวมรายการเพิ่มทุกหน้า (บาท)</th>${amountCell(net)}${amountCell(vat)}${amountCell(gross)}${amountCell(budgetAmount)}</tr></tfoot>`
      : ''
    return `<section class="page clear-page expense-annex">
      <h1>ใบแนบรายละเอียดค่าใช้จ่ายและจัดสรร PM</h1>
      <div class="annex-identity">
        ${field('ผู้เบิก', `${person.member.name} (${person.member.id})`)}
        ${field('เลขที่คำสั่ง', person.combinedOrderNo)}
        <span>หน้า ${index + 1} / ${pages.length}</span>
      </div>
      <table class="annex-table">
        <colgroup><col style="width:4%"><col style="width:8%"><col style="width:12%"><col style="width:9%">
          <col style="width:20%"><col style="width:13%"><col span="4" style="width:8.5%"></colgroup>
        <thead><tr><th>ลำดับ</th><th>วันที่หลักฐาน</th><th>เลขที่หลักฐาน</th><th>รหัสบัญชี</th><th>รายละเอียด</th>
          <th>ภาษีซื้อ / รหัส PM</th><th>ก่อนภาษี</th><th>ภาษี</th><th>รวม</th><th>ยอดตัดงบ</th></tr></thead>
        <tbody>${rows}</tbody>${totals}
      </table>
    </section>`
  }).join('')
}

function emptyBudgetAllocations(): string {
  const blankRow = '<tr><td></td><td></td><td></td><td></td><td></td></tr>'
  return `<table class="budget-table blank-allocation-table">
    <colgroup><col class="allocation-code-column"><col span="4" class="budget-amount-column"></colgroup>
    <thead>
      <tr><th class="allocation-label">ชื่อ-รหัสบัญชี</th><th></th><th></th><th></th><th>รวมค่าใช้จ่าย</th></tr>
      <tr><th class="allocation-label">รหัสศูนย์ต้นทุน</th><th></th><th></th><th></th><th></th></tr>
    </thead>
    <tbody>${blankRow.repeat(4)}</tbody>
    <tfoot>
      <tr><th scope="row">รวม</th><td></td><td>-</td><td></td><td></td></tr>
      <tr><td>งบประมาณคงเหลือหลังเบิกจ่ายครั้งนี้</td><td></td><td></td><td></td><td></td></tr>
    </tfoot>
  </table>`
}

function budgetPage(trip: Trip, person: PersonCalculation, logo: string): string {
  const { member } = person
  return `<section class="page budget-page">
    <header class="budget-header">
      <div class="budget-identity">
        <img src="${escapeHtml(logo)}" alt="ตราการไฟฟ้าส่วนภูมิภาค">
        <h1>แบบขอเบิกจ่ายเงินและตัดงบประมาณ</h1>
        <div>${field('กฟฟ.', trip.office)}</div>
        <div>${field('งบ', trip.budgetType)}</div>
        <div>${field('หมายเลขงาน', trip.workNumber)}</div>
      </div>
      <div class="budget-claimant">
        <div>${field('เลขที่ กฟฟ', trip.officeNo)}</div>
        <div>${field('เลขที่.', trip.voucherNo)}</div>
        <div>${field('วันที่', trip.documentDate ? formatThaiDate(trip.documentDate) : '')}</div>
        <div>${field('ผู้เบิก', `${member.name} (${member.id})`)}</div>
        <div>${field('ตำแหน่ง/ที่อยู่', `${member.position} ${member.department}`)}</div>
      </div>
    </header>
    ${budgetExpenses(trip, person)}
    <h2>รายละเอียดค่าใช้จ่ายตามศูนย์ต้นทุนประกอบใบสำคัญจ่ายเงิน</h2>
    ${budgetAllocations(person)}
    ${emptyBudgetAllocations()}
    <footer class="budget-footer">
      <div class="budget-note">
        <span>หมายเหตุ</span>
        <div>
          <p>- การระบุจำนวนเงินไม่เครดิตภาษีซื้อให้ยอดเงินรวมภาษี</p>
          <p>- กรณีค่าใช้จ่ายที่เครดิตภาษีซื้อ ให้ใช้ยอดมูลค่าสินค้าไม่รวมภาษี</p>
        </div>
      </div>
      <div class="budget-signature">
        <div>ลงชื่อ<span></span>ผู้ควบคุมงบ</div>
        <div>${text(trip.budgetControllerName)}</div>
        <div>${text(trip.budgetControllerPosition)}</div>
      </div>
    </footer>
  </section>`
}

function fontFace(source: string, weight: 400 | 700): string {
  return `@font-face {
    font-family: PrintSarabunNew;
    src: url("${source}") format("truetype");
    font-weight: ${weight};
    size-adjust: 125%;
  }`
}

export function renderDocument(
  kind: DocumentKind,
  trip: Trip,
  people: PersonCalculation[],
  assets: PrintAssets,
): string {
  const clear = kind === 'clear'
  const title = clear ? 'ใบสำคัญจ่ายเงิน' : 'แบบขอเบิกจ่ายเงินและตัดงบประมาณ'
  const orientation = clear ? 'landscape' : 'portrait'
  const pages = people.map((person) => clear
    ? voucherPage(trip, person, assets.logo) + reportPage(trip, person) + expenseAnnex(person)
    : budgetPage(trip, person, assets.logo)).join('')
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">
  <title>${title}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 0; }
    ${fontFace(assets.fontRegular, 400)}
    ${fontFace(assets.fontBold, 700)}
    ${assets.css}
  </style>
</head>
<body>${pages}</body>
</html>`
}
