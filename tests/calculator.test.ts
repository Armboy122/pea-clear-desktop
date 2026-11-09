import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { DEFAULT_EXPORT_RELATIVE, defaultTeam, memberSchema, tripSchema } from '@pea/contracts';
import { bahtText, calculateTrip, createRoute, dateRange, formatThaiDate, normalizeThaiDate, readTripPayload } from '@pea/core';

const tripId = 'd083ce56-b9cf-412b-9b38-7d104e2cdd66';
const order = { orderNo: 'TL26130529', work: 'บำรุงรักษา ABS', location: 'กฟจ.ยะลา', pms: [{ costCenter: '4008350630', pmDays: 3 }] };
const trip = tripSchema.parse({
  id: tripId, orders: [order, { ...order, pms: [{ pmDays: 1, costCenter: 'รหัสภายใน' }] }],
  travelSegments: createRoute([order], '2026-06-07', '2026-06-13'),
  participants: [{ memberId: '501508', selected: true }, { memberId: '503408', selected: true, customDays: 5, customNights: 3, customBudgetDays: 2 }, { memberId: '503354', selected: false }],
});

test('calculates clearance and PM allocations from separate day bases', () => {
  const result = calculateTrip(trip, defaultTeam);
  expect(result).toMatchObject({ tripDays: 6, tripNights: 6, totalPmDays: 4, combinedOrderNo: 'TL26130529', combinedWork: 'บำรุงรักษา ABS' });
  expect(result.people).toHaveLength(2);
  expect(result.people[0]).toMatchObject({
    effectiveDays: 6, effectiveNights: 6, budgetDays: 4, dayDifference: 2,
    dailyAllowanceAmount: 1620, extraAllowanceAmount: 180, flatHotelAmount: 3900,
    clearTotal: 5700, clearTotalText: 'ห้าพันเจ็ดร้อยบาทถ้วน', budgetTotal: 3800,
    allocations: [
      { costCenter: '4008350630', allowance: 900, hotel: 1950, total: 2850 },
      { costCenter: 'รหัสภายใน', allowance: 300, hotel: 650, total: 950 },
    ],
  });
  expect(result.people[1]).toMatchObject({
    effectiveDays: 5, effectiveNights: 3, budgetDays: 2, clearTotal: 4850,
    budgetTotal: 2740, allocationTotals: { allowance: 1480, hotel: 4000, total: 5480 },
  });
});

test('honors zero-day overrides and sums money in satang', () => {
  const team = [{ ...defaultTeam[0], dailyAllowanceRate: 270.01, extraAllowanceRate: 0.02, flatHotelRate: 650.1 }];
  const input = { ...trip, participants: [{ memberId: team[0].id, selected: true, customNights: 0, customBudgetDays: 0 }] };
  expect(calculateTrip(input, team).people[0]).toMatchObject({ clearTotal: 1620.18, flatHotelAmount: 0, budgetTotal: 0 });
});

test('generates sequential route and report entries', () => {
  const route = createRoute([order, { ...order, location: 'กฟจ.ปัตตานี' }], '2026-06-07', '2026-06-13');
  expect(route.map(({ fromPlace, toPlace }) => [fromPlace, toPlace])).toEqual([
    ['ฝปบ.', 'กฟจ.ยะลา'], ['กฟจ.ยะลา', 'กฟจ.ปัตตานี'], ['กฟจ.ปัตตานี', 'ฝปบ.'],
  ]);
  expect(calculateTrip(trip, defaultTeam).workEntries.map(({ date }) => date)).toEqual(['7 มิ.ย. 69', 'ถึง', '13 มิ.ย. 69']);
  expect(calculateTrip({ ...trip, workEntries: [] }, defaultTeam).workEntries).toEqual([]);
});

test('validates order and route limits, and employee uniqueness', () => {
  expect(tripSchema.safeParse({ ...trip, orders: Array(6).fill(order) }).success).toBe(false);
  expect(tripSchema.safeParse({ ...trip, travelSegments: Array(11).fill(trip.travelSegments[0]) }).success).toBe(false);
  expect(tripSchema.safeParse({ ...trip, participants: [trip.participants[0], trip.participants[0]] }).success).toBe(false);
});

