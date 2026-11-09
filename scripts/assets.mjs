import { readFile, writeFile } from 'node:fs/promises';

const assets = new URL('../packages/core/assets/', import.meta.url);
const font = async (filename) => 'data:font/ttf;base64,' + await readFile(new URL('TH-Sarabun-New/' + filename, assets), 'base64');
const [css, logoBase64, fontRegular, fontBold] = await Promise.all([
  readFile(new URL('../packages/core/src/print.css', import.meta.url), 'utf8'),
  readFile(new URL('pea-logo.base64', assets), 'utf8'),
  font('THSarabunNew.ttf'),
  font('THSarabunNew Bold.ttf'),
]);
const logo = 'data:image/png;base64,' + logoBase64.trim();
await writeFile(new URL('../apps/desktop/src/generated-print-assets.json', import.meta.url), JSON.stringify({ css, logo, fontRegular, fontBold }));
