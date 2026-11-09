import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { defaultTeam, tripSchema } from '@pea/contracts';
import { calculateTrip, createRoute, renderDocument } from '@pea/core';
import { buildWorkbook } from '../packages/core/src/xlsx-exporter';

const order = { orderNo: 'TL26130529', location: 'กฟจ.ยะลา', pms: [{ pmDays: 4, costCenter: '4008350630' }], work: 'ตรวจ ABS <script>รอยืนยันข้อมูล</script>' };
const trip = tripSchema.parse({
  id: 'd083ce56-b9cf-412b-9b38-7d104e2cdd66', orders: [order],
  travelSegments: createRoute([order], '2026-06-07', '2026-06-13'),
  participants: [{ memberId: '501508', selected: true }], note: 'False', flew: false,
});
const calculation = calculateTrip(trip, defaultTeam);
const logo = 'data:image/png;base64,' + (await readFile(new URL('../packages/core/assets/pea-logo.base64', import.meta.url), 'utf8')).trim();

test('renders the form sections, eight account boxes and safe Thai document content', () => {
  const assets = { css: '', logo, fontRegular: '', fontBold: '' };
  const clear = renderDocument('clear', trip, calculation.people, assets);
  expect(clear.match(/<section class="page /g)).toHaveLength(2);
  expect(clear).toMatch(/aria-label="52022020">(?:<span>\d<\/span>){8}/);
  expect(clear).toMatch(/aria-label="52022030">(?:<span>\d<\/span>){8}/);
  expect(clear).toContain('ค่าที่พักจ่ายจริง - บาท - วัน');
  expect(clear).toContain('ขอรับรองว่าเดินทางโดยเครื่องบิน');
  expect(clear).toContain('5,700.00');
  expect(clear).toContain('&lt;script&gt;');
  expect(clear).not.toMatch(/<script>|รอยืนยันข้อมูล|\bfalse\b/i);
  const budget = renderDocument('budget', trip, calculation.people, assets);
  expect(budget.match(/<section class="page /g)).toHaveLength(1);
  expect(budget).toContain('3,800.00');
});

test('writes editable Excel formulas with cached results on the required sheets', async () => {
  const bytes = await buildWorkbook(trip, calculation, logo);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['form', 'data', 'ใบเคลีย_พี่ต้น', 'ใบตัดงบ_พี่ต้น']);
  expect(book.getWorksheet('ใบเคลีย_พี่ต้น')?.getCell('E9').value).toEqual({ formula: 'SUM(E5:E8)', result: 5700 });
  expect(book.getWorksheet('ใบตัดงบ_พี่ต้น')?.getCell('E8').value).toEqual({ formula: 'SUM(E5:E7)', result: 3800 });
  expect(book.getWorksheet('ใบตัดงบ_พี่ต้น')?.getCell('E10').value).toEqual({ formula: 'SUM(C10:D10)', result: 3800 });
  expect(book.getWorksheet('ใบเคลีย_พี่ต้น')?.getImages()).toHaveLength(1);
  let formulas = 0;
  for (const sheet of book.worksheets) sheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.formula) {
      expect(cell.result).toBeDefined();
      formulas++;
    }
  }));
  expect(formulas).toBeGreaterThan(20);
});

test('renders expense annex page and extra workbook sheets when extraExpenses are present', async () => {
  const tripWithExtras = tripSchema.parse({
    ...trip,
    extraExpenses: [{
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      memberId: '501508',
      date: '2026-06-08',
      accountCode: '52029999',
      description: 'ค่าน้ำดื่ม',
      receiptNo: 'INV-001',
      net: 100,
      vat: 7,
      vatCredit: false,
      allocations: [{ costCenter: '4008350630', net: 100, vat: 7 }],
    }],
  });
  const calc = calculateTrip(tripWithExtras, defaultTeam);
  const assets = { css: '', logo, fontRegular: '', fontBold: '' };
  const clear = renderDocument('clear', tripWithExtras, calc.people, assets);
  expect(clear.match(/<section class="page /g)).toHaveLength(3);
  expect(clear).toContain('ใบแนบรายละเอียดค่าใช้จ่ายและจัดสรร PM');
  expect(clear).toContain('ค่าน้ำดื่ม');
  expect(clear).toContain('5,807.00');

  const budget = renderDocument('budget', tripWithExtras, calc.people, assets);
  expect(budget).toContain('ค่าใช้จ่ายเพิ่มเติม (รายละเอียดตามใบแนบ)');
  expect(budget).toContain('3,907.00');

  const bytes = await buildWorkbook(tripWithExtras, calc, logo);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
    'form', 'data', 'ใบเคลีย_พี่ต้น', 'ใบตัดงบ_พี่ต้น', 'รายการเพิ่ม', 'จัดสรรรายการ', 'ใบแนบรายการ',
  ]);
});