test.each([
  [0, 'ศูนย์บาทถ้วน'], [1, 'หนึ่งบาทถ้วน'], [11, 'สิบเอ็ดบาทถ้วน'], [20, 'ยี่สิบบาทถ้วน'],
  [21, 'ยี่สิบเอ็ดบาทถ้วน'], [101, 'หนึ่งร้อยเอ็ดบาทถ้วน'], [5700, 'ห้าพันเจ็ดร้อยบาทถ้วน'],
  [1000001, 'หนึ่งล้านเอ็ดบาทถ้วน'], [0.25, 'ยี่สิบห้าสตางค์'], [1.01, 'หนึ่งบาทหนึ่งสตางค์'],
  [-2.5, 'ลบสองบาทห้าสิบสตางค์'], [10.075, 'สิบบาทแปดสตางค์'],
])('reads %s baht', (amount, text) => {
  expect(bahtText(amount)).toBe(text);
});

test('normalizes Buddhist and Gregorian dates without timezone offsets', () => {
  expect(normalizeThaiDate('อนุมัติ ๗ มิ.ย. ๒๕๖๙')).toBe('2026-06-07');
  expect(normalizeThaiDate('6/11/68 06:17:00')).toBe('2025-11-06');
  expect(normalizeThaiDate('31 กุมภาพันธ์ 2569')).toBeUndefined();
  expect(formatThaiDate('2026-06-07')).toBe('7 มิถุนายน 2569');
  expect(dateRange('2026-06-07', '2026-06-13')).toEqual({ month: 'มิถุนายน', range: '7-13' });
  expect(dateRange('2026-12-31', '2027-01-02').range).toBe('31 ธันวาคม 2569-2 มกราคม 2570');
});

const fixture = join(process.env.PEA_CLEAR_FIXTURE_DIR ?? join(homedir(), DEFAULT_EXPORT_RELATIVE), 'payload_tl26130529.json');
test.runIf(existsSync(fixture))('maps the real June trip payload to all seven travelers', () => {
  const input = readTripPayload(JSON.parse(readFileSync(fixture, 'utf8')), defaultTeam, tripId);
  const result = calculateTrip(input, defaultTeam);
  expect(result.people.map((person) => person.clearTotal)).toEqual([5700, 5700, 8220, 5700, 5700, 5700, 5700]);
  expect(result.totalPmDays).toBe(6);
  expect(result.people[2].allocations.map((row) => row.total)).toEqual([4110, 4110]);
});

test('validates nicknames before they become Excel worksheet names', () => {
  const member = defaultTeam[0];
  expect(memberSchema.safeParse({ ...member, nickname: 'ก'.repeat(23) }).success).toBe(true);
  for (const nickname of ['ก'.repeat(24), "ชื่อ'", 'False']) {
    expect(memberSchema.safeParse({ ...member, nickname }).success).toBe(false);
  }
});

test('supports multiple PMs per order and extra expenses with VAT credit rules', () => {
  const multiPmTrip = tripSchema.parse({
    ...trip,
    orders: [{
      orderNo: 'TL26130529', work: 'บำรุงรักษา ABS', location: 'กฟจ.ยะลา',
      pms: [{ costCenter: '4008350630', pmDays: 2 }, { costCenter: '4008350631', pmDays: 2 }],
    }],
    extraExpenses: [{
      id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      memberId: '501508',
      date: '2026-06-08',
      accountCode: '52029999',
      description: 'ค่าน้ำดื่ม',
      receiptNo: 'INV-001',
      net: 100,
      vat: 7,
      vatCredit: true,
      allocations: [
        { costCenter: '4008350630', net: 60, vat: 4.2 },
        { costCenter: '4008350631', net: 40, vat: 2.8 },
      ],
    }],
  });
  const result = calculateTrip(multiPmTrip, defaultTeam);
  const first = result.people[0];
  expect(first.extraExpenseTotals).toEqual({ net: 100, vat: 7, gross: 107, budgetAmount: 100 });
  expect(first.clearSubtotal).toBe(5800);
  expect(first.clearTotal).toBe(5807);
  expect(first.budgetSubtotal).toBe(3900);
  expect(first.budgetTotal).toBe(3907);
  expect(first.allocations.map((row) => ({ costCenter: row.costCenter, extraExpense: row.extraExpense, total: row.total }))).toEqual([
    { costCenter: '4008350630', extraExpense: 60, total: 1960 },
    { costCenter: '4008350631', extraExpense: 40, total: 1940 },
  ]);
});
