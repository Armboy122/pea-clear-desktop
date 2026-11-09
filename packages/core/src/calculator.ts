import type { ExtraExpense, Member, Order, Segment, Trip, WorkEntry } from '@pea/contracts';
import { bahtText } from './baht-text';
import { diffInCalendarDays, formatThaiShortDate } from './dates';

const unique = (values: string[]) => [...new Set(values.filter(Boolean))].join(', ');
const amount = (rate: number, days: number) => Math.round(rate * 100) * days / 100;
export const addMoney = (...amounts: number[]) => amounts.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
const timeText = (value: string) => value && (value.endsWith('น.') ? value : value.replace(':', '.') + ' น.');

function calculateExpense(expense: ExtraExpense) {
  const money = ({ net, vat }: { net: number; vat: number }) => ({
    gross: addMoney(net, vat),
    budgetAmount: expense.vatCredit ? net : addMoney(net, vat),
  });
  return {
    ...expense,
    ...money(expense),
    allocations: expense.allocations.map((allocation) => ({ ...allocation, ...money(allocation) })),
  };
}

export function createRoute(orders: Order[], departDate: string, returnDate: string): Segment[] {
  const places = [...new Set(orders.flatMap((order) => order.location.split(/[,，]/).map((place) => place.trim()).filter(Boolean)))].slice(0, 9);
  if (!places.length) return [];
  const stops = ['ฝปบ.', ...places, 'ฝปบ.'];
  return stops.slice(1).map((toPlace, index) => ({
    fromPlace: stops[index], toPlace,
    departDate: index === 0 ? departDate : index === places.length ? returnDate : '',
    arriveDate: index === 0 ? departDate : index === places.length ? returnDate : '',
    departTime: '', arriveTime: '',
  }));
}

export function createWorkEntries(trip: Trip): WorkEntry[] {
  return trip.travelSegments.flatMap((segment, index) => {
    const work = trip.orders.find((order) => order.location === segment.toPlace && order.work)?.work
      || trip.orders[index]?.work || trip.orders[0]?.work;
    const entries = [{
      date: formatThaiShortDate(segment.departDate), workNumber: trip.workNumber === '-' ? '' : trip.workNumber,
      text: `เดินทางจาก ${segment.fromPlace}  เวลา ${timeText(segment.departTime)}  ถึง ${segment.toPlace}  เวลา ${timeText(segment.arriveTime)}`,
    }];
    if (work && segment.toPlace !== 'ฝปบ.') entries.push({ date: 'ถึง', text: `งานที่ได้ปฏิบัติ ${work}`, workNumber: '' });
    return entries;
  });
}

export function calculateTrip(trip: Trip, team: Member[]) {
  const first = trip.travelSegments[0];
  const last = trip.travelSegments.at(-1);
  const tripDays = Math.max(0, diffInCalendarDays(first?.departDate ?? '', last?.arriveDate ?? ''));
  const pmRows = trip.orders.flatMap((order) => order.pms.map((pm) => ({ ...pm, order })));
  const totalPmDays = pmRows.reduce((total, row) => total + row.pmDays, 0);
  const combinedOrderNo = unique(trip.orders.map((row) => row.orderNo));
  const combinedWork = unique(trip.orders.map((row) => row.work));
  const combinedLocation = unique(trip.orders.map((row) => row.location));
  const workEntries = trip.workEntries ?? createWorkEntries(trip);
  const memberById = new Map(team.map((member) => [member.id, member]));
  const expenses = (trip.extraExpenses ?? []).map(calculateExpense);
  const people = trip.participants.flatMap((person) => {
    const member = memberById.get(person.memberId);
    if (!person.selected || !member) return [];
    const effectiveDays = person.customDays ?? tripDays;
    const effectiveNights = person.customNights ?? tripDays;
    const budgetDays = person.customBudgetDays ?? totalPmDays;
    const dailyAllowanceAmount = amount(member.dailyAllowanceRate, effectiveDays);
    const extraAllowanceAmount = amount(member.extraAllowanceRate, effectiveDays);
    const flatHotelAmount = amount(member.flatHotelRate, effectiveNights);
    const extraExpenses = expenses.filter((expense) => expense.memberId === member.id);
    const extraExpenseTotals = {
      net: addMoney(...extraExpenses.map((expense) => expense.net)),
      vat: addMoney(...extraExpenses.map((expense) => expense.vat)),
      gross: addMoney(...extraExpenses.map((expense) => expense.gross)),
      budgetAmount: addMoney(...extraExpenses.map((expense) => expense.budgetAmount)),
    };
    const clearSubtotal = addMoney(dailyAllowanceAmount, extraAllowanceAmount, flatHotelAmount, extraExpenseTotals.net);
    const clearTotal = addMoney(clearSubtotal, extraExpenseTotals.vat);
    const budgetDailyAllowance = amount(member.dailyAllowanceRate, budgetDays);
    const budgetExtraAllowance = amount(member.extraAllowanceRate, budgetDays);
    const budgetHotel = amount(member.flatHotelRate, budgetDays);
    const budgetSubtotal = addMoney(budgetDailyAllowance, budgetExtraAllowance, budgetHotel, extraExpenseTotals.net);
    const budgetTotal = addMoney(budgetSubtotal, extraExpenseTotals.vat);
    const extrasByCostCenter = new Map<string, number>();
    for (const expense of extraExpenses) {
      for (const { costCenter, budgetAmount } of expense.allocations) {
        extrasByCostCenter.set(costCenter, addMoney(extrasByCostCenter.get(costCenter) ?? 0, budgetAmount));
      }
    }
    const allocations = pmRows.flatMap(({ costCenter, pmDays }, pmRowIndex) => {
      if (!costCenter) return [];
      const allowance = amount(addMoney(member.dailyAllowanceRate, member.extraAllowanceRate), pmDays);
      const hotel = amount(member.flatHotelRate, pmDays);
      const extraExpense = extrasByCostCenter.get(costCenter) ?? 0;
      // Repeated PM codes still have separate base rows. Expense splits apply once per code.
      extrasByCostCenter.delete(costCenter);
      return [{ costCenter, pmDays, pmRowIndex, allowance, hotel, extraExpense, total: addMoney(allowance, hotel, extraExpense) }];
    });
    const allocationTotals = {
      allowance: addMoney(...allocations.map((row) => row.allowance)),
      hotel: addMoney(...allocations.map((row) => row.hotel)),
      extraExpense: addMoney(...allocations.map((row) => row.extraExpense)),
      total: addMoney(...allocations.map((row) => row.total)),
    };
    return [{
      member, effectiveDays, effectiveNights, budgetDays, totalPmDays, dailyAllowanceAmount, extraAllowanceAmount,
      flatHotelAmount, clearSubtotal, clearTotal, clearTotalText: bahtText(clearTotal), budgetDailyAllowance, budgetExtraAllowance,
      budgetHotel, budgetSubtotal, budgetTotal, budgetTotalText: bahtText(budgetTotal), allocations, allocationTotals,
      extraExpenses, extraExpenseTotals,
      combinedOrderNo, combinedWork, combinedLocation, workEntries, dayDifference: effectiveDays - totalPmDays,
    }];
  });
  return { tripDays, tripNights: tripDays, totalPmDays, pmRows, people, combinedOrderNo, combinedWork, combinedLocation, workEntries };
}
export type PersonCalculation = ReturnType<typeof calculateTrip>['people'][number];
