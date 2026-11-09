import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/extract-logo.mjs <template.xlsx>');
const png = execFileSync('/usr/bin/unzip', ['-p', source, 'xl/media/image1.png']);
if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('The template does not contain a PNG at xl/media/image1.png');
writeFileSync(new URL('../packages/core/assets/pea-logo.base64', import.meta.url), png.toString('base64') + '\n');
