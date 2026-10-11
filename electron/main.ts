import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from 'electron';
import { readFile, writeFile, mkdir, rename, readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { encodeProject, decodeProject, MAX_ARCHIVE } from './archive';
import { defaults, validateDesign, validateSettings, type Design, type Recent, type Settings } from '../src/shared/model';
import type { AIResult, Imported } from '../src/shared/api';
import { imageSize } from 'image-size';

if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'FormaData'));
if (process.env.FORMA_TEST_DATA && !app.isPackaged) app.setPath('userData', path.resolve(process.env.FORMA_TEST_DATA));
let win: BrowserWindow;
let settings: Settings = defaults;
let index: (Recent & { path: string })[] = [];
let worker: Worker | undefined;
let aiBusy = false;
let serial = Promise.resolve();
let initialDesign: Design | null = null;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
const root = () => app.getPath('userData');
const modelPath = () => app.isPackaged ? path.join(process.resourcesPath, 'models/u2netp.onnx') : path.join(app.getAppPath(), 'assets/models/u2netp.onnx');
const wasmPath = (gpu = false) => path.join(app.isPackaged ? path.join(process.resourcesPath, 'onnx') : path.join(app.getAppPath(), 'node_modules/onnxruntime-web/dist'), gpu ? 'ort-wasm-simd-threaded.asyncify.wasm' : 'ort-wasm-simd-threaded.wasm');
const recoveryPath = (id: string) => path.join(root(), 'recovery', safeId(id) + '.forma');
function safeId(id: unknown): string { if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('Invalid project ID.'); return id; }
async function atomic(file: string, data: string | Uint8Array) { await mkdir(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; await writeFile(tmp, data); await rename(tmp, file); }
async function writeIndex() { await atomic(path.join(root(), 'projects.json'), JSON.stringify(index)); }
function summary(d: Design): Recent { return { id: d.id, name: d.name, modified: d.modified, thumbnail: d.pages[0].thumbnail, pages: d.pages.length, template: d.template }; }
function handler(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted IPC sender.');
    try { return await fn(...args); } catch (e) { throw new Error(e instanceof Error ? e.message : 'Operation failed.'); }
  });
}
async function loadFile(file: string) {
  if ((await stat(file)).size > MAX_ARCHIVE) throw new Error('Project exceeds 512 MB.');
  const data = await readFile(file); const d = decodeProject(data);
  index = [ { ...summary(d), path: file }, ...index.filter(x => x.id !== d.id) ].slice(0, 100);
  await writeIndex(); return d;
}
function dataBytes(data: unknown, limit = 128 * 1024 * 1024) {
  if (typeof data !== 'string' || data.length > limit * 1.4 || !/^data:[\w/+.-]+;base64,[a-zA-Z0-9+/=]+$/.test(data)) throw new Error('Invalid or oversized data.');
  const bytes = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  if (bytes.length > limit) throw new Error('Data exceeds safe limits.'); return bytes;
}
async function setup() {
  await mkdir(path.join(root(), 'recovery'), { recursive: true });
  try { settings = validateSettings(JSON.parse(await readFile(path.join(root(), 'settings.json'), 'utf8'))); } catch { /* use defaults */ }
  try { const j = JSON.parse(await readFile(path.join(root(), 'projects.json'), 'utf8')); if (Array.isArray(j)) index = j.filter(x => typeof x.path === 'string' && typeof x.id === 'string').slice(0, 100); } catch { /* first launch */ }
  handler('projects:list', async () => {
    const list: Recent[] = index.map(({ path: _path, ...x }) => x);
    for (const f of await readdir(path.join(root(), 'recovery'))) if (/^[a-zA-Z0-9-]+\.forma$/.test(f)) {
      try { const d = decodeProject(await readFile(path.join(root(), 'recovery', f))); const old = list.find(x => x.id === d.id);
        if (!old || d.modified > old.modified) { if (old) list.splice(list.indexOf(old), 1); list.unshift({ ...summary(d), recovery: true }); }
      } catch { /* corrupt recovery does not hide healthy projects */ }
    }
    return list.sort((a, b) => b.modified.localeCompare(a.modified));
  });
  handler('projects:open', async (id?: string) => {
    if (id) { const entry = index.find(x => x.id === safeId(id)); if (!entry) throw new Error('Project is no longer in recent projects.'); return loadFile(entry.path); }
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Forma project', extensions: ['forma'] }], properties: ['openFile'] });
    return r.canceled ? null : loadFile(r.filePaths[0]);
  });
  handler('projects:save', async (d: Design, saveAs = false) => {
    validateDesign(d); if (typeof saveAs !== 'boolean') throw new Error('Invalid save request.');
    let target = saveAs ? undefined : index.find(x => x.id === d.id)?.path;
    if (!target) { const r = await dialog.showSaveDialog(win, { defaultPath: d.name.replace(/[<>:"/\\|?*]/g, '') + '.forma', filters: [{ name: 'Forma project', extensions: ['forma'] }] }); if (r.canceled || !r.filePath) return false; target = r.filePath; }
    await serial; const bytes = encodeProject(d); await atomic(target, bytes);
    index = [{ ...summary(d), path: target }, ...index.filter(x => x.id !== d.id)].slice(0, 100); await writeIndex();
    await unlink(recoveryPath(d.id)).catch(() => {}); return true;
  });
  handler('projects:autosave', (d: Design) => { validateDesign(d); serial = serial.catch(() => {}).then(() => atomic(recoveryPath(d.id), encodeProject(d))); return serial; });
  handler('projects:recover', async id => decodeProject(await readFile(recoveryPath(id))));
  handler('projects:remove', async id => {
    safeId(id); const entry = index.find(x => x.id === id); const r = await dialog.showMessageBox(win, { type: 'question', buttons: entry ? ['Cancel', 'Remove from library', 'Move file to Recycle Bin'] : ['Cancel', 'Delete recovery project'], defaultId: 0, cancelId: 0, message: 'Remove this project?', detail: entry ? 'Remove from library keeps the saved .forma file. Move to Recycle Bin deletes that file recoverably. Both remove recovery data.' : 'This project exists only as recovery data. Deleting it removes that local recovery file.' });
    if (r.response === 0) return; if (r.response === 2 && entry) await shell.trashItem(entry.path); await serial; index = index.filter(x => x.id !== id); await writeIndex(); await unlink(recoveryPath(id)).catch(() => {});
  });
  handler('assets:import', async kind => {
    if (!['image', 'font'].includes(kind)) throw new Error('Invalid import kind.');
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: kind === 'font' ? 'Fonts' : 'Images', extensions: kind === 'font' ? ['ttf', 'otf', 'woff', 'woff2'] : ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] });
    if (r.canceled) return [];
    const results: Imported[] = [];
    for (const file of r.filePaths.slice(0, 30)) {
      const bytes = await readFile(file); if (bytes.length > 64 * 1024 * 1024) throw new Error('Asset exceeds 64 MB.');
      const ext = path.extname(file).slice(1).toLowerCase();
      if (kind === 'font') { if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) throw new Error('Unsupported font.'); results.push({ name: path.basename(file), kind: 'font', data: `data:font/${ext};base64,${bytes.toString('base64')}` }); }
      else if (ext === 'svg') results.push({ name: path.basename(file), kind: 'svg', data: bytes.toString('utf8') });
      else { if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw new Error('Unsupported image.'); const size = imageSize(bytes); if (!size.width || !size.height || size.width * size.height > 70_000_000) throw new Error('Images are limited to 70 megapixels.'); results.push({ name: path.basename(file), kind: 'image', data: `data:image/${ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}` }); }
    }
    return results;
  });
  handler('export:save', async (name, format, data) => {
    if (typeof name !== 'string' || name.length > 200 || !['png', 'jpg', 'svg', 'pdf', 'zip'].includes(format)) throw new Error('Invalid export request.');
    const bytes = dataBytes(data); const expected = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', pdf: 'application/pdf', zip: 'application/zip' }[format as 'png'];
    if (!data.startsWith('data:' + expected + ';base64,')) throw new Error('Export MIME mismatch.');
    const r = await dialog.showSaveDialog(win, { defaultPath: name.replace(/[<>:"/\\|?*]/g, '') + '.' + format, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (r.canceled || !r.filePath) return false; await atomic(r.filePath, bytes); return true;
  });
  handler('ai:assets', async () => ({ model: await readFile(modelPath()), wasm: await readFile(wasmPath(true)) }));
  handler('ai:remove', async (data, provider) => {
    if (!['auto', 'cpu'].includes(provider) || !/^data:image\/(png|jpeg|webp);base64,/.test(data)) throw new Error('Invalid inference request.');
    const bytes = dataBytes(data, 64 * 1024 * 1024); if (aiBusy) throw new Error('Background removal is already running.'); aiBusy = true;
    try {
      const result = await new Promise<AIResult>((resolve, reject) => {
        worker = new Worker(path.join(__dirname, 'ai-worker.js'), { workerData: { bytes, model: modelPath(), wasm: wasmPath() }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
        const timeout = setTimeout(() => { void worker?.terminate(); reject(new Error('Background removal timed out after 3 minutes.')); }, 180000);
        worker.once('message', m => { clearTimeout(timeout); if (m.error) reject(new Error(m.error)); else resolve(m); });
        worker.once('error', e => { clearTimeout(timeout); reject(e); });
        worker.once('exit', code => { clearTimeout(timeout); if (code !== 0) reject(new Error('AI worker stopped unexpectedly.')); });
      }); return result;
    } finally { await worker?.terminate(); worker = undefined; aiBusy = false; }
  });
  handler('settings', async value => { if (value !== undefined) { settings = validateSettings(value); await atomic(path.join(root(), 'settings.json'), JSON.stringify(settings)); } return settings; });
  handler('fullscreen', () => win.setFullScreen(!win.isFullScreen()));
  handler('version', () => app.getVersion());
  handler('app:ready', () => { const d = initialDesign; initialDesign = null; return d; });
  handler('fonts:bundled', async () => Promise.all([['Inter', 'Inter'], ['Space Grotesk', 'SpaceGrotesk'], ['Lora', 'Lora']].map(async ([family, name]) => ({ family, data: 'data:font/ttf;base64,' + (await readFile(path.join(app.getAppPath(), 'dist/fonts', name + '.ttf'))).toString('base64') }))));
}
app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !['file:', 'data:', 'blob:', 'devtools:'].some(s => details.url.startsWith(s)) }));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  await setup();
  win = new BrowserWindow({ width: 1500, height: 980, minWidth: 1050, minHeight: 700, backgroundColor: '#181C2B', title: 'Forma', icon: path.join(app.getAppPath(), 'dist/brand/icon.png'), show: false, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => win.show());
  let closeReady = false;
  win.on('close', event => { if (closeReady) return; event.preventDefault(); win.webContents.send('app:closing'); });
  ipcMain.on('app:close-ready', event => { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return; closeReady = true; win.close(); });
  ipcMain.on('app:close-error', async (event, message) => { if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return; const result = await dialog.showMessageBox(win, { type: 'warning', message: 'Recovery save failed. Close anyway?', detail: String(message).slice(0, 500), buttons: ['Keep editing', 'Close without recovery'], defaultId: 0, cancelId: 0 }); if (result.response === 1) { closeReady = true; win.close(); } });
  const file = process.argv.find(x => x.toLowerCase().endsWith('.forma'));
  if (file) { try { initialDesign = await loadFile(path.resolve(file)); } catch (e) { await dialog.showMessageBox(win, { type: 'error', message: String(e) }); } }
  await win.loadFile(path.join(app.getAppPath(), 'dist/index.html'));
}).catch(e => { console.error(e); app.quit(); });
app.on('second-instance', async (_event, args) => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); const file = args.find(x => x.toLowerCase().endsWith('.forma')); if (file) { try { win.webContents.send('project:opened', await loadFile(path.resolve(file))); } catch (e) { await dialog.showMessageBox(win, { type: 'error', message: String(e) }); } } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { void worker?.terminate(); });

