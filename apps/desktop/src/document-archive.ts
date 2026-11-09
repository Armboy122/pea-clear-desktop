import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { documentIdSchema, documentRecordSchema, MAX_PDF_BYTES, type DocumentRecord } from '@pea/contracts';
import { parsePdf } from '../../../packages/core/src/pdf-importer';

const signatures = {
  pdf: Buffer.from('%PDF-'),
  jpg: Buffer.from([0xff, 0xd8, 0xff]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};
const manifestSchema = z.object({
  digest: documentIdSchema,
  extension: z.enum(['pdf', 'jpg', 'png']),
  record: documentRecordSchema,
});
type Manifest = z.infer<typeof manifestSchema>;

const hasCode = (error: unknown, code: string) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;
const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const documentId = (digest: string, attachment: boolean) => attachment ? sha256('attachment:' + digest) : digest;

export class DocumentInputError extends Error {}

async function regularFile(file: string) {
  try {
    return (await lstat(file)).isFile();
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function publish(file: string, contents: string | Uint8Array) {
  if (await regularFile(file)) return;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, file);
    } catch (error) {
      if (!hasCode(error, 'EEXIST') || !await regularFile(file)) throw error;
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

function extensionOf(bytes: Buffer, attachment: boolean): Manifest['extension'] {
  if (bytes.subarray(0, signatures.pdf.length).equals(signatures.pdf)) return 'pdf';
  if (attachment) {
    if (bytes.subarray(0, signatures.jpg.length).equals(signatures.jpg)) return 'jpg';
    if (bytes.subarray(0, signatures.png.length).equals(signatures.png)) return 'png';
  }
  throw new DocumentInputError(attachment ? 'เลือกเอกสารแนบเป็น PDF, JPEG หรือ PNG' : 'เลือกไฟล์ PDF');
}

async function parseSource(bytes: Uint8Array) {
  try {
    return await parsePdf(bytes);
  } catch (error) {
    throw new DocumentInputError(error instanceof Error ? error.message : String(error));
  }
}

export class DocumentArchive {
  private readonly manifests: string;
  private readonly originals: string;

  constructor(private readonly userData: string) {
    this.manifests = path.join(userData, 'documents', 'records');
    this.originals = path.join(userData, 'documents', 'originals');
  }

  private recordPath(id: string) {
    return path.join(this.manifests, id + '.json');
  }

  private originalPath({ digest, extension }: Pick<Manifest, 'digest' | 'extension'>) {
    return path.join(this.originals, `${digest}.${extension}`);
  }

  private async manifest(id: string): Promise<Manifest | undefined> {
    const file = this.recordPath(id);
    if (!await regularFile(file)) return undefined;
    const manifest = manifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const attachment = manifest.record.data.kind === 'attachment';
    if (manifest.record.id !== id || documentId(manifest.digest, attachment) !== id || (!attachment && manifest.extension !== 'pdf')) {
      throw new Error('ข้อมูลเอกสารในคลังไม่ถูกต้อง');
    }
    return manifest;
  }

  async importDocument(name: unknown, input: unknown, mode?: unknown): Promise<DocumentRecord> {
    const fileName = z.string().max(4096).parse(name);
    const attachment = z.boolean().default(false).parse(mode);
    if (!(input instanceof Uint8Array)) throw new DocumentInputError('ไม่สามารถอ่านไฟล์ได้');
    if (input.byteLength > MAX_PDF_BYTES) throw new DocumentInputError('ไฟล์ใหญ่เกิน 24 MB');
    const bytes = Buffer.from(input);
    const extension = extensionOf(bytes, attachment);
    const digest = sha256(bytes);
    const id = documentId(digest, attachment);
    const original = this.originalPath({ digest, extension });
    const existing = await this.manifest(id);
    if (existing) {
      if (existing.extension !== extension) throw new Error('ข้อมูลเอกสารในคลังไม่ถูกต้อง');
      await publish(original, bytes);
      return existing.record;
    }

    const basename = path.posix.basename(fileName.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').trim();
    const data = attachment ? { kind: 'attachment' } : await parseSource(bytes);
    const record = documentRecordSchema.parse({
      id, fileName: basename.slice(0, 240).replace(/[\uD800-\uDBFF]$/, '') || `document.${extension}`,
      importedAt: new Date().toISOString(), data,
    });
    await publish(original, bytes);
    await publish(this.recordPath(id), JSON.stringify({ digest, extension, record }));
    const published = await this.manifest(id);
    if (!published) throw new Error('ไม่สามารถบันทึกเอกสารในคลังได้');
    return published.record;
  }

  async list(): Promise<DocumentRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.manifests);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return [];
      throw error;
    }
    const records: DocumentRecord[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      if (!documentIdSchema.safeParse(id).success) continue;
      const manifest = await this.manifest(id);
      if (manifest && await regularFile(this.originalPath(manifest))) records.push(manifest.record);
    }
    return records.sort((left, right) =>
      right.importedAt.localeCompare(left.importedAt) || left.id.localeCompare(right.id));
  }

  async pathForDocument(input: unknown): Promise<string> {
    const id = documentIdSchema.parse(input);
    const manifest = await this.manifest(id);
    if (!manifest) throw new DocumentInputError('ไม่พบไฟล์ต้นฉบับในคลังเอกสาร');
    const file = this.originalPath(manifest);
    if (!await regularFile(file)) throw new DocumentInputError('ไม่พบไฟล์ต้นฉบับในคลังเอกสาร');
    const resolved = await realpath(file);
    if (resolved !== path.join(await realpath(this.userData), 'documents', 'originals', path.basename(file))) {
      throw new DocumentInputError('ไม่พบไฟล์ต้นฉบับในคลังเอกสาร');
    }
    return resolved;
  }
}
