import './assets.mjs';
import { build as bundle } from 'esbuild';
import { build as vite } from 'vite';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('../apps/desktop', import.meta.url));
await Promise.all([
  bundle({
    absWorkingDir: desktop,
    entryPoints: ['src/main.ts', 'src/preload.ts'],
    outdir: 'dist',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron', 'fastify', 'exceljs', 'pdfjs-dist'],
  }),
  vite({
    root: desktop,
    configFile: false,
    base: './',
    build: { outDir: 'dist/renderer', emptyOutDir: true },
  }),
]);
