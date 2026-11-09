# PEA Clear Desktop

แอป macOS สำหรับจัดทำใบเคลียและใบตัดงบค่าเดินทางแบบเหมาจ่ายของ กฟภ. แอปคำนวณยอดในเครื่อง ใช้ TH Sarabun New ที่ติดตั้งบนเครื่องในพรีวิวและ PDF และใช้ Sarabun ที่มากับแอปเป็นฟอนต์สำรอง และบันทึกผลคำนวณไว้กับสูตรใน ExcelJS

## เปิดแอป

ใช้ Node.js 22.19 ขึ้นไปสำหรับการพัฒนา

```sh
npm ci
npm run dev
```

ใช้ `npm run make:mac` เพื่อสร้างแอปและ ZIP สำหรับสถาปัตยกรรมของ Mac เครื่องนี้ ผลลัพธ์อยู่ใน `out/` แอปใช้ลายเซ็น ad hoc สำหรับเปิดใช้งานในเครื่อง

## สร้างชุดเอกสาร

1. ลาก PDF คำสั่งเดินทางจาก PEA-Life ลงในแอป หรือกรอกข้อมูลคำสั่งเอง เพิ่ม PDF ใบสั่งซ่อมเพื่อเลือกเลข PM จากรายการ
2. ระบุเลข PM หรือรหัสศูนย์ต้นทุนและจำนวนวันตัดงบ สร้างตารางไปกลับจากสถานที่ เลือกวัน ชั่วโมง และนาทีในแต่ละช่วง
3. ตรวจผู้เดินทาง ปรับวัน วันตัดงบ หรือคืนพักรายคนเมื่อจำเป็น แล้วสลับดูใบเคลียและใบตัดงบในพรีวิว
4. กด **ส่งออก PDF และ XLSX** แอปบันทึก PDF สองไฟล์และ XLSX หนึ่งไฟล์ในโฟลเดอร์ `<ชื่อเดือนไทย>/<ช่วงวันที่>/` ถ้าชื่อไฟล์ซ้ำ แอปเพิ่มเลขชุดท้ายชื่อ
5. เปิด **ประวัติทริป** เพื่อแก้ไขหรือส่งออกอีกครั้ง ใช้ **ตั้งค่า** เพื่อแก้อัตราทีมหรือเลือกโฟลเดอร์ส่งออกเริ่มต้น

โฟลเดอร์เริ่มต้นคือ `~/Library/CloudStorage/GoogleDrive-arm.09686@gmail.com/ไดรฟ์ของฉัน/01_PEA_Work/Pea/เคลียเอกสาร` แอปเก็บประวัติและการตั้งค่าใน `~/Library/Application Support/PEA Clear Desktop/`

ยอดบนใบเคลียใช้วันเดินทางและคืนพักของแต่ละคน ยอดตารางบนของใบตัดงบใช้วันตัดงบรายคนหรือผลรวมวัน PM ส่วนตารางแยกศูนย์ต้นทุนใช้วันของ PM แต่ละแถว แอปแจ้งส่วนต่างบนหน้ากรอกข้อมูลและยังส่งออกได้

## ใช้ CLI และ Local API

เปิดแอปค้างไว้ก่อนเรียก CLI หรือ Local API

```sh
npm run cli -- health
npm run cli -- parse-pdf '/absolute/path/order.pdf'
npm run cli -- export '/absolute/path/payload.json'
npm run cli -- export '/absolute/path/payload.json' --output '/absolute/path/output'
npm run cli -- save '/absolute/path/payload.json'
npm run cli -- trips
```

CLI รับ JSON ทริปตาม `tripSchema` หรือรูปแบบเดิมของ `payload_tl26130529.json` ไฟล์รูปแบบเดิมที่ไม่ระบุ `employee_ids` ใช้สมาชิกทั้งหมดในทีมปัจจุบัน หากส่ง JSON แบบห่อด้วย `{ "trip": … }` ให้ระบุ `team` และ `exportRoot` เพิ่มได้

| วิธี | เส้นทาง | ข้อมูล |
| --- | --- | --- |
| GET | `/v1/health` | สถานะ Local API |
| GET | `/v1/trips` | ประวัติทริป |
| POST | `/v1/trips` | JSON ที่มี `trip` และระบุ `team` เพิ่มได้ |
| POST | `/v1/parse-pdf` | ไบต์ PDF โดยใช้ `Content-Type: application/pdf` |
| POST | `/v1/export` | JSON ที่มี `trip` และระบุ `team` กับ `exportRoot` เพิ่มได้ |

```sh
curl http://127.0.0.1:17870/v1/health
curl http://127.0.0.1:17870/v1/parse-pdf \
  -H 'Content-Type: application/pdf' \
  --data-binary '@/absolute/path/order.pdf'
```

Local API ฟังที่ `127.0.0.1:17870` และรับการเรียกจากโปรแกรมในเครื่อง แอปนำเข้าข้อมูลจากชั้นข้อความของ PDF คำสั่งเดินทางและใบสั่งซ่อม

## ตรวจผลก่อนส่งมอบ

```sh
npm run typecheck
npm test
npm run test:electron
```

การทดสอบ Electron ใช้พอร์ตของแอป ปิดแอปก่อนรันคำสั่งนี้ กำหนด `PEA_CLEAR_FIXTURE_DIR` หากเก็บไฟล์ทดสอบต้นฉบับไว้นอกโฟลเดอร์ Google Drive ตามค่าเริ่มต้น กำหนด `PEA_CLEAR_QA_OUTPUT` เป็นพาธแบบเต็มเพื่อเก็บไฟล์ตัวอย่างจากการทดสอบ
