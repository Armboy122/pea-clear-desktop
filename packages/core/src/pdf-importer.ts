import type { PdfImport } from '@pea/contracts';
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";
import { normalizeThaiDate } from "./dates";

const travelLabels = {
  departDate: /^วันที่เริ่มต้น/,
  returnDate: /^วันที่สิ้นสุด/,
  work: /^วัตถุประสงค์/,
  location: /^สถานที่/,
  vehicle: /^หมายเลขทะเบียน/,
};
const pmNumberLabel = /^เลขที่ใบสั่งซ่อม/;
const pmDescriptionLabel = /^รายละเอียดเพิ่มเติม/;
const travelerHeading = /^รายชื่อผู้เดินทาง/;
const historyHeading = /^ประวัติ/;
const travelerEnd = /^(?:หมายเหตุ|พื้นที่ห้ามพักแรม|ประมาณการ|หมวดค่าใช้จ่าย|ประวัติ)/;
const nextField = /^(?:วันที่เริ่มต้น|วันที่สิ้นสุด|วัตถุประสงค์|สถานที่|ประเภท|หมายเลขทะเบียน|ชื่อผู้ขับ|รายชื่อผู้เดินทาง|รายละเอียดเพิ่มเติม|ผู้แจ้งซ่อม|วันที่ออกใบสั่งซ่อม)/;

function normalizePdfText(text: string) {
  return text.normalize("NFC")
    .replaceAll("\uF292", "#")
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    // Chrome's print font can emit unmapped glyphs for contextual Thai marks.
    .replaceAll("ที\0", "ที่")
    .replaceAll("ริ\0ม", "ริ่ม")
    .replaceAll("สิ\0น", "สิ้น")
    .replaceAll("ชื\0อ", "ชื่อ")
    .replaceAll("พื\0น", "พื้น")
    .replaceAll("เครื\0อง", "เครื่อง")
    .replaceAll("ครั\0ง", "ครั้ง")
    .replaceAll("จําป\0", "จำปี")
    .replaceAll("น\0า", "น้ำ")
    .replace(/ํ([่้๊๋]?)า/g, "$1ำ")
    .replaceAll("\0", "")
    .trim();
}

function valueAfterLabel(rows: string[][], label: RegExp) {
  for (const [index, row] of rows.entries()) {
    const column = row.findIndex((cell) => label.test(cell));
    if (column < 0) continue;

    const cell = row[column] ?? "";
    const inline = cell.replace(label, "").replace(/^\s*[:：]?\s*/, "");
    if (inline) return inline;

    const right = row[column + 1] ?? "";
    if (right && !nextField.test(right)) return right;

    const below = rows[index + 1]?.[column] ?? "";
    if (below && !nextField.test(below)) return below;
  }
  return "";
}

function travelDate(rows: string[][], label: RegExp) {
  return normalizeThaiDate(valueAfterLabel(rows, label)) ?? "";
}

function dateFromHistory(history: string[], status: RegExp) {
  for (let index = history.length - 1; index >= 0; index--) {
    const line = history[index] ?? "";
    if (!status.test(line)) continue;
    const date = normalizeThaiDate(line) ?? normalizeThaiDate(history[index - 1] ?? "");
    if (date) return date;
  }
  return "";
}

function parseTravel(rows: string[][], orderNo: string): PdfImport {
  const headingIndex = rows.findIndex(([first]) => travelerHeading.test(first ?? ""));
  const historyIndex = rows.findIndex(([first]) => historyHeading.test(first ?? ""));
  const history = historyIndex < 0 ? [] : rows.slice(historyIndex).map((row) => row.join(" "));
  const employeeIds = new Set<string>();
  if (headingIndex >= 0) {
    for (const [first = ""] of rows.slice(headingIndex + 1)) {
      if (travelerEnd.test(first)) break;
      const employeeId = first.match(/^(\d{6})(?=\s|$)/)?.[1];
      if (employeeId) employeeIds.add(employeeId);
    }
  }
  return {
    kind: "travel",
    orderNo,
    departDate: travelDate(rows, travelLabels.departDate),
    returnDate: travelDate(rows, travelLabels.returnDate),
    orderDate: dateFromHistory(history, /อนุมัติแล้ว/) || dateFromHistory(history, /สร้างคำขอ/),
    work: valueAfterLabel(rows, travelLabels.work),
    location: valueAfterLabel(rows, travelLabels.location),
    vehicle: valueAfterLabel(rows, travelLabels.vehicle),
    employeeIds: [...employeeIds],
  };
}

export function parsePdfText(pages: string[]): PdfImport {
  const pageRows = pages.map((page) => page.split(/\r?\n/)
    .map((line) => line.split(/\t+| {2,}/).map(normalizePdfText).filter(Boolean))
    .filter((row) => row.length > 0));
  const rows = pageRows.flat();
  const text = rows.map((row) => row.join(" ")).join("\n");
  const orderNo = text.match(/#\s*(TL\s*\d+)\b/i)?.[1]
    ?? (text.includes("PEA-Life") ? text.match(/\b(TL\s*\d+)\b/i)?.[1] : undefined);
  if (orderNo) return parseTravel(rows, orderNo.replace(/\s/g, "").toUpperCase());

  const options = new Map<string, string>();
  for (const page of pageRows) {
    // OMS font subsets encode some Thai marks and digits as Latin characters.
    const pmRows = page.map((row) => row.map((cell) => cell
      .replaceAll("É", "่")
      .replaceAll("Ê", "้")
      .replaceAll("Ś", "2")
      .replaceAll("ś", "3")));
    const costCenter = valueAfterLabel(pmRows, pmNumberLabel).match(/^\d{10}(?=\s|$)/)?.[0];
    const description = valueAfterLabel(pmRows, pmDescriptionLabel);
    if (costCenter && (!options.get(costCenter) || description)) options.set(costCenter, description);
  }
  if (options.size > 0) {
    return { kind: "pm", options: Array.from(options, ([costCenter, description]) => ({ costCenter, description })) };
  }
  throw new Error("ไม่พบข้อมูลจากคำขออนุมัติเดินทาง PEA-Life หรือใบสั่งซ่อม PM OMS");
}

function textInReadingOrder(items: TextItem[]) {
  const runs = items.filter(({ str }) => str.trim()).sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: { baseline: number; runs: TextItem[] }[] = [];
  for (const run of runs) {
    const baseline = run.transform[5];
    const row = rows.at(-1);
    if (row && row.baseline - baseline <= 1.5) row.runs.push(run);
    else rows.push({ baseline, runs: [run] });
  }
  return rows.map((row) => {
    let rightEdge = Infinity;
    let line = "";
    for (const run of row.runs.sort((a, b) => a.transform[4] - b.transform[4])) {
      const x = run.transform[4];
      const gap = x - rightEdge;
      const separator = gap >= 14 ? "\t" : gap > 1.25 ? " " : "";
      line += separator + run.str.trim();
      rightEdge = x + run.width;
    }
    return line;
  }).join("\n");
}

export async function parsePdf(bytes: Uint8Array): Promise<PdfImport> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false });
  try {
    const document = await loading.promise;
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const { items } = await page.getTextContent();
      pages.push(textInReadingOrder(items.filter((item) => "str" in item)));
      page.cleanup();
    }
    return parsePdfText(pages);
  } finally {
    await loading.destroy();
  }
}
