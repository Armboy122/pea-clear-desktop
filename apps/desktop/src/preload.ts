import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@pea/contracts';

const bridge: DesktopBridge = {
  settings: () => ipcRenderer.invoke('pea:settings'),
  saveSettings: (settings) => ipcRenderer.invoke('pea:settings-save', settings),
  history: () => ipcRenderer.invoke('pea:history'),
  saveTrip: (trip, team) => ipcRenderer.invoke('pea:trip-save', { trip, team }),
  exportTrip: (trip, team, exportRoot) => ipcRenderer.invoke('pea:export', { trip, team, exportRoot }),
  importDocument: (fileName, bytes, attachment) => ipcRenderer.invoke('pea:document-import', fileName, bytes, attachment),
  documents: () => ipcRenderer.invoke('pea:documents'),
  openDocument: (id) => ipcRenderer.invoke('pea:document-open', id),
  exportedDocuments: (id) => ipcRenderer.invoke('pea:exported-documents', id),
  chooseFolder: () => ipcRenderer.invoke('pea:choose-folder'),
  openFolder: (folder) => ipcRenderer.invoke('pea:open-folder', folder),
};
contextBridge.exposeInMainWorld('pea', bridge);
