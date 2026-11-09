import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { API_PORT, MAX_PDF_BYTES } from '@pea/contracts';
import { DocumentInputError, type DocumentArchive } from './document-archive';
import { UserInputError, type ApplicationService } from './service';

const pdfQuery = z.object({ fileName: z.string().max(4096).default('document.pdf') });

export function createApi(service: ApplicationService, archive: DocumentArchive, port = API_PORT) {
  const server = Fastify({ bodyLimit: 512 * 1024, requestTimeout: 15_000, connectionTimeout: 30_000 });
  server.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    if (request.headers.origin || request.headers['sec-fetch-site'] ||
        (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)) {
      await reply.code(403).send({ error: 'Local CLI requests only' });
    }
  });
  server.setErrorHandler((error, _request, reply) => {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : undefined;
    const status = error instanceof ZodError || error instanceof UserInputError || error instanceof DocumentInputError ? 400
      : typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    const message = error instanceof ZodError
      ? error.issues.map((issue) => [issue.path.join('.'), issue.message].join(' — ')).join('\n')
      : error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการทำงาน';
    return reply.code(status).send({ error: message });
  });
  server.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: MAX_PDF_BYTES }, (_request, body, done) => done(null, body));
  server.get('/v1/health', async () => ({ status: 'ok', service: 'PEA Clear Desktop' }));
  server.get('/v1/trips', async () => service.history());
  server.get('/v1/documents', async () => archive.list());
  server.post('/v1/trips', async (request) => service.saveTrip(request.body));
  server.post('/v1/export', async (request) => service.exportTrip(request.body));
  server.post('/v1/parse-pdf', { bodyLimit: MAX_PDF_BYTES }, async (request) => {
    if (!Buffer.isBuffer(request.body)) throw new UserInputError('ส่งไฟล์ PDF เป็น application/pdf');
    const { fileName } = pdfQuery.parse(request.query);
    const document = await archive.importDocument(fileName, request.body);
    return { ...document.data, documentId: document.id };
  });
  return server;
}
