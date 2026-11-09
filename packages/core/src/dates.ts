import { z } from 'zod';

export const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const monthNames = [...thaiMonths, ...shortMonths].map((month) => month.replaceAll('.', '\\.?')).join('|');
const thaiDatePattern = new RegExp(`(\\d{1,2})\\s*\x28${monthNames}\x29\\s*(\\d{4}|\\d{2})(?!\\d)`);

export function normalizeThaiDate(input: string): string | undefined {
  const text = input.replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso && z.iso.date().safeParse(iso).success) return iso;
  const numeric = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?!\d)/);
  const named = text.match(thaiDatePattern);
  const match = named ?? numeric;
  if (!match) return undefined;
  const [, day, rawMonth, rawYear] = match;
  const month = named ? ([thaiMonths, shortMonths].map((list) => list.findIndex((value) => value.replaceAll('.', '') === rawMonth.replaceAll('.', ''))).find((index) => index >= 0) ?? -1) + 1 : Number(rawMonth);
  const year = Number(rawYear);
  const ceYear = year < 100 ? 2500 + year - 543 : year >= 2400 ? year - 543 : year;
  const normalized = `${ceYear}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  return z.iso.date().safeParse(normalized).success ? normalized : undefined;
}

function dateParts(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return { day, month, buddhistYear: year + 543 };
}
export function formatThaiDate(iso: string): string {
  if (!iso) return '';
  const { day, month, buddhistYear } = dateParts(iso);
  return `${day} ${thaiMonths[month - 1]} ${buddhistYear}`;
}
export function formatThaiShortDate(iso: string): string {
  if (!iso) return '';
  const { day, month, buddhistYear } = dateParts(iso);
  return `${day} ${shortMonths[month - 1]} ${String(buddhistYear).slice(-2)}`;
}
export function dateRange(start: string, end: string) {
  const from = dateParts(start);
  const to = dateParts(end);
  const sameMonth = from.month === to.month && from.buddhistYear === to.buddhistYear;
  const month = thaiMonths[from.month - 1];
  const range = start === end ? String(from.day) : sameMonth
    ? `${from.day}-${to.day}`
    : `${from.day} ${month}${from.buddhistYear !== to.buddhistYear ? ' ' + from.buddhistYear : ''}-${to.day} ${thaiMonths[to.month - 1]}${from.buddhistYear !== to.buddhistYear ? ' ' + to.buddhistYear : ''}`;
  return { month, range };
}
export function diffInCalendarDays(start: string, end: string): number {
  return start && end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 : 0;
}
