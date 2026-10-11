import { contextBridge, ipcRenderer } from 'electron';
import type { FormaAPI } from '../src/shared/api';
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const api: FormaAPI = {
  list: () => invoke('projects:list'), open: id => invoke('projects:open', id),
  save: (d, saveAs) => invoke('projects:save', d, saveAs), autosave: d => invoke('projects:autosave', d),
  recover: id => invoke('projects:recover', id), remove: id => invoke('projects:remove', id),
  importAssets: kind => invoke('assets:import', kind), exportFile: (n, f, d) => invoke('export:save', n, f, d),
  removeBackground: (d, p) => invoke('ai:remove', d, p), settings: s => invoke('settings', s),
  aiAssets: () => invoke('ai:assets'),
  fullscreen: () => invoke('fullscreen'), version: () => invoke('version'),
  bundledFonts: () => invoke('fonts:bundled'),
  onClose: callback => { const fn = async () => { try { await callback(); ipcRenderer.send('app:close-ready'); } catch (e) { ipcRenderer.send('app:close-error', String(e)); } }; ipcRenderer.on('app:closing', fn); return () => ipcRenderer.removeListener('app:closing', fn); },
  onOpen: callback => { let live = true; const fn = (_: unknown, d: any) => callback(d); ipcRenderer.on('project:opened', fn); invoke('app:ready').then(d => { if (d && live) callback(d); }); return () => { live = false; ipcRenderer.removeListener('project:opened', fn); }; }
};
contextBridge.exposeInMainWorld('forma', Object.freeze(api));
