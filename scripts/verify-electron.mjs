import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PEA_CLEAR_API_PORT) || 17871;
const base = `http://127.0.0.1:${port}/v1`;
const fixtures = process.env.PEA_CLEAR_FIXTURE_DIR ?? join(homedir(), 'Library/CloudStorage/GoogleDrive-arm.09686@gmail.com/ไดรฟ์ของฉัน/01_PEA_Work/Pea/เคลียเอกสาร');
const fixture = (name) => readFile(join(fixtures, name));
const working = await mkdtemp(join(tmpdir(), 'pea-electron-'));
const profile = join(working, 'profile');
await mkdir(profile);
const exportRoot = process.env.PEA_CLEAR_QA_OUTPUT ?? join(working, 'output');
const executable = process.env.PEA_CLEAR_EXECUTABLE ?? require('electron');
const child = spawn(executable, process.env.PEA_CLEAR_EXECUTABLE ? [] : [root], {
  cwd: root, env: { ...process.env, PEA_CLEAR_HEADLESS: '1', PEA_CLEAR_USER_DATA: profile, PEA_CLEAR_API_PORT: String(port) },
  stdio: ['ignore', 'inherit', 'inherit'],
});

async function request(route, body, contentType = 'application/json') {
  const response = await fetch(base + route, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': contentType }, body,
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
}

async function verifyPdf(file, count, expectedWidth, expectedHeight, expectedText) {
  const task = getDocument({ data: new Uint8Array(await readFile(file)), verbosity: 0 });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, count);
    for (let index = 1; index <= count; index++) {
      const page = await pdf.getPage(index);
      const { width, height } = page.getViewport({ scale: 1 });
      assert.ok(Math.abs(width - expectedWidth) < 2 && Math.abs(height - expectedHeight) < 2, `Page ${index} geometry ${width} × ${height}`);
      const text = (await page.getTextContent()).items.map((item) => item.str ?? '').join('')
        .replaceAll('\uF70A', '่').replaceAll('\uF70B', '้').replaceAll('\uF70E', '์')
        .normalize('NFKD').replaceAll('\0', '');
      assert.ok(text.includes(expectedText[(index - 1) % expectedText.length].normalize('NFKD')), `Missing expected form title on page ${index}`);
      assert.doesNotMatch(text, /\bFalse\b|รอยืนยันข้อมูล/);
    }
  } finally {
    await task.destroy();
  }
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 70 && child.exitCode === null; attempt++) {
    const status = await request('/health').catch(() => null);
    if (status?.status === 'ok') {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  assert.ok(ready, 'Electron Local API did not start');
  const blocked = await fetch(base + '/trips', { headers: { Origin: 'https://example.org' } });
  assert.equal(blocked.status, 403);
  assert.deepEqual(await request('/trips'), [], 'Expected a fresh Electron profile');
  const travel = await request('/parse-pdf', await fixture('คำสั่ง 3-7 พ.ย..pdf'), 'application/pdf');
  assert.equal(travel.orderNo, 'TL25236135');
  assert.deepEqual(travel.employeeIds, ['501508', '503354', '503408', '506723', '507765']);
  const pm = await request('/parse-pdf', await fixture('มิถุนายน/ใบสั่งซ่อม-มิย69.pdf'), 'application/pdf');
  assert.equal(pm.options.length, 9);
  const archivedDocs = await request('/documents');
  assert.equal(archivedDocs.length, 2);
  const trip = JSON.parse(await fixture('payload_tl26130529.json'));
  const files = await request('/export', JSON.stringify({ trip, exportRoot }));
  await verifyPdf(files.clear, 14, 842, 595, ['ใบสำคัญจ่ายเงิน', 'รายการปฏิบัติงาน']);
  await verifyPdf(files.budget, 7, 595, 842, ['แบบขอเบิกจ่ายเงินและตัดงบประมาณ']);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(files.workbook);
  assert.equal(book.worksheets.length, 16);
  let formulas = 0;
  for (const sheet of book.worksheets) sheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.formula) {
      assert.notEqual(cell.result, undefined, `${sheet.name}!${cell.address} has no result`);
      formulas++;
    }
  }));
  assert.equal(book.getWorksheet('ใบเคลีย_พี่ต้น').getCell('E9').result, 5700);
  assert.equal(book.getWorksheet('ใบเคลีย_พี่จิ๋ว').getCell('E9').result, 8220);
  assert.equal(book.getWorksheet('ใบตัดงบ_พี่จิ๋ว').getCell('E10').result, 4110);
  const [saved] = await request('/trips');
  assert.equal(saved.files.clear, files.clear);
  const changed = { ...saved.trip, orders: saved.trip.orders.map((order) => ({ ...order, pms: order.pms.map((row) => ({ ...row, pmDays: 2 })) })) };
  const second = await request('/export', JSON.stringify({ trip: changed, exportRoot: join(working, 'retry') }));
  const adjusted = new ExcelJS.Workbook();
  await adjusted.xlsx.readFile(second.workbook);
  assert.equal(adjusted.getWorksheet('ใบเคลีย_พี่ต้น').getCell('E9').result, 5700);
  assert.equal(adjusted.getWorksheet('ใบตัดงบ_พี่ต้น').getCell('E8').result, 3800);
  const [latest] = await request('/trips');
  assert.equal(latest.trip.id, saved.trip.id);
  assert.equal(latest.files.clear, second.clear);
  const stops = ['ฝปบ.', 'กฟจ.ยะลา', 'กฟจ.ปัตตานี', 'กฟจ.นราธิวาส', 'กฟส.เบตง', 'กฟส.รามัน', 'กฟส.มายอ', 'กฟส.หนองจิก', 'กฟส.โคกโพธิ์', 'กฟส.สะบ้าย้อย', 'ฝปบ.'];
  const fullTrip = {
    ...saved.trip,
    orders: stops.slice(1, 6).map((location, index) => ({
      ...saved.trip.orders[0], location, orderNo: 'TL2613052' + index,
      pms: [{ costCenter: String(4008350630 + index), pmDays: index + 1 }],
    })),
    participants: saved.trip.participants.slice(0, 1),
    travelSegments: stops.slice(1).map((toPlace, index) => {
      const date = index < 9 ? '2026-06-07' : '2026-06-13';
      return { fromPlace: stops[index], toPlace, departDate: date, arriveDate: date };
    }),
  };
  const fullFiles = await request('/export', JSON.stringify({ trip: fullTrip, exportRoot: join(working, 'five-pms') }));
  await verifyPdf(fullFiles.clear, 2, 842, 595, ['ใบสำคัญจ่ายเงิน', 'รายการปฏิบัติงาน']);
  await verifyPdf(fullFiles.budget, 1, 595, 842, ['แบบขอเบิกจ่ายเงินและตัดงบประมาณ']);
  const fullBook = new ExcelJS.Workbook();
  await fullBook.xlsx.readFile(fullFiles.workbook);
  assert.equal(fullBook.getWorksheet('ใบตัดงบ_พี่ต้น').getCell('E15').result, 14250);
  const extraTrip = {
    ...fullTrip,
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
  };
  const extraFiles = await request('/export', JSON.stringify({ trip: extraTrip, exportRoot: join(working, 'extra-expenses') }));
  await verifyPdf(extraFiles.clear, 3, 842, 595, ['ใบสำคัญจ่ายเงิน', 'รายการปฏิบัติงาน', 'ใบแนบรายละเอียดค่าใช้จ่ายและจัดสรร PM']);
  await verifyPdf(extraFiles.budget, 1, 595, 842, ['แบบขอเบิกจ่ายเงินและตัดงบประมาณ']);
  console.log(JSON.stringify({ files, clearPages: 14, budgetPages: 7, annexPages: 3, sheets: book.worksheets.length, formulas }, null, 2));
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await stopped;
  }
  await rm(working, { recursive: true, force: true });
}
