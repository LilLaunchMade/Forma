const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const testDir = path.join(root, 'test-results');
async function main() {
  await fs.mkdir(testDir, { recursive: true });
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'test'], { cwd: root, stdio: 'pipe' });
  const app = await electron.launch({ args: [root], env: { ...process.env, FORMA_TEST_DATA: path.join(testDir, 'user-data') }, timeout: 60000 });
  const page = await app.firstWindow(); await page.context().setOffline(true);
  const errors = [], requests = [];
  let report, closeState;
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  try {
    await page.getByRole('button', { name: 'Create a design', exact: true }).waitFor();
    await page.screenshot({ path: path.join(testDir, 'dashboard.png') });
    await page.getByRole('button', { name: 'Create a design', exact: true }).click();
    await page.getByRole('button', { name: 'Create design', exact: true }).click();
    await page.waitForFunction(() => window.__formaEditor?.canvas);
    const results = await page.evaluate(async () => {
      const e = window.__formaEditor; const checks = [];
      const check = (v, label) => { if (!v) throw new Error(label); checks.push(label); };
      const rect = e.shape('Rectangle'); check(e.canvas.size() === 1, 'Object creation');
      e.set({ left: 125, top: 75, scaleX: 1.5, angle: 27 }); check(rect.left === 125 && rect.angle === 27 && rect.scaleX === 1.5, 'Move / resize / rotate');
      const t = e.addText('Hello Forma'); e.set({ text: 'Edited text', fontFamily: 'Lora', fontSize: 64 }); check(t.text === 'Edited text' && t.fontSize === 64, 'Text editing');
      e.order('back'); check(e.canvas.getObjects()[0] === t, 'Layer ordering');
      await e.undo(); check(e.canvas.getObjects()[1].text === 'Edited text', 'Undo'); await e.redo(); check(e.canvas.getObjects()[0].text === 'Edited text', 'Redo');
      e.select(e.canvas.getObjects()[0]); await e.duplicate(); check(e.canvas.size() === 3, 'Copy / duplicate');
      e.selectAll(); e.canvas.discardActiveObject(); const bounds = e.canvas.getObjects().map(o => ({ left: o.getBoundingRect().left, top: o.getBoundingRect().top })); e.selectAll(); e.group(); check(e.canvas.size() === 1, 'Grouping'); e.ungroup(); check(e.canvas.size() === 3, 'Ungrouping'); e.canvas.discardActiveObject(); check(e.canvas.getObjects().every((o, i) => Math.abs(o.getBoundingRect().left - bounds[i].left) < .001 && Math.abs(o.getBoundingRect().top - bounds[i].top) < .001), 'Grouping preserves world coordinates');
      const imgCanvas = document.createElement('canvas'); imgCanvas.width = 64; imgCanvas.height = 64; const ctx = imgCanvas.getContext('2d'); ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#ff0000'; ctx.fillRect(20, 10, 25, 45); const src = imgCanvas.toDataURL();
      await e.importAsset({ kind: 'image', name: 'Product fixture', data: src }); e.imageAdjust({ contrast: .3, saturation: -.2, grayscale: 1, sharpen: .2 }); check(e.selected[0].filters.length >= 5, 'Image filters');
      e.crop(4, 4, 48, 48); check(e.selected[0].cropX === 4 && e.selected[0].width === 48, 'Image crop'); e.imageMask('rounded', 12); check(e.selected[0].clipPath.rx === 12, 'Rounded image mask');
      const image = e.selected[0]; const result = await window.forma.removeBackground(src, 'cpu'); check(result.provider === 'cpu' && result.output.startsWith('data:image/png;'), 'Offline ONNX / CPU inference'); await e.applyCutout(image, result.output, result.mask); check(!!image.originalSrc && !!image.maskSrc, 'Nondestructive cutout');
      await e.addPage(true); check(e.design.pages.length === 2 && e.canvas.size() === 4, 'Duplicate page'); await e.addPage(); check(e.canvas.size() === 0, 'Add page'); e.addText('Page three'); await e.reorderPage(2, 0); check(e.pageIndex === 0, 'Reorder page'); await e.deletePage(); check(e.design.pages.length === 2, 'Delete page');
      await e.goPage(0); const data = e.snapshot(true); await window.forma.autosave(data); const recovered = await window.forma.recover(data.id); check(recovered.pages.length === 2 && recovered.pages[0].scene.objects.length === 4, 'Autosave recovery');
      for (const [format, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['svg', 'image/svg+xml'], ['pdf', 'application/pdf']]) { const out = await e.export(format, format === 'pdf' ? [0, 1] : [0], 1, .92, true); check(out.startsWith('data:' + mime + ';base64,') && out.length > 100, format.toUpperCase() + ' rendering'); }
      let rejected = false; try { await window.forma.recover('../../escape'); } catch { rejected = true; } check(rejected, 'IPC path traversal rejection');
      rejected = false; try { await window.forma.settings({ theme: 'invalid' }); } catch { rejected = true; } check(rejected, 'IPC settings validation');
      check(typeof window.require === 'undefined' && typeof window.process === 'undefined', 'Renderer isolation');
      return { checks, design: data };
    });
    await app.evaluate(({ dialog }, dir) => { dialog.showSaveDialog = async (_win, opts) => ({ canceled: false, filePath: dir + '/' + opts.defaultPath }); }, testDir);
    const save = await page.evaluate(async () => { const e = window.__formaEditor; await window.forma.save(e.snapshot(true), true); return e.design.id; });
    const reopened = await page.evaluate(async id => { const d = await window.forma.open(id); return { pages: d.pages.length, objects: d.pages[0].scene.objects.length }; }, save);
    assert.equal(reopened.pages, 2); assert.equal(reopened.objects, 4); results.checks.push('Native .forma save / reopen');
    await page.evaluate(async () => { const e = window.__formaEditor; for (const f of ['png', 'jpg', 'svg', 'pdf']) await window.forma.exportFile('Forma-test', f, await e.export(f, f === 'pdf' ? [0, 1] : [0], 1, .9, true)); });
    await page.getByRole('button', { name: 'Export', exact: true }).click(); await page.getByRole('button', { name: 'Select all pages', exact: true }).click(); await page.getByRole('button', { name: 'Export design', exact: true }).click(); await page.getByRole('dialog', { name: 'Export design' }).waitFor({ state: 'hidden' }); const bundle = require('fflate').unzipSync(await fs.readFile(path.join(testDir, 'Untitled design.zip'))); assert.equal(Object.keys(bundle).length, 2); assert(Object.keys(bundle).every(n => n.endsWith('.png'))); results.checks.push('All-page PNG ZIP export through export dialog');
    const sharp = require('sharp'); assert.equal((await sharp(path.join(testDir, 'Forma-test.png')).metadata()).width, 1280); assert.equal((await sharp(path.join(testDir, 'Forma-test.jpg')).metadata()).format, 'jpeg');
    const pdf = await fs.readFile(path.join(testDir, 'Forma-test.pdf')); assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); results.checks.push('PNG / JPG / SVG / PDF file writes');
    await page.evaluate(() => { const e = window.__formaEditor; const o = e.shape('Rectangle'); o.set({ left: 650, top: 180, angle: 0, width: 180, height: 100 }); o.setCoords(); e.commit(); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const drag = await page.evaluate(() => { const e = window.__formaEditor, o = e.selected[0], r = e.canvas.upperCanvasEl.getBoundingClientRect(), center = o.getCenterPoint(); return { x: r.left + center.x * e.zoom, y: r.top + center.y * e.zoom, left: o.left, top: o.top, zoom: e.zoom, canvas: { x:r.x, y:r.y, width:r.width, height:r.height }, hit: document.elementFromPoint(r.left + center.x * e.zoom, r.top + center.y * e.zoom)?.className }; });
    await page.mouse.move(drag.x, drag.y); await page.mouse.down(); await page.mouse.move(drag.x + 45, drag.y + 25, { steps: 8 }); await page.mouse.up();
    const moved = await page.evaluate(() => { const o = window.__formaEditor.selected[0]; return { left: o.left, top: o.top, name: o.name, zoom: window.__formaEditor.zoom }; }); await page.screenshot({path: path.join(testDir, 'drag-test.png')}); assert(Math.abs(moved.left - drag.left - 45 / drag.zoom) < 3, JSON.stringify({drag, moved})); assert(Math.abs(moved.top - drag.top - 25 / drag.zoom) < 3); results.checks.push('Real pointer drag moves canvas object');
    const textPoint = await page.evaluate(() => { const e = window.__formaEditor; const o = e.addText('Inline text'); o.set({ left: 550, top: 400 }); o.setCoords(); e.commit(); const r = e.canvas.upperCanvasEl.getBoundingClientRect(); return { x: r.left + 580 * e.zoom, y: r.top + 420 * e.zoom }; });
    await page.mouse.dblclick(textPoint.x, textPoint.y); await page.keyboard.press('Control+A'); await page.keyboard.type('Inline edit works'); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.__formaEditor.canvas.getObjects().at(-1).text), 'Inline edit works'); results.checks.push('Direct on-canvas text editing');
    await page.evaluate(() => { const e = window.__formaEditor; e.select(e.canvas.getObjects().find(o => o.type.toLowerCase() === 'image')); });
    await page.getByRole('button', { name: 'Remove background', exact: true }).click(); await page.getByRole('dialog', { name: 'Refine background mask' }).waitFor({ timeout: 180000 }); results.checks.push('Automatic AI button and refinement preview: ' + await page.locator('.toast span').textContent());
    const brush = await page.evaluate(() => { const c = document.querySelector('.mask-workspace canvas'), ctx = c.getContext('2d'), pixels = ctx.getImageData(0, 0, c.width, c.height).data; let max = 0, pos = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > max) { max = pixels[i]; pos = (i - 3) / 4; } const r = c.getBoundingClientRect(); return { x: r.left + (pos % c.width + .5) / c.width * r.width, y: r.top + (Math.floor(pos / c.width) + .5) / c.height * r.height, px: pos % c.width, py: Math.floor(pos / c.width), alpha: max }; });
    const alpha = () => page.evaluate(({ px, py }) => document.querySelector('.mask-workspace canvas').getContext('2d').getImageData(px, py, 1, 1).data[3], brush);
    await page.mouse.move(brush.x, brush.y); await page.mouse.down(); await page.mouse.move(brush.x + .1, brush.y + .1); await page.mouse.up(); assert((await alpha()) < brush.alpha);
    await page.getByTitle('Undo mask stroke').click(); assert.equal(await alpha(), brush.alpha); await page.getByTitle('Redo mask stroke').click(); assert((await alpha()) < brush.alpha); await page.getByRole('button', { name: 'Restore', exact: true }).click(); await page.mouse.move(brush.x, brush.y); await page.mouse.down(); await page.mouse.move(brush.x + .1, brush.y + .1); await page.mouse.up(); assert((await alpha()) >= brush.alpha); await page.getByRole('button', { name: 'Apply mask', exact: true }).click(); await page.getByRole('dialog', { name: 'Refine background mask' }).waitFor({ state: 'hidden' }); results.checks.push('Manual erase / restore brushes, undo / redo, apply');
    await page.evaluate(() => { window.__realWorker = window.Worker; window.Worker = class { constructor() { throw new Error('Injected GPU worker initialization failure'); } }; });
    try { await page.getByRole('button', { name: 'Remove background', exact: true }).click(); await page.getByRole('dialog', { name: 'Refine background mask' }).waitFor({ timeout: 180000 }); assert((await page.locator('.toast span').textContent()).includes('· cpu ·')); await page.getByRole('button', { name: 'Apply mask', exact: true }).click(); await page.getByRole('dialog', { name: 'Refine background mask' }).waitFor({ state: 'hidden' }); results.checks.push('Automatic GPU initialization failure falls back to isolated CPU inference'); }
    finally { await page.evaluate(() => { window.Worker = window.__realWorker; delete window.__realWorker; }); }
    await page.getByRole('button', { name: 'Templates', exact: true }).click(); const buttons = page.locator('.editor-template-grid button'); assert.equal(await buttons.count(), 24);
    const beforeTemplates = await page.evaluate(() => window.__formaEditor.design.pages.length);
    for (let i = 0; i < 24; i++) { await buttons.nth(i).click(); await page.waitForFunction(n => window.__formaEditor.design.pages.length === n && window.__formaEditor.canvas.size() >= 6, beforeTemplates + i + 1); }
    results.checks.push('All 24 templates load editable scenes');
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('dialog', { name: 'Settings' }).locator('select').first().selectOption('light'); await page.getByLabel('Close settings').click(); await page.screenshot({ path: path.join(testDir, 'light-editor.png') });
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('dialog', { name: 'Settings' }).locator('select').first().selectOption('dark'); await page.getByLabel('Close settings').click();
    const perf = await page.evaluate(async () => { const e = window.__formaEditor; await e.addPage(); const start = performance.now(); const prototype = e.shape('Circle'); const C = prototype.constructor; for (let i = 0; i < 500; i++) e.canvas.add(new C({ radius: 10, left: i % 25 * 40, top: Math.floor(i / 25) * 40, fill: '#775BFF', id: crypto.randomUUID(), name: 'Stress ' + i })); e.commit(); const data = await e.export('png', [e.pageIndex], .5, 1, false); if (data.length < 100) throw new Error('Empty stress export'); let rejected = false; try { await e.export('png', [e.pageIndex], 100, 1, false); } catch { rejected = true; } if (!rejected) throw new Error('Unsafe export accepted'); return Math.round(performance.now() - start); }); results.checks.push(`501-object creation and export (${perf} ms); export size limit`);
    await page.evaluate(async () => { const e = window.__formaEditor; await e.goPage(2); e.canvas.discardActiveObject(); e.canvas.requestRenderAll(); });
    await page.screenshot({ path: path.join(testDir, 'editor.png') });
    assert.deepEqual(requests, [], 'No remote network traffic'); assert.deepEqual(errors, [], 'No renderer errors');
    results.checks.push('Zero remote requests during editor, exports and AI'); delete results.design;
    closeState = await page.evaluate(() => { const e = window.__formaEditor; e.design.name = 'Close recovery verified'; e.commit(); return { id: e.design.id, pages: e.design.pages.length }; }); report = results;
    await fs.writeFile(path.join(testDir, 'e2e-results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2));
  } finally {
    await app.close();
    if (closeState) { const file = path.join(testDir, 'user-data/recovery', closeState.id + '.forma'); const recovered = require('../dist-electron/electron/archive.js').decodeProject(await fs.readFile(file)); assert.equal(recovered.name, 'Close recovery verified'); assert.equal(recovered.pages.length, closeState.pages); report.checks.push('Normal close flushes latest unsaved changes'); await fs.writeFile(path.join(testDir, 'e2e-results.json'), JSON.stringify(report, null, 2)); }
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, stdio: 'pipe' });
  }
  const reopenedApp = await electron.launch({ args: [root, path.join(testDir, 'Untitled design.forma')], env: { ...process.env, FORMA_TEST_DATA: path.join(testDir, 'user-data') }, timeout: 60000 });
  try { const p = await reopenedApp.firstWindow(); await p.getByLabel('Project name', { exact: true }).waitFor(); assert.equal(await p.getByLabel('Project name', { exact: true }).inputValue(), 'Untitled design'); report.checks.push('OS file-association command-line open'); await fs.writeFile(path.join(testDir, 'e2e-results.json'), JSON.stringify(report, null, 2)); }
  finally { await reopenedApp.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });





