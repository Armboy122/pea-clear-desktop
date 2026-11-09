import ExcelJS, { type Worksheet } from 'exceljs';
import { ALLOWANCE_ACCOUNT, HOTEL_ACCOUNT, MAX_PM_ROWS, type Trip } from '@pea/contracts';
import { calculateTrip } from './calculator';

const moneyFormat = '#,##0.00;[Red](#,##0.00);"-"';
const safeText = (value: string) => value.replace(/รอยืนยันข้อมูล|\bfalse\b/gi, '');
const formula = (formula: string, result: number | string) => ({ formula, result });
const expenseSheetName = 'รายการเพิ่ม';
const allocationSheetName = 'จัดสรรรายการ';
const sheetRange = (sheet: string, column: string, end: number) => `'${sheet}'!$${column}$3:$${column}$${Math.max(3, end)}`;

function addSheet(book: ExcelJS.Workbook, name: string, widths: number[], orientation: 'portrait' | 'landscape' = 'portrait') {
  const sheet = book.addWorksheet(name, { pageSetup: { paperSize: 9, orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  sheet.columns = widths.map((width) => ({ width }));
  return sheet;
}

function title(sheet: Worksheet, text: string, columns: number, imageId?: number) {
  const first = imageId === undefined ? 1 : 2;
  sheet.mergeCells(1, first, 1, columns);
  const cell = sheet.getCell(1, first);
  cell.value = text;
  cell.font = { name: 'TH Sarabun New', size: 19, bold: true, color: { argb: 'FF431D57' } };
  sheet.getRow(1).height = imageId === undefined ? 30 : 47;
  if (imageId !== undefined) sheet.addImage(imageId, { tl: { col: 0.1, row: 0.08 }, ext: { width: 54, height: 54 }, editAs: 'oneCell' });
}

function header(sheet: Worksheet, values: string[]) {
  const row = sheet.addRow(values);
  row.height = 23;
  row.eachCell((cell) => {
    cell.font = { name: 'TH Sarabun New', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF583368' } };
  });
}

function finish(sheet: Worksheet) {
  sheet.eachRow((row) => row.eachCell((cell) => {
    if (!cell.font?.name) cell.font = { name: 'TH Sarabun New', size: 14 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (typeof cell.value === 'string') cell.value = safeText(cell.value);
  }));
}

function addExpenseSheets(
  book: ExcelJS.Workbook,
  expenses: ReturnType<typeof calculateTrip>['people'][number]['extraExpenses'],
  lastExpense: number,
  lastAllocation: number,
) {
  const receipts = addSheet(book, expenseSheetName, [40, 15, 19, 16, 43, 25, 16, 16, 16, 16, 16, 18, 18], 'landscape');
  const splits = addSheet(book, allocationSheetName, [40, 23, 16, 16, 16, 16, 15, 16, 43, 25], 'landscape');
  const annex = addSheet(book, 'ใบแนบรายการ', [40, 15, 25, 16, 43, 23, 16, 16, 16, 16], 'landscape');
  title(receipts, 'รายการค่าใช้จ่ายเพิ่ม', 13);
  title(splits, 'จัดสรรรายการตาม PM', 10);
  title(annex, 'ใบแนบรายละเอียดค่าใช้จ่ายและจัดสรร PM', 10);
  header(receipts, ['รหัสรายการ', 'รหัสคน', 'วันที่หลักฐาน', 'รหัสบัญชี', 'รายละเอียด', 'เลขที่หลักฐาน', 'ก่อนภาษี', 'ภาษี', 'ภาษีซื้อ', 'รวม', 'ยอดตัดงบ', 'จัดสรรก่อนภาษี', 'จัดสรรภาษี']);
  header(splits, ['รหัสรายการ', 'รหัสศูนย์ต้นทุน', 'ก่อนภาษี', 'ภาษี', 'รวม', 'ยอดตัดงบ', 'รหัสคน', 'รหัสบัญชี', 'รายละเอียด', 'เลขที่หลักฐาน']);
  header(annex, ['รหัสรายการ', 'รหัสคน', 'เลขที่หลักฐาน', 'รหัสบัญชี', 'รายละเอียด', 'รหัสศูนย์ต้นทุน', 'ก่อนภาษี', 'ภาษี', 'รวม', 'ยอดตัดงบ']);
  for (const sheet of [receipts, splits, annex]) {
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.printTitlesRow = '1:2';
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
  }
  receipts.getColumn(3).numFmt = 'dd/mm/yyyy';
  for (const col of [7, 8, 10, 11, 12, 13]) receipts.getColumn(col).numFmt = moneyFormat;
  for (const col of [3, 4, 5, 6]) splits.getColumn(col).numFmt = moneyFormat;
  for (const col of [7, 8, 9, 10]) annex.getColumn(col).numFmt = moneyFormat;
  const receiptRange = (column: string) => sheetRange(expenseSheetName, column, lastExpense);
  const splitRange = (column: string) => sheetRange(allocationSheetName, column, lastAllocation);

  expenses.forEach((expense, index) => {
    const row = index + 3;
    const allocated = (column: string, key: 'net' | 'vat') => formula(
      `ROUND(SUMIF(${splitRange('A')},A${row},${splitRange(column)}),2)`,
      expense.allocations.reduce((cents, split) => cents + Math.round(split[key] * 100), 0) / 100,
    );
    const credit = expense.vatCredit ? 'เครดิต' : 'ไม่เครดิต';
    receipts.addRow([
      expense.id, expense.memberId, expense.date ? new Date(expense.date) : null, expense.accountCode,
      expense.description, expense.receiptNo, expense.net, expense.vat, credit,
      formula(`ROUND(SUM(G${row}:H${row}),2)`, expense.gross),
      formula(`IF(I${row}="เครดิต",G${row},J${row})`, expense.budgetAmount),
      allocated('C', 'net'), allocated('D', 'vat'),
    ]);
    for (const split of expense.allocations) {
      const splitRow = splits.rowCount + 1;
      const receiptLookup = (column: string) => `INDEX(${receiptRange(column)},MATCH(A${splitRow},${receiptRange('A')},0))`;
      const lookup = (column: string, value: string) => formula(receiptLookup(column), safeText(value));
      splits.addRow([
        expense.id, split.costCenter, split.net, split.vat,
        formula(`ROUND(SUM(C${splitRow}:D${splitRow}),2)`, split.gross),
        formula(`IF(${receiptLookup('I')}="เครดิต",C${splitRow},E${splitRow})`, split.budgetAmount),
        lookup('B', expense.memberId), lookup('D', expense.accountCode),
        lookup('E', expense.description), lookup('F', expense.receiptNo),
      ]);
      const link = (column: string, value: number | string) => formula(`'${allocationSheetName}'!${column}${splitRow}`, value);
      annex.addRow([
        link('A', expense.id), link('G', expense.memberId), link('J', safeText(expense.receiptNo)),
        link('H', expense.accountCode), link('I', safeText(expense.description)), link('B', safeText(split.costCenter)),
        link('C', split.net), link('D', split.vat), link('E', split.gross), link('F', split.budgetAmount),
      ]);
    }
  });
}

export async function buildWorkbook(trip: Trip, calculation: ReturnType<typeof calculateTrip>, logo: string): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = 'PEA Clear Desktop';
  const expenses = calculation.people.flatMap((person) => person.extraExpenses);
  const lastExpense = expenses.length + 2;
  const lastAllocation = expenses.reduce((lastRow, expense) => lastRow + expense.allocations.length, 2);
  const receiptRange = (column: string) => sheetRange(expenseSheetName, column, lastExpense);
  const splitRange = (column: string) => sheetRange(allocationSheetName, column, lastAllocation);
  const emblem = book.addImage({ base64: logo, extension: 'png' });
  const form = addSheet(book, 'form', [23, 45, 26, 22, 17, 17], 'landscape');
  title(form, 'ข้อมูลทริปและคำสั่ง', 6);
  header(form, ['เลขที่คำสั่ง', 'งานที่ทำ', 'สถานที่', 'รหัสศูนย์ต้นทุน', 'วันตัดงบ']);
  const formRows = [
    ...calculation.pmRows,
    ...trip.orders.filter((order) => !order.pms.length).map((order) => ({ order, costCenter: '', pmDays: 0 })),
  ];
  for (let index = 0; index < MAX_PM_ROWS; index++) {
    const row = formRows[index];
    form.addRow(row ? [row.order.orderNo, row.order.work, row.order.location, row.costCenter, row.pmDays] : ['', '', '', '', 0]);
  }
  form.addRow(['รวมวันตัดงบ', '', '', '', formula('SUM(E3:E7)', calculation.totalPmDays)]);
  form.addRow(['วันที่คำสั่ง', trip.orderDate, 'วันที่เอกสาร', trip.documentDate]);
  form.addRow(['ทะเบียนรถ', trip.vehicle, 'งบ', trip.budgetType]);
  form.addRow(['หมายเหตุ', trip.note, 'เรียน', trip.toWhom]);
  header(form, ['ออกจาก', 'วันที่ออก', 'เวลาออก', 'ถึง', 'วันที่ถึง', 'เวลาถึง']);
  for (const segment of trip.travelSegments) {
    form.addRow([segment.fromPlace, segment.departDate, segment.departTime, segment.toPlace, segment.arriveDate, segment.arriveTime]);
  }
  header(form, ['วันที่', 'รายการปฏิบัติงาน', 'หมายเลขงาน']);
  for (const entry of calculation.workEntries) form.addRow([entry.date, entry.text, entry.workNumber]);
  if (formRows.length > MAX_PM_ROWS) {
    header(form, ['เลขที่คำสั่ง', 'งานที่ทำ', 'สถานที่']);
    for (const { order } of formRows.slice(MAX_PM_ROWS)) form.addRow([order.orderNo, order.work, order.location]);
  }

  const data = addSheet(book, 'data', [15, 35, 12, 22, 15, 14, 14, 14, 14, 14, 14], 'landscape');
  title(data, 'ข้อมูลอัตราและวันเบิกของผู้เดินทาง', 11);
  header(data, ['รหัสพนักงาน', 'ชื่อผู้เบิก', 'ตำแหน่ง', 'สังกัด', 'เบอร์ภายใน', 'เบี้ยเลี้ยง', 'ส่วนเพิ่ม', 'ที่พัก', 'วันเดินทาง', 'คืนที่พัก', 'วันตัดงบ']);

  calculation.people.forEach((person, index) => {
    const member = person.member;
    const hasExpenses = person.extraExpenses.length > 0;
    const { net, vat, gross } = person.extraExpenseTotals;
    const dataRow = index + 3;
    data.addRow([member.id, member.name, member.position, member.department, member.phone, member.dailyAllowanceRate, member.extraAllowanceRate, member.flatHotelRate, person.effectiveDays, person.effectiveNights, person.budgetDays]);
    const ref = (col: string) => `data!${col}${dataRow}`;

    const clear = addSheet(book, 'ใบเคลีย_' + member.nickname, [22, 50, 14, 14, 20, ...(hasExpenses ? [16, 19] : [])], 'landscape');
    title(clear, 'ใบสำคัญจ่ายเงิน', hasExpenses ? 7 : 5, emblem);
    clear.addRow(['ผู้เบิก', member.name, member.id]);
    clear.addRow(['เลขที่คำสั่ง', person.combinedOrderNo, 'สถานที่', person.combinedLocation]);
    header(clear, ['รหัสบัญชี', 'รายการ', 'อัตรา', 'จำนวนวัน/คืน', 'จำนวนเงิน', ...(hasExpenses ? ['ภาษีมูลค่าเพิ่ม', 'รวม'] : [])]);
    clear.addRow([ALLOWANCE_ACCOUNT, 'ค่าเบี้ยเลี้ยง', formula(ref('F'), member.dailyAllowanceRate), formula(ref('I'), person.effectiveDays), formula('ROUND(C5*D5,2)', person.dailyAllowanceAmount)]);
    clear.addRow(['', 'ค่าเบี้ยเลี้ยงส่วนเพิ่ม (TAX)', formula(ref('G'), member.extraAllowanceRate), formula(ref('I'), person.effectiveDays), formula('ROUND(C6*D6,2)', person.extraAllowanceAmount)]);
    clear.addRow(['', 'ค่าที่พักจ่ายจริง - บาท - วัน', '-', '-', '-']);
    clear.addRow([HOTEL_ACCOUNT, 'ค่าที่พักเหมาจ่าย (TAX)', formula(ref('H'), member.flatHotelRate), formula(ref('J'), person.effectiveNights), formula('ROUND(C8*D8,2)', person.flatHotelAmount)]);
    if (hasExpenses) {
      for (const [row, value] of [[5, person.dailyAllowanceAmount], [6, person.extraAllowanceAmount], [8, person.flatHotelAmount]]) {
        clear.getCell(row, 7).value = formula(`SUM(E${row}:F${row})`, value);
      }
      const memberExpenses = (column: string, value: number) => formula(
        `ROUND(SUMIF(${receiptRange('B')},$C$2,${receiptRange(column)}),2)`, value,
      );
      clear.addRow(['ตามใบแนบ', 'รายการเพิ่ม', '', '', memberExpenses('G', net), memberExpenses('H', vat), formula('ROUND(SUM(E9:F9),2)', gross)]);
      clear.addRow(['รวมเงินที่ขอเบิก', person.clearTotalText, '', '', formula('ROUND(SUM(E5:E9),2)', person.clearSubtotal),
        formula('F9', vat), formula('ROUND(SUM(G5:G9),2)', person.clearTotal)]);
      for (const col of [6, 7]) clear.getColumn(col).numFmt = moneyFormat;
    } else {
      clear.addRow(['รวมเงินที่ขอเบิก', person.clearTotalText, '', '', formula('SUM(E5:E8)', person.clearTotal)]);
    }
    clear.getColumn(5).numFmt = moneyFormat;

    const budget = addSheet(book, 'ใบตัดงบ_' + member.nickname, [23, 35, 17, 17, 18, ...(hasExpenses ? [16, 19] : [])], 'portrait');
    title(budget, 'แบบขอเบิกจ่ายเงินและตัดงบประมาณ', hasExpenses ? 7 : 5, emblem);
    budget.addRow(['ผู้เบิก', member.name, member.id]);
    budget.addRow(['งบ', trip.budgetType, 'วันตัดงบ', formula(ref('K'), person.budgetDays)]);
    header(budget, ['ลำดับ', 'รายการ', 'อัตรา', 'วัน/คืน', 'จำนวนเงิน', ...(hasExpenses ? ['ภาษีมูลค่าเพิ่ม', 'รวม'] : [])]);
    budget.addRow([1, 'ค่าที่พักเหมาจ่าย', formula(ref('H'), member.flatHotelRate), formula(ref('K'), person.budgetDays), formula('ROUND(C5*D5,2)', person.budgetHotel)]);
    budget.addRow([2, 'ค่าเบี้ยเลี้ยง', formula(ref('F'), member.dailyAllowanceRate), formula(ref('K'), person.budgetDays), formula('ROUND(C6*D6,2)', person.budgetDailyAllowance)]);
    budget.addRow([3, 'ค่าเบี้ยเลี้ยงส่วนเพิ่ม', formula(ref('G'), member.extraAllowanceRate), formula(ref('K'), person.budgetDays), formula('ROUND(C7*D7,2)', person.budgetExtraAllowance)]);
    if (hasExpenses) {
      for (const [row, value] of [[5, person.budgetHotel], [6, person.budgetDailyAllowance], [7, person.budgetExtraAllowance]]) {
        budget.getCell(row, 7).value = formula(`SUM(E${row}:F${row})`, value);
      }
      const clearSheet = `'${clear.name.replaceAll("'", "''")}'`;
      budget.addRow([4, 'ค่าใช้จ่ายเพิ่มเติม (รายละเอียดตามใบแนบ)', '', '', formula(`${clearSheet}!E9`, net),
        formula(`${clearSheet}!F9`, vat), formula('ROUND(SUM(E8:F8),2)', gross)]);
      budget.addRow(['รวม', person.budgetTotalText, '', '', formula('ROUND(SUM(E5:E8),2)', person.budgetSubtotal),
        formula('F8', vat), formula('ROUND(SUM(G5:G8),2)', person.budgetTotal)]);
    } else {
      budget.addRow(['รวม', person.budgetTotalText, '', '', formula('SUM(E5:E7)', person.budgetTotal)]);
    }
    header(budget, ['รหัสศูนย์ต้นทุน', 'วันตัดงบ PM', 'เบี้ยเลี้ยง ' + ALLOWANCE_ACCOUNT, 'ที่พัก ' + HOTEL_ACCOUNT,
      ...(hasExpenses ? ['รายการเพิ่ม'] : []), 'รวมค่าใช้จ่าย']);
    const start = budget.rowCount + 1;
    for (const allocation of person.allocations) {
      const destination = budget.rowCount + 1;
      const code = `A${destination}`;
      const firstCode = `SUMPRODUCT(--EXACT($A$${start}:${code},${code}))=1`;
      const expenseSplit = `SUMPRODUCT(--(${splitRange('G')}=$C$2),--EXACT(${splitRange('B')},${code}),${splitRange('F')})`;
      budget.addRow([
        safeText(allocation.costCenter),
        formula(`form!E${allocation.pmRowIndex + 3}`, allocation.pmDays),
        formula(`ROUND((${ref('F')}+${ref('G')})*B${destination},2)`, allocation.allowance),
        formula(`ROUND(${ref('H')}*B${destination},2)`, allocation.hotel),
        ...(hasExpenses ? [formula(`IF(${firstCode},ROUND(${expenseSplit},2),0)`, allocation.extraExpense)] : []),
        formula(`SUM(C${destination}:${hasExpenses ? 'E' : 'D'}${destination})`, allocation.total),
      ]);
    }
    const end = budget.rowCount;
    const sum = (col: string, value: number) => formula(end >= start ? `SUM(${col}${start}:${col}${end})` : '0', value);
    const total = person.allocationTotals;
    budget.addRow(['รวม', '', sum('C', total.allowance), sum('D', total.hotel), ...(hasExpenses ? [sum('E', total.extraExpense)] : []),
      sum(hasExpenses ? 'F' : 'E', total.total)]);
    budget.addRow(['ผู้ควบคุมงบ', trip.budgetControllerName, trip.budgetControllerPosition]);
    for (const col of hasExpenses ? [3, 4, 5, 6, 7] : [3, 4, 5]) budget.getColumn(col).numFmt = moneyFormat;
    for (let row = 5; row <= 7; row++) budget.getCell(row, 4).numFmt = '0';
    budget.getCell(3, 4).numFmt = '0';
  });

  if (expenses.length) addExpenseSheets(book, expenses, lastExpense, lastAllocation);
  book.worksheets.forEach(finish);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
