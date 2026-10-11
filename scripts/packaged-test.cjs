const { _electron: electron, chromium } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), dir = path.join(root, 'test-results');
const checks = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const execute = (file, args) => new Promise((resolve, reject) => execFile(file, args, { windowsHide: true, timeout: 120000 }, (e, stdout, stderr) => e ? reject(new Error(e.message + '\n' + stderr)) : resolve(stdout)));
async function exercise(executable, label, portableDirectory) {
  console.log('Checking ' + label);
  const env = { ...process.env }; if (portableDirectory) env.PORTABLE_EXECUTABLE_DIR = portableDirectory;
  const app = await electron.launch({ executablePath: executable, args: [], env, timeout: 60000 });
  try {
    const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), data: app.getPath('userData') })); assert.equal(info.packaged, true); assert.equal(info.version, '1.0.0');
    const page = await app.firstWindow(); await page.context().setOffline(true); const requests = []; page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    await page.getByRole('button', { name: 'Create a design', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create a design', exact: true }).click(); await page.getByRole('button', { name: 'Create design', exact: true }).click();
    await page.getByRole('button', { name: 'Rectangle', exact: true }).click(); await page.getByRole('button', { name: 'Layers', exact: true }).click(); assert.equal(await page.getByLabel('Layer name').count(), 1);
    const result = await page.evaluate(async () => {
      if (window.__formaEditor) throw new Error('Test editor hook present in production build.');
      if (window.require || window.process) throw new Error('Renderer Node isolation failed.');
      const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#181c2b'; ctx.fillRect(16, 8, 32, 50);
      const cpu = await window.forma.removeBackground(c.toDataURL(), 'cpu'); const auto = await window.forma.removeBackground(c.toDataURL(), 'auto');
      let rejected = false; try { await window.forma.removeBackground('data:image/png;base64,YWJj', 'cpu'); } catch { rejected = true; } if (!rejected) throw new Error('Corrupt AI image accepted.');
      return { cpu: cpu.provider, auto: auto.provider, width: cpu.width, height: cpu.height };
    });
    assert.equal(result.cpu, 'cpu'); assert.equal(result.width, 64); assert.equal(result.height, 64); assert.deepEqual(requests, []);
    await page.screenshot({ path: path.join(dir, label + '.png') }); checks.push(`${label}: production launch, interactive shape/layer UI, bundled CPU and auto ONNX, bad-image handling, offline renderer, no test hook (${result.auto})`);
    return info.data;
  } finally { await app.close(); }
}
async function portableExercise(executable, portableDir) {
  console.log('Checking portable launcher using renderer DevTools only');
  const server = require('node:net').createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r));
  const child = spawn(executable, ['--remote-debugging-port=' + port], { windowsHide: true, stdio: 'ignore' }); let browser;
  const exited = new Promise(r => child.once('exit', r));
  try {
    let endpoint; for (let i = 0; i < 180; i++) { try { const response = await fetch('http://127.0.0.1:' + port + '/json/version'); endpoint = (await response.json()).webSocketDebuggerUrl; if (endpoint) break; } catch { /* extracting */ } await sleep(500); }
    if (!endpoint) throw new Error('Portable app did not expose test-only DevTools endpoint.'); browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0]; await context.setOffline(true); const page = context.pages()[0]; await page.getByRole('button', { name: 'Create a design', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.forma.version()), '1.0.0'); await page.getByRole('button', { name: 'Create a design', exact: true }).click(); await page.getByRole('button', { name: 'Create design', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.artboard-label')?.textContent.includes('1280'));
    await page.getByRole('button', { name: 'Circle', exact: true }).click(); await page.getByRole('button', { name: 'Layers', exact: true }).click(); assert.equal(await page.getByLabel('Layer name').count(), 1);
    const provider = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#181c2b'; ctx.fillRect(16, 8, 32, 50); return (await window.forma.removeBackground(c.toDataURL(), 'cpu')).provider; }); assert.equal(provider, 'cpu');
    await page.screenshot({ path: path.join(dir, 'portable.png') }); await page.evaluate(() => window.close()); await Promise.race([exited, sleep(30000).then(() => { throw new Error('Portable app did not close.'); })]);
    const userData = path.join(portableDir, 'FormaData'); assert((await fs.readdir(path.join(userData, 'recovery'))).some(f => f.endsWith('.forma'))); checks.push('Portable wrapper: launch, interactive shape/layer UI, bundled CPU inference, offline renderer, data beside executable, close-time recovery');
  } finally { await browser?.close().catch(() => {}); if (child.exitCode === null) child.kill(); }
}
async function main() {
  await fs.mkdir(dir, { recursive: true });
  const unpacked = path.join(root, 'release/win-unpacked/Forma.exe');
  const model = await fs.readFile(path.join(root, 'release/win-unpacked/resources/models/u2netp.onnx')); assert.equal(require('node:crypto').createHash('sha256').update(model).digest('hex'), '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'); checks.push('Packaged model SHA-256');
  await exercise(unpacked, 'packaged', path.join(dir, 'unpacked-data'));
  const portableDir = path.join(dir, 'portable'); await fs.mkdir(portableDir, { recursive: true }); const portable = path.join(portableDir, 'Forma-Portable-1.0.0.exe'); await fs.copyFile(path.join(root, 'release/Forma-Portable-1.0.0.exe'), portable);
  await portableExercise(portable, portableDir);
  const installDir = path.join(dir, 'installed'); const resolved = path.resolve(installDir); if (!resolved.startsWith(path.resolve(dir) + path.sep)) throw new Error('Unsafe installation test path.');
  console.log('Checking installer'); await execute(path.join(root, 'release/Forma-Setup-1.0.0.exe'), ['/S', '/D=' + installDir]); await fs.access(path.join(installDir, 'Forma.exe')); checks.push('NSIS silent installation');
  await exercise(path.join(installDir, 'Forma.exe'), 'installed', path.join(dir, 'installed-data'));
  await execute(path.join(installDir, 'Uninstall Forma.exe'), ['/S']);
  let removed = false; for (let i = 0; i < 60; i++) { try { await fs.access(path.join(installDir, 'Forma.exe')); await sleep(500); } catch { removed = true; break; } } assert(removed, 'Uninstaller did not remove application'); checks.push('NSIS uninstallation removes application');
  await fs.writeFile(path.join(dir, 'packaged-results.json'), JSON.stringify({ checks }, null, 2)); console.log(JSON.stringify({ checks }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
