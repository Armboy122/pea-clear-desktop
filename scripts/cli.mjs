import { readFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:17870/v1';
const [command, file, ...options] = process.argv.slice(2);
const post = (data, contentType = 'application/json') => ({ method: 'POST', headers: { 'Content-Type': contentType }, body: data });

try {
  let response;
  if (command === 'health' || command === 'trips' || command === 'documents') {
    response = await fetch(base + '/' + command);
  } else if (command === 'parse-pdf' && file && !options.length) {
    response = await fetch(base + '/parse-pdf?fileName=' + encodeURIComponent(file), post(await readFile(file), 'application/pdf'));
  } else if (['export', 'save'].includes(command) && file &&
    (!options.length || (command === 'export' && options.length === 2 && options[0] === '--output'))) {
    const payload = JSON.parse(await readFile(file, 'utf8'));
    const body = payload && typeof payload === 'object' && 'trip' in payload ? payload : { trip: payload };
    if (options.length) body.exportRoot = options[1];
    response = await fetch(base + (command === 'export' ? '/export' : '/trips'), post(JSON.stringify(body)));
  } else {
    throw new Error('Usage: npm run cli -- health | trips | documents | parse-pdf <source.pdf> | save <payload.json> | export <payload.json> [--output <absolute-path>]');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? String(response.status));
  console.log(JSON.stringify(data, null, 2));
} catch (error) {
  console.error(error.cause?.code === 'ECONNREFUSED' ? 'กรุณาเปิด PEA Clear Desktop ก่อนเรียก CLI (127.0.0.1:17870)' : error.message);
  process.exitCode = 1;
}
