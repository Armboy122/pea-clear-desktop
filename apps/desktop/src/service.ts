import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { settingsSchema, teamSchema, type ExportFiles, type Member, type Trip, type DocumentKind } from '@pea/contracts';
import { calculateTrip, dateRange, readTripPayload } from '@pea/core';
import { documentPageCount, renderDocument } from '../../../packages/core/src/html-templates';
import { parsePdf } from '../../../packages/core/src/pdf-importer';
import { buildWorkbook } from '../../../packages/core/src/xlsx-exporter';
import type { Storage } from './storage';
import assets from './generated-print-assets.json';

const requestSchema = z.object({
  trip: z.unknown(), team: teamSchema.optional(), exportRoot: z.string().trim().min(1).max(4096).optional(),
});
const safeName = (value: string) => Array.from(value.replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')).slice(0, 36).join('');
const notFound = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

export class UserInputError extends Error {}

function validateTrip(trip: Trip, team: Member[]) {
  const ids = new Set(team.map((member) => member.id));
  const selected = trip.participants.filter((person) => person.selected);
  if (!selected.length || selected.some((person) => !ids.has(person.memberId))) throw new UserInputError('กรุณาเลือกผู้เดินทางจากรายชื่อทีมอย่างน้อย 1 คน');
  if (trip.orders.some((order) => order.pms.some((pm) => pm.pmDays > 0 && !pm.costCenter))) throw new UserInputError('ระบุรหัสศูนย์ต้นทุนในทุกแถวที่มีวันตัดงบ');
  if (!trip.orders.some((order) => order.orderNo)) throw new UserInputError('กรุณาระบุเลขที่คำสั่ง');
  if (!trip.travelSegments.length) throw new UserInputError('กรุณาเพิ่มช่วงเดินทาง');
  let previousArrival = '';
  for (const segment of trip.travelSegments) {
    if (!segment.fromPlace || !segment.toPlace || !segment.departDate || !segment.arriveDate) {
      throw new UserInputError('กรุณาระบุสถานที่และวันที่ของทุกช่วงเดินทาง');
    }
    const point = (date: string, time: string) => {
      const [hours, minutes] = time.replace('น.', '').trim().split(/[.:]/);
      return date + (hours && minutes ? hours.padStart(2, '0') + minutes : '');
    };
    const departure = point(segment.departDate, segment.departTime);
    const arrival = point(segment.arriveDate, segment.arriveTime);
    if (segment.arriveDate < segment.departDate || (segment.departTime && segment.arriveTime && arrival < departure) ||
        (previousArrival && (departure.slice(0, 10) < previousArrival.slice(0, 10) ||
        (previousArrival.length > 10 && departure.length > 10 && departure < previousArrival)))) {
      throw new UserInputError('ตรวจลำดับวันและเวลาของตารางเดินทาง');
    }
    previousArrival = arrival;
  }
}

async function publishFiles(folder: string, range: string, place: string, contents: Uint8Array[]): Promise<ExportFiles> {
  await mkdir(folder, { recursive: true });
  const exists = async (file: string) => {
    try {
      await lstat(file);
      return true;
    } catch (error) {
      if (notFound(error)) return false;
      throw error;
    }
  };
  for (let revision = 1; revision <= 9999; revision++) {
    const suffix = revision === 1 ? '' : ` (${revision})`;
    const clear = path.join(folder, `ใบเคลีย ${range}${suffix}.pdf`);
    const budget = path.join(folder, `ใบตัดงบ ${range}${suffix}.pdf`);
    const workbook = path.join(folder, `เคลียเบี้ยเลี้ยง ${range}${place ? ' ' + place : ''}${suffix}.xlsx`);
    const targets = [clear, budget, workbook];
    if ((await Promise.all(targets.map(exists))).some(Boolean)) continue;
    const written: string[] = [];
    try {
      for (const [index, file] of targets.entries()) {
        const handle = await open(file, 'wx', 0o600);
        written.push(file);
        try {
          await handle.writeFile(contents[index]);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      return { folder, clear, budget, workbook };
    } catch (error) {
      await Promise.all(written.map((file) => rm(file, { force: true })));
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('โฟลเดอร์มีชุดเอกสารช่วงนี้ครบ 9,999 ชุด');
}

export class ApplicationService {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly store: Storage, private readonly print: (kind: DocumentKind, html: string, pages: number) => Promise<Uint8Array>) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  settings() { return this.store.settings(); }
  history() { return this.store.history(); }
  saveSettings(input: unknown) {
    const settings = settingsSchema.parse(input);
    if (!path.isAbsolute(settings.exportRoot)) throw new UserInputError('กรุณาใช้พาธแบบเต็มสำหรับโฟลเดอร์ Export');
    return this.serial(() => this.store.saveSettings(settings));
  }

  parsePdf(bytes: Uint8Array) { return parsePdf(bytes); }

  saveTrip(input: unknown) {
    const request = requestSchema.parse(input);
    return this.serial(async () => {
      const team = request.team ?? (await this.store.settings()).team;
      const trip = readTripPayload(request.trip, team, randomUUID());
      const previous = await this.store.trip(trip.id);
      return this.store.saveTrip({ trip, team, updatedAt: new Date().toISOString(), files: previous?.files });
    });
  }

  exportTrip(input: unknown) {
    const request = requestSchema.parse(input);
    return this.serial(async () => {
      const settings = await this.store.settings();
      const team = request.team ?? settings.team;
      const root = request.exportRoot ?? settings.exportRoot;
      if (!path.isAbsolute(root)) throw new UserInputError('กรุณาใช้พาธแบบเต็มสำหรับโฟลเดอร์ Export');
      const trip = readTripPayload(request.trip, team, randomUUID());
      validateTrip(trip, team);
      const start = trip.travelSegments[0].departDate;
      const end = trip.travelSegments.at(-1)?.arriveDate || start;
      const printableTrip = { ...trip, documentDate: trip.documentDate || end };
      const calculation = calculateTrip(printableTrip, team);
      const { people } = calculation;
      const { month, range } = dateRange(start, end);
      const folder = path.join(root, month, range);
      const clear = await this.print('clear', renderDocument('clear', printableTrip, people, assets), documentPageCount('clear', people));
      const budget = await this.print('budget', renderDocument('budget', printableTrip, people, assets), documentPageCount('budget', people));
      const workbook = await buildWorkbook(printableTrip, calculation, assets.logo);
      const files = await publishFiles(folder, range, safeName(calculation.combinedLocation), [clear, budget, workbook]);
      try {
        await this.store.saveTrip({ trip, team, updatedAt: new Date().toISOString(), files });
      } catch (error) {
        await Promise.all([files.clear, files.budget, files.workbook].map((file) => rm(file, { force: true })));
        throw error;
      }
      return files;
    });
  }
}
