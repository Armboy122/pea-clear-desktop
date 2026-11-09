import { z } from 'zod';

const line = (max: number) => z.string().trim().max(max).default('');
const date = z.iso.date();
const optionalDate = z.union([date, z.literal('')]).default('');
const days = z.number().int().min(0).max(366);
const rate = z.number().min(0).max(100000).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, 'ระบุทศนิยมไม่เกินสองตำแหน่ง');

export const memberSchema = z.object({
  id: z.string().regex(/^\d{6}$/, 'รหัสพนักงานต้องมี 6 หลัก'),
  nickname: z.string().trim().min(1).max(23).regex(/^[^\[\]\\\/*?:]+$/).refine((value) => !value.endsWith("'") && !/รอยืนยันข้อมูล|false/i.test(value), 'ใช้ชื่อเล่นที่ตั้งเป็นชื่อชีทได้'),
  name: z.string().trim().min(1).max(65),
  position: line(40), department: line(50), phone: line(30),
  dailyAllowanceRate: rate, extraAllowanceRate: rate, flatHotelRate: rate,
});
export type Member = z.infer<typeof memberSchema>;

export const teamSchema = z.array(memberSchema).min(1).max(30).superRefine((members, ctx) => {
  for (const key of ['id', 'nickname'] as const) {
    const seen = new Set<string>();
    members.forEach((member, index) => {
      const value = member[key].toLowerCase();
      if (seen.has(value)) ctx.addIssue({ code: 'custom', path: [index, key], message: 'ข้อมูลซ้ำในรายชื่อทีม' });
      seen.add(value);
    });
  }
});

const defaultMember = {
  department: 'ผฮล. กบษ.(ต.3)', phone: '(43)10610',
  dailyAllowanceRate: 270, extraAllowanceRate: 30, flatHotelRate: 650,
};
export const defaultTeam: Member[] = [
  { ...defaultMember, id: '501508', nickname: 'พี่ต้น', name: 'นายสุรกฤษฏิ์ แสงกล้า', position: 'พชง.6' },
  { ...defaultMember, id: '503354', nickname: 'พี่แบงค์', name: 'นายณัฐพล เสนพงษ์', position: 'พชง.6' },
  { ...defaultMember, id: '503408', nickname: 'พี่จิ๋ว', name: 'นายสรวิศ นกหนู', position: 'พชง.7', extraAllowanceRate: 100, flatHotelRate: 1000 },
  { ...defaultMember, id: '506723', nickname: 'พี่เชียง', name: 'นายกุลดิลก ชาลี', position: 'พชง.5' },
  { ...defaultMember, id: '506746', nickname: 'พี่เพชร', name: 'นายธีรัช แดงคง', position: 'พชง.5' },
  { ...defaultMember, id: '507756', nickname: 'เบส', name: 'นายภานุพงศ์ จันทร์หอม', position: 'พชง.5' },
  { ...defaultMember, id: '507765', nickname: 'อาม', name: 'นายศักดิธัช รักษายศ', position: 'พชง.5' },
];

export const MAX_ORDERS = 5;
export const MAX_PM_ROWS = 5;
export const MAX_EXTRA_EXPENSES = 30;
export const MAX_SEGMENTS = 10;
export const MAX_PDF_BYTES = 24 * 1024 * 1024;
export const API_PORT = 17870;
export const ALLOWANCE_ACCOUNT = '52022020';
export const HOTEL_ACCOUNT = '52022030';
export const DEFAULT_EXPORT_RELATIVE = 'Library/CloudStorage/GoogleDrive-arm.09686@gmail.com/ไดรฟ์ของฉัน/01_PEA_Work/Pea/เคลียเอกสาร';

export const documentIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const pmSchema = z.object({
  costCenter: line(40), pmDays: days.default(0), sourceDocumentId: documentIdSchema.optional(),
});
export type PmRow = z.infer<typeof pmSchema>;

export const orderSchema = z.object({
  orderNo: line(32), work: line(220), location: line(90),
  pms: z.array(pmSchema).max(MAX_PM_ROWS).optional(), sourceDocumentId: documentIdSchema.optional(),
  costCenter: line(40), pmDays: days.default(0),
});

function normalizeOrders(rows: z.infer<typeof orderSchema>[]) {
  const result: Order[] = [];
  for (const { costCenter, pmDays, pms, ...order } of rows) {
    const allocations = pms ?? (costCenter || pmDays ? [{ costCenter, pmDays }] : []);
    const previous = order.orderNo
      ? result.find((item) => item.orderNo === order.orderNo && item.work === order.work && item.location === order.location)
      : result.at(-1);
    const continuation = !pms && previous && (Boolean(order.orderNo) || (!order.work && !order.location));
    if (continuation) previous.pms.push(...allocations);
    else result.push({ ...order, pms: allocations });
  }
  return result;
}

export type Order = Omit<z.infer<typeof orderSchema>, 'pms' | 'costCenter' | 'pmDays'> & { pms: PmRow[] };

export const extraExpenseSchema = z.object({
  id: z.uuid(), memberId: z.string().regex(/^\d{6}$/),
  date: optionalDate, accountCode: line(8), description: line(160), receiptNo: line(60),
  net: rate, vat: rate, vatCredit: z.boolean().default(false),
  allocations: z.array(z.object({ costCenter: line(40), net: rate, vat: rate })).max(MAX_PM_ROWS),
});
export type ExtraExpense = z.infer<typeof extraExpenseSchema>;
const time = z.string().trim().regex(/^(?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*น\.)?$|^$/, 'เวลาใช้รูปแบบ 08.00').default('');
const segmentSchema = z.object({
  fromPlace: line(90), departDate: optionalDate, departTime: time,
  toPlace: line(90), arriveDate: optionalDate, arriveTime: time,
});
const participantSchema = z.object({
  memberId: z.string().regex(/^\d{6}$/), selected: z.boolean().default(false),
  customDays: days.optional(), customNights: days.optional(), customBudgetDays: days.optional(),
});
const entrySchema = z.object({ date: line(30), text: line(400), workNumber: line(40) });
export const documentDefaults = {
  toWhom: 'อก.บษ.(ต.3)', budgetType: 'ใบสั่งซ่อม', workNumber: '-', departmentCode: '-',
  budgetControllerName: 'นายศักดิธัช รักษายศ', budgetControllerPosition: 'พชง.5 ผฮล.กบษ.(ต3)',
};

export const tripSchema = z.object({
  id: z.uuid(),
  orders: z.array(orderSchema).min(1).max(MAX_ORDERS).transform(normalizeOrders),
  documentIds: z.array(documentIdSchema).max(100).optional(),
  requiresRestrictedAttachment: z.boolean().optional(),
  extraExpenses: z.array(extraExpenseSchema).max(MAX_EXTRA_EXPENSES).optional(),
  travelSegments: z.array(segmentSchema).max(MAX_SEGMENTS).default([]),
  participants: z.array(participantSchema).max(30),
  orderDate: optionalDate, documentDate: optionalDate, vehicle: line(100), note: line(250),
  toWhom: line(60).default(documentDefaults.toWhom),
  budgetType: line(40).default(documentDefaults.budgetType),
  workNumber: line(40).default(documentDefaults.workNumber),
  departmentCode: line(30).default(documentDefaults.departmentCode),
  budgetControllerName: line(65).default(documentDefaults.budgetControllerName),
  budgetControllerPosition: line(65).default(documentDefaults.budgetControllerPosition),
  office: line(65), voucherNo: line(32), officeNo: line(32),
  workEntries: z.array(entrySchema).max(20).optional(),
  attachments: z.number().int().min(0).max(100).optional(), flew: z.boolean().default(false),
}).superRefine((trip, ctx) => {
  if (trip.orders.flatMap((order) => order.pms).length > MAX_PM_ROWS) {
    ctx.addIssue({ code: 'custom', path: ['orders'], message: 'หนึ่งทริปมี PM ได้สูงสุด ' + MAX_PM_ROWS + ' รายการ' });
  }
  const expenseIds = new Set<string>();
  trip.extraExpenses?.forEach((expense, index) => {
    if (expenseIds.has(expense.id)) ctx.addIssue({ code: 'custom', path: ['extraExpenses', index, 'id'], message: 'รหัสรายการค่าใช้จ่ายซ้ำ' });
    expenseIds.add(expense.id);
  });
  const ids = new Set<string>();
  trip.participants.forEach((person, index) => {
    if (ids.has(person.memberId)) ctx.addIssue({ code: 'custom', path: ['participants', index, 'memberId'], message: 'ผู้ร่วมเดินทางซ้ำ' });
    ids.add(person.memberId);
  });
});
export type Trip = z.infer<typeof tripSchema>;
export type Segment = z.infer<typeof segmentSchema>;
export type WorkEntry = z.infer<typeof entrySchema>;
export type DocumentKind = 'clear' | 'budget';

export const settingsSchema = z.object({ team: teamSchema, exportRoot: z.string().trim().min(1).max(4096) });
export type Settings = z.infer<typeof settingsSchema>;
export const filesSchema = z.object({ folder: z.string(), clear: z.string(), budget: z.string(), workbook: z.string() });
export type ExportFiles = z.infer<typeof filesSchema>;
export const historySchema = z.object({
  trip: tripSchema, team: teamSchema, updatedAt: z.iso.datetime(), files: filesSchema.optional(),
});
export type HistoryEntry = z.infer<typeof historySchema>;

const travelImportSchema = z.object({
  kind: z.literal('travel'), orderNo: z.string(), departDate: z.string(), returnDate: z.string(),
  orderDate: z.string(), work: z.string(), location: z.string(), vehicle: z.string(), employeeIds: z.array(z.string()),
});
const pmImportSchema = z.object({
  kind: z.literal('pm'), options: z.array(z.object({ costCenter: z.string(), description: z.string() })),
});
const pdfImportSchema = z.discriminatedUnion('kind', [travelImportSchema, pmImportSchema]);
export type PdfImport = z.infer<typeof pdfImportSchema>;

export const documentRecordSchema = z.object({
  id: documentIdSchema, fileName: z.string().min(1).max(240), importedAt: z.iso.datetime(),
  data: z.discriminatedUnion('kind', [travelImportSchema, pmImportSchema, z.object({ kind: z.literal('attachment') })]),
});
export type DocumentRecord = z.infer<typeof documentRecordSchema>;
export type DocumentStatus = { clear: boolean; budget: boolean };

export interface DesktopBridge {
  settings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
  history(): Promise<HistoryEntry[]>;
  saveTrip(trip: Trip, team: Member[]): Promise<HistoryEntry>;
  exportTrip(trip: Trip, team: Member[], exportRoot?: string): Promise<ExportFiles>;
  importDocument(fileName: string, bytes: Uint8Array, attachment?: boolean): Promise<DocumentRecord>;
  documents(): Promise<DocumentRecord[]>;
  openDocument(id: string): Promise<void>;
  exportedDocuments(tripId: string): Promise<DocumentStatus>;
  chooseFolder(): Promise<string | undefined>;
  openFolder(folder: string): Promise<void>;
}
