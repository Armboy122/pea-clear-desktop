import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { DocumentArchive } from '../apps/desktop/src/document-archive';

function pdfWithText(text: string) {
  const stream = `BT /F1 12 Tf 20 70 Td (${text}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let source = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = source.length;
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'pea-archive-test-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

test('persists the exact original across restarts and deduplicates concurrent imports', async () => {
  const archive = new DocumentArchive(directory);
  const original = pdfWithText('PEA-Life # TL12345678');
  const [first, duplicate] = await Promise.all([
    archive.importDocument('อนุมัติ.pdf', original),
    archive.importDocument('duplicate.pdf', original),
  ]);
  expect(first.data).toMatchObject({ kind: 'travel', orderNo: 'TL12345678' });
  expect(duplicate).toEqual(first);

  const reopened = new DocumentArchive(directory);
  const evidence = await reopened.importDocument('หลักฐาน.pdf', original, true);
  expect(evidence.data).toEqual({ kind: 'attachment' });
  expect(evidence.id).not.toBe(first.id);
  expect(await reopened.list()).toEqual(expect.arrayContaining([first, evidence]));
  const originalPath = await reopened.pathForDocument(first.id);
  expect(await reopened.pathForDocument(evidence.id)).toBe(originalPath);
  expect(await readFile(originalPath)).toEqual(original);

  await rm(originalPath);
  expect(await reopened.list()).toEqual([]);
  await expect(reopened.pathForDocument(first.id)).rejects.toThrow();
  expect(await reopened.importDocument('restored.pdf', original)).toEqual(first);
  expect(await readFile(await reopened.pathForDocument(evidence.id))).toEqual(original);
});

test('validates upload bytes and document IDs before saving or opening', async () => {
  const archive = new DocumentArchive(directory);
  await expect(archive.importDocument('invalid.pdf', pdfWithText('unrecognized'))).rejects.toThrow(/ไม่พบข้อมูล/);
  await expect(archive.importDocument('invalid.png', Buffer.from('invalid'), true)).rejects.toThrow(/JPEG/);
  await expect(archive.pathForDocument('../settings.json')).rejects.toThrow();
  expect(await archive.list()).toEqual([]);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV0sAAAAASUVORK5CYII=', 'base64');
  const record = await archive.importDocument('C:\\uploads\\หลักฐาน.png', png, true);
  expect(record.fileName).toBe('หลักฐาน.png');
  const saved = await archive.pathForDocument(record.id);
  expect(path.extname(saved)).toBe('.png');
  expect(await readFile(saved)).toEqual(png);
});
