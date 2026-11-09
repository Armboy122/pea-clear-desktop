import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { API_PORT, DEFAULT_EXPORT_RELATIVE, defaultTeam, type DocumentKind } from '@pea/contracts';
import { fitTravelPlaces } from '../../../packages/core/src/print-layout';
import { DocumentArchive } from './document-archive';
import { ApplicationService } from './service';
import { createApi } from './api';
import { Storage } from './storage';

const profile = process.env.PEA_CLEAR_USER_DATA;
app.setName(profile ? 'PEA Clear Desktop Test' : 'PEA Clear Desktop');
if (profile) app.setPath('userData', path.resolve(profile));
const renderer = path.join(__dirname, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(renderer).href;
const webPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false };
let mainWindow: BrowserWindow | null = null;
let printing = false;

async function fileExists(file: string) {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false;
    throw error;
  }
}

function protectWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
}

async function printDocument(kind: DocumentKind, html: string, pages: number) {
  printing = true;
  const window = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences });
  protectWindow(window);
  const tempFile = path.join(app.getPath('temp'), `pea-print-${randomUUID()}.html`);
  try {
    await writeFile(tempFile, html, { encoding: 'utf8', mode: 0o600 });
    await window.loadFile(tempFile);
    const valid = await window.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await (${fitTravelPlaces.toString()})(document);
      await Promise.all([...document.images].map((image) => image.decode()));
      const pages = [...document.querySelectorAll('.page')];
      const overflow = pages.map((page, index) => {
        const box = page.getBoundingClientRect();
        return Array.from(page.querySelectorAll('*')).some((child) => {
          const rect = child.getBoundingClientRect();
          return rect.width && (rect.right > box.right + 2 || rect.bottom > box.bottom + 2 || rect.left < box.left - 2);
        }) ? index + 1 : 0;
      }).filter(Boolean);
      return { pages: pages.length, overflow };
    })()`);
    if (valid.pages !== pages || valid.overflow.length) throw new Error((kind === 'clear' ? 'ใบเคลีย' : 'ใบตัดงบ') + ' เกินขนาด A4 กรุณาย่อข้อความในหน้า ' + valid.overflow.join(', '));
    return await window.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    window.destroy();
    await rm(tempFile, { force: true }).catch(() => undefined);
    printing = false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1420, height: 960, minWidth: 900, minHeight: 650,
    backgroundColor: '#f5f0e7', show: false, title: 'PEA Clear Desktop',
    webPreferences: { ...webPreferences, preload: path.join(__dirname, 'preload.cjs') },
  });
  protectWindow(window);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { mainWindow = null; });
  mainWindow = window;
  void window.loadFile(renderer);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.on('activate', () => { if (!mainWindow && process.env.PEA_CLEAR_HEADLESS !== '1') createWindow(); });
  app.on('window-all-closed', () => {
    if (!printing && process.platform !== 'darwin') app.quit();
  });
  void app.whenReady().then(async () => {
    const userData = app.getPath('userData');
    const archive = new DocumentArchive(userData);
    const store = new Storage(userData, {
      team: defaultTeam, exportRoot: path.join(app.getPath('home'), DEFAULT_EXPORT_RELATIVE),
    });
    const service = new ApplicationService(store, printDocument);
    const handle = (name: string, callback: (...args: unknown[]) => unknown) => {
      ipcMain.handle(name, (event, ...args) => {
        if (event.sender.id !== mainWindow?.webContents.id || event.senderFrame?.url !== rendererUrl || event.senderFrame?.parent) {
          throw new Error('Invalid renderer');
        }
        return callback(...args);
      });
    };
    handle('pea:settings', () => service.settings());
    handle('pea:settings-save', (input) => service.saveSettings(input));
    handle('pea:history', () => service.history());
    handle('pea:trip-save', (input) => service.saveTrip(input));
    handle('pea:export', (input) => service.exportTrip(input));
    handle('pea:document-import', (name, bytes, attachment) => archive.importDocument(name, bytes, attachment));
    handle('pea:documents', () => archive.list());
    handle('pea:document-open', async (id) => {
      const error = await shell.openPath(await archive.pathForDocument(id));
      if (error) throw new Error(error);
    });
    handle('pea:exported-documents', async (id) => {
      const entry = await store.trip(z.uuid().parse(id));
      if (!entry?.files) return { clear: false, budget: false };
      const [clear, budget] = await Promise.all([fileExists(entry.files.clear), fileExists(entry.files.budget)]);
      return { clear, budget };
    });
    handle('pea:choose-folder', async () => {
      const options = { properties: ['openDirectory', 'createDirectory'] satisfies Electron.OpenDialogOptions['properties'] };
      const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
      return result.canceled ? undefined : result.filePaths[0];
    });
    handle('pea:open-folder', async (input) => {
      const folder = z.string().parse(input);
      const history = await service.history();
      if (!history.some((entry) => entry.files?.folder === folder)) throw new Error('ไม่พบโฟลเดอร์นี้ในประวัติ');
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    });
    const port = Number(process.env.PEA_CLEAR_API_PORT) || API_PORT;
    const api = createApi(service, archive, port);
    await api.listen({ host: '127.0.0.1', port });
    app.on('before-quit', () => { void api.close(); });
    if (process.env.PEA_CLEAR_HEADLESS !== '1' && !mainWindow) createWindow();
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (process.env.PEA_CLEAR_HEADLESS !== '1') dialog.showErrorBox('เปิด PEA Clear Desktop ไม่สำเร็จ', message);
    app.exit(1);
  });
}
