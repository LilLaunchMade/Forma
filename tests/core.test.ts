import { describe, it, expect } from 'vitest';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { newDesign, validateDesign, History, validateSettings, defaults } from '../src/shared/model';
import { encodeProject, decodeProject } from '../electron/archive';
import { normalizeMask, normalizeRGB } from '../electron/pixels';
import { templates } from '../src/templates';
describe('portable project format', () => {
  it('roundtrips pages, fonts, group/layer metadata, image adjustments and deduplicated assets', () => {
    const d = newDesign(); const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlp8AAAAASUVORK5CYII=';
    d.pages[0].scene.objects.push({ type: 'Group', objects: [{ type: 'Image', src: source, originalSrc: source, adjustments: { contrast: .4 }, name: 'Product', visible: false, lockMovementX: true }] });
    d.fonts.push({ family: 'Custom', data: 'data:font/ttf;base64,YWJj' });
    d.pages.push(structuredClone(d.pages[0])); d.pages[1].id += '-copy';
    const bytes = encodeProject(d); expect(Object.keys(unzipSync(bytes))).toHaveLength(3); expect(decodeProject(bytes)).toEqual(d);
  });
  it('rejects traversal, absolute paths, corrupt files and unsupported versions', () => {
    for (const name of ['../escape', '/absolute', 'assets/../../escape', 'C:/escape']) expect(() => decodeProject(zipSync({ [name]: strToU8('x') }))).toThrow(/Unsafe/);
    expect(() => decodeProject(new Uint8Array([0, 1, 2]))).toThrow();
    const d = newDesign(); (d as any).version = 200; expect(() => encodeProject(d)).toThrow(/version/);
  });
  it('detects tampering and missing assets', () => {
    const d = newDesign(); d.pages[0].scene.objects.push({ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jlp8AAAAASUVORK5CYII=' }); const zip = unzipSync(encodeProject(d));
    const key = Object.keys(zip).find(x => x.startsWith('assets/'))!; zip[key] = strToU8('bad'); expect(() => decodeProject(zipSync(zip))).toThrow(/corrupt/);
    delete zip[key]; expect(() => decodeProject(zipSync(zip))).toThrow(/Missing/);
  });
  it('rejects remote sources, invalid dimensions, empty projects and pollution keys', () => {
    const d = newDesign(); d.pages[0].scene.objects.push({ src: 'https://example.com/a.png' }); expect(() => validateDesign(d)).toThrow(/embedded/);
    d.pages[0].scene.objects = []; d.pages[0].width = 999999; expect(() => validateDesign(d)).toThrow(/dimensions/);
    d.pages = []; expect(() => validateDesign(d)).toThrow(/pages/);
    const z = unzipSync(encodeProject(newDesign())); const j = JSON.parse(strFromU8(z['project.json'])); Object.defineProperty(j, '__proto__', { value: {}, enumerable: true }); z['project.json'] = strToU8(JSON.stringify(j)); expect(() => decodeProject(zipSync(z))).toThrow(/Unsafe/);
  });
});
describe('history and local templates', () => {
  it('undoes and redoes, discards future branches and bounds memory', () => { const h = new History<number>(3); [0, 1, 1, 2, 3].forEach(n => h.push(n)); expect(h.undo()).toBe(2); expect(h.undo()).toBe(1); expect(h.undo()).toBeUndefined(); expect(h.redo()).toBe(2); h.push(7); expect(h.redo()).toBeUndefined(); });
  it('provides 24 valid original designs covering all 12 categories', () => { expect(templates).toHaveLength(24); expect(new Set(templates.map(t => t.category)).size).toBe(12); for (const t of templates) { validateDesign(t.design); expect(t.design.pages[0].scene.objects.length).toBeGreaterThanOrEqual(6); } });
  it('validates narrow settings', () => { expect(validateSettings(defaults)).toEqual(defaults); expect(() => validateSettings({ ...defaults, autosaveSeconds: 0 })).toThrow(); expect(() => validateSettings({ ...defaults, theme: 'http://x' })).toThrow(); });
});
describe('segmentation preprocessing and postprocessing', () => {
  it('normalizes RGB in planar ImageNet order', () => { const a = normalizeRGB(new Uint8Array([255, 128, 0]), 1); expect(a[0]).toBeCloseTo((1 - .485) / .229); expect(a[1]).toBeCloseTo((128 / 255 - .456) / .224); expect(a[2]).toBeCloseTo(-.406 / .225); });
  it('produces alpha from real model probabilities without NaNs', () => { expect([...normalizeMask(new Float32Array([.25, .5, .75]))]).toEqual([0, 128, 255]); expect([...normalizeMask(new Float32Array([.8, .8]))]).toEqual([255, 255]); expect(() => normalizeMask(new Float32Array([NaN]))).toThrow(); });
});
