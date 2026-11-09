import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { basename, join, resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('make:mac requires macOS');
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, process.argv[2] ?? 'out');
const ignored = (name) => name && name !== '/package.json' &&
  !/^\/(?:node_modules(?:\/|$)|apps(?:\/desktop(?:\/dist(?:\/|$)|$)|$))/.test(name);
const bundles = await packager({
  dir: root, name: 'PEA Clear Desktop', appBundleId: 'com.pea.cleardesktop',
  platform: 'darwin', arch: process.arch, electronVersion: require('electron/package.json').version,
  out: output, overwrite: true, ignore: ignored,
  extraResource: join(root, 'packages/core/assets/TH-Sarabun-New'),
  asar: { unpack: '**/*.node' },
});
for (const folder of bundles) {
  const app = join(folder, 'PEA Clear Desktop.app');
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const zip = join(output, basename(folder) + '.zip');
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, zip], { stdio: 'inherit' });
  console.log(zip);
}
