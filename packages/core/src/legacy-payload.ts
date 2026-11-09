import { z } from 'zod';
import { tripSchema, type Member } from '@pea/contracts';
import { normalizeThaiDate } from './dates';

const date = z.string().transform((value, ctx) => {
  const result = normalizeThaiDate(value);
  if (result) return result;
  ctx.addIssue({ code: 'custom', message: 'อ่านวันที่ไม่ได้: ' + value });
  return z.NEVER;
});
const legacy = z.object({
  place: z.string(), depart_date: date, return_date: date, order_date: date.optional(),
  vehicles: z.string().optional(), note: z.string().optional(),
  orders: z.array(z.object({
    order_no: z.string(), work: z.string(), location: z.string().optional(),
    pms: z.array(z.object({ cost_center: z.string(), days: z.number() })).default([]),
  })).min(1),
  travel_segments: z.array(z.object({
    from_place: z.string(), depart_date: date, depart_time: z.string(),
    to_place: z.string(), arrive_date: date, arrive_time: z.string(),
  })).optional(),
  employee_ids: z.array(z.string()).optional(),
});

export function readTripPayload(input: unknown, team: Member[], newId: string) {
  if (typeof input !== 'object' || input === null || !('depart_date' in input)) return tripSchema.parse(input);
  const data = legacy.parse(input);
  return tripSchema.parse({
    id: newId,
    orders: data.orders.map(({ order_no, work, location, pms }) => ({
      orderNo: order_no, work, location: location || data.place,
      pms: pms.map(({ cost_center, days }) => ({ costCenter: cost_center, pmDays: days })),
    })),
    travelSegments: data.travel_segments?.map((row) => ({
      fromPlace: row.from_place, departDate: row.depart_date, departTime: row.depart_time,
      toPlace: row.to_place, arriveDate: row.arrive_date, arriveTime: row.arrive_time,
    })) ?? [
      { fromPlace: 'ฝปบ.', departDate: data.depart_date, toPlace: data.place, arriveDate: data.depart_date },
      { fromPlace: data.place, departDate: data.return_date, toPlace: 'ฝปบ.', arriveDate: data.return_date },
    ],
    participants: team.map(({ id }) => ({ memberId: id, selected: data.employee_ids?.includes(id) ?? true })),
    orderDate: data.order_date, documentDate: data.return_date, vehicle: data.vehicles, note: data.note,
  });
}
