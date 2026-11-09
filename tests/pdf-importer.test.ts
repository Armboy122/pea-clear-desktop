import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parsePdf, parsePdfText } from "../packages/core/src/pdf-importer";

const fixtureDir = process.env.PEA_CLEAR_FIXTURE_DIR ?? join(
  homedir(), "Library", "CloudStorage", "GoogleDrive-arm.09686@gmail.com",
  "ไดรฟ์ของฉัน", "01_PEA_Work", "Pea", "เคลียเอกสาร",
);
const travelPath = join(fixtureDir, "คำสั่ง 3-7 พ.ย..pdf");
const pmPath = join(fixtureDir, "มิถุนายน", "ใบสั่งซ่อม-มิย69.pdf");

test.runIf(existsSync(travelPath))("imports the supplied two-page PEA-Life order", async () => {
  expect(await parsePdf(await readFile(travelPath))).toEqual({
    kind: "travel",
    orderNo: "TL25236135",
    departDate: "2025-11-03",
    returnDate: "2025-11-07",
    orderDate: "2025-11-06",
    work: "บำรุงรักษาเครื่องมือฮอทไลน์และไม้ฉนวน ครั้งที่ 2 ประจำปี 2568",
    location: "กฟส.ตะโหมด,ควนขนุน,พัทลุง,สทิงพระ",
    vehicle: "82-5012 สงขลา",
    employeeIds: ["501508", "503354", "503408", "506723", "507765"],
  });
});

test.runIf(existsSync(pmPath))("imports all nine options in the supplied OMS PDF", async () => {
  const parsed = await parsePdf(await readFile(pmPath));
  expect(parsed.kind).toBe("pm");
  if (parsed.kind !== "pm") return;
  expect(parsed.options.map(({ costCenter }) => costCenter)).toEqual([
    "4008350628", "4008350629", "4008350630", "4008350631", "4008350633",
    "4008350634", "4008350640", "4008350644", "4008350652",
  ]);
  expect(parsed.options[1]?.description).toBe("PM-Q2-บำรุงรักษาจุดต่อระบบสายส่ง-กฟจ.สข2");
});

test("uses the request creation date until the order is approved", () => {
  expect(parsePdfText([
    [
      "PEA-Life # TL12345678",
      "วันที่เริ่มต้น\tวันที่สิ้นสุด",
      "3 พฤศจิกายน 2568\t7 พฤศจิกายน 2568",
      "รายชื่อผู้เดินทาง",
      "เลขประจำตัวพนักงาน\tชื่อ-นามสกุล",
      "123456\tผู้ร่วมเดินทาง",
      "หมายเหตุ",
      "234567 เลขอ้างอิง",
      "ประวัติ",
      "2/11/68 23:06:30",
      "สร้างคำขอ",
      "3/11/68 08:31:00",
      "ตรวจสอบแล้ว: ผ่าน",
    ].join("\n"),
  ])).toMatchObject({
    kind: "travel",
    departDate: "2025-11-03",
    returnDate: "2025-11-07",
    orderDate: "2025-11-02",
    employeeIds: ["123456"],
  });
});

test("rejects an unrelated ten-digit number without a repair order label", () => {
  expect(() => parsePdfText(["เลขอ้างอิง 1234567890"])).toThrow(/ไม่พบข้อมูล/);
});
