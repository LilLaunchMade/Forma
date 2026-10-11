import { Canvas, StaticCanvas, FabricObject, FabricImage, Rect, Circle, Ellipse, Triangle, Polygon, Line, Path, Textbox, Group, ActiveSelection, Gradient, Shadow, Point, filters, loadSVGFromString, util } from 'fabric';
import { jsPDF } from 'jspdf';
import { zip } from 'fflate';
import { History, blankPage, uid, validateDesign, type Design, type Scene } from './shared/model';
import type { Imported } from './shared/api';
declare module 'fabric' { interface FabricObject { id?: string; name?: string; originalSrc?: string; maskSrc?: string; adjustments?: Record<string, number>; imageRadius?: number } }
FabricObject.customProperties = ['id', 'name', 'originalSrc', 'maskSrc', 'adjustments', 'imageRadius'];
FabricObject.ownDefaults = { ...FabricObject.ownDefaults, cornerColor: '#775BFF', borderColor: '#775BFF', cornerStrokeColor: '#ffffff', cornerStyle: 'circle', transparentCorners: false, cornerSize: 9, padding: 3 };
export type Item = FabricObject & { id?: string; name?: string; originalSrc?: string; maskSrc?: string; adjustments?: Record<string, number>; imageRadius?: number };
export interface EditorState { design: Design; page: number; selection: Item[]; layers: Item[]; zoom: number; dirty: boolean; canUndo: boolean; canRedo: boolean }
export const shapeNames = ['Rectangle', 'Rounded rectangle', 'Circle', 'Ellipse', 'Triangle', 'Hexagon', 'Line', 'Arrow', 'Star', 'Speech bubble', 'Sparkle', 'Heart', 'Check', 'Bolt', 'Leaf'] as const;
const pause = () => new Promise<void>(r => requestAnimationFrame(() => r()));
export function sanitizeSVG(svg: string): string {
  if (svg.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG is too large or contains unsafe declarations.');
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG.');
  const permitted = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc']);
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (!permitted.has(el.localName)) { el.remove(); continue; }
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name) || /href|src/i.test(a.name) || /javascript:|https?:|file:|data:|@import|expression\s*\(/i.test(a.value) || (/url\(/i.test(a.value) && !/^url\(#[\w-]+\)$/.test(a.value))) el.removeAttribute(a.name);
  }
  return new XMLSerializer().serializeToString(doc);
}
export class Editor {
  canvas: Canvas;
  design: Design;
  pageIndex = 0;
  zoom = 1;
  dirty = false;
  private loading = false;
  private history = new History<Design>(45);
  private clipboard: any[] = [];
  private onChange: (s: EditorState) => void;
  private textTimer?: ReturnType<typeof setTimeout>;
  constructor(element: HTMLCanvasElement, design: Design, onChange: (s: EditorState) => void) {
    this.design = structuredClone(design); this.onChange = onChange;
    this.canvas = new Canvas(element, { preserveObjectStacking: true, selection: true, enableRetinaScaling: true, fireRightClick: true, stopContextMenu: true });
    this.canvas.on('object:modified', () => this.commit());
    this.canvas.on('text:changed', () => { clearTimeout(this.textTimer); this.textTimer = setTimeout(() => this.commit(), 350); });
    this.canvas.on('selection:created', () => this.emit()); this.canvas.on('selection:updated', () => this.emit()); this.canvas.on('selection:cleared', () => this.emit());
  }
  async init() { await this.loadPage(); this.history.push(this.design); this.emit(); }
  get page() { return this.design.pages[this.pageIndex]; }
  get selected() { return this.canvas.getActiveObjects() as Item[]; }
  emit() { this.onChange({ design: this.design, page: this.pageIndex, selection: this.selected, layers: this.canvas.getObjects() as Item[], zoom: this.zoom, dirty: this.dirty, canUndo: this.history.canUndo, canRedo: this.history.canRedo }); }
  sync() { this.page.scene = this.canvas.toObject() as Scene; this.page.background = String(this.canvas.backgroundColor || 'transparent'); }
  commit() { if (this.loading) return; this.sync(); this.design.modified = new Date().toISOString(); this.dirty = true; this.history.push(this.design); this.canvas.requestRenderAll(); this.emit(); }
  snapshot(thumbnails = false): Design {
    this.sync();
    if (thumbnails) { try { this.page.thumbnail = this.canvas.toDataURL({ format: 'png', multiplier: 280 / this.canvas.getWidth(), enableRetinaScaling: false }); } catch { /* save content even if thumbnail allocation fails */ } }
    validateDesign(this.design); return structuredClone(this.design);
  }
  saved() { this.dirty = false; this.emit(); }
  async loadPage() {
    this.loading = true;
    try { this.canvas.discardActiveObject(); await this.canvas.loadFromJSON(this.page.scene); this.canvas.backgroundColor = this.page.background === 'transparent' ? '' : this.page.background; this.setZoom(this.zoom); this.canvas.requestRenderAll(); }
    finally { this.loading = false; this.emit(); }
  }
  async goPage(index: number) { if (index < 0 || index >= this.design.pages.length) return; this.snapshot(true); this.pageIndex = index; await this.loadPage(); }
  async replaceBackground(asset: Imported) {
    if (asset.kind !== 'image') throw new Error('Choose a PNG, JPG or WebP background.');
    const foreground = [...this.selected]; await this.importAsset(asset); const background = this.selected[0] as FabricImage;
    const scale = Math.max(this.page.width / background.width, this.page.height / background.height); background.set({ scaleX: scale, scaleY: scale, left: (this.page.width - background.width * scale) / 2, top: (this.page.height - background.height * scale) / 2 }); background.name = 'Background · ' + asset.name;
    this.canvas.sendObjectToBack(background); this.canvas.discardActiveObject(); if (foreground.length === 1) this.canvas.setActiveObject(foreground[0]); this.commit();
  }
  async addPage(duplicate = false) {
    if (this.design.pages.length >= 100) throw new Error('Projects support up to 100 pages.'); this.sync();
    const p = duplicate ? structuredClone(this.page) : blankPage(this.page.width, this.page.height); p.id = uid(); p.name = 'Page ' + (this.design.pages.length + 1);
    this.design.pages.splice(this.pageIndex + 1, 0, p); this.pageIndex++; await this.loadPage(); this.commit();
  }
  async deletePage() { if (this.design.pages.length === 1) throw new Error('Keep at least one page.'); this.design.pages.splice(this.pageIndex, 1); this.pageIndex = Math.min(this.pageIndex, this.design.pages.length - 1); await this.loadPage(); this.commit(); }
  async reorderPage(from: number, to: number) { this.sync(); const current = this.page.id; const [p] = this.design.pages.splice(from, 1); this.design.pages.splice(to, 0, p); this.pageIndex = this.design.pages.findIndex(x => x.id === current); this.commit(); }
  setZoom(z: number) { const max = Math.min(4, Math.sqrt(24_000_000 / (this.page.width * this.page.height))); this.zoom = Math.min(max, Math.max(.025, z)); this.canvas.setDimensions({ width: Math.round(this.page.width * this.zoom), height: Math.round(this.page.height * this.zoom) }); this.canvas.setZoom(this.zoom); this.emit(); }
  fit(w: number, h: number) { this.setZoom(Math.min((w - 100) / this.page.width, (h - 100) / this.page.height, 1)); }
  background(color: string) { this.canvas.backgroundColor = color === 'transparent' ? '' : color; this.commit(); }
  resizePage(width: number, height: number) { const d = this.snapshot(); d.pages[this.pageIndex].width = width; d.pages[this.pageIndex].height = height; validateDesign(d); this.page.width = width; this.page.height = height; this.setZoom(this.zoom); this.commit(); }
  add(object: Item, name: string) {
    object.set({ originX: 'left', originY: 'top', left: this.page.width * .2, top: this.page.height * .2 }); object.id = uid(); object.name = name;
    this.canvas.add(object); this.canvas.setActiveObject(object); this.commit(); return object;
  }
  addText(text = 'Your next great idea') { return this.add(new Textbox(text, { width: this.page.width * .55, fontFamily: 'Inter', fontSize: Math.max(24, Math.round(this.page.width / 22)), fill: '#181C2B', fontWeight: 500 }), 'Text'); }
  shape(name: string) {
    const fill = '#775BFF', stroke = '#181C2B'; let o: FabricObject;
    const common = { fill, strokeWidth: 0, width: 220, height: 160 };
    if (name === 'Circle') o = new Circle({ radius: 90, fill });
    else if (name === 'Ellipse') o = new Ellipse({ rx: 130, ry: 75, fill });
    else if (name === 'Triangle') o = new Triangle(common);
    else if (name === 'Line') o = new Line([0, 0, 260, 0], { stroke, strokeWidth: 5 });
    else if (['Hexagon', 'Star', 'Sparkle'].includes(name)) { const n = name === 'Hexagon' ? 6 : name === 'Sparkle' ? 8 : 10; o = new Polygon(Array.from({ length: n }, (_, i) => { const a = i * Math.PI * 2 / n - Math.PI / 2, r = name !== 'Hexagon' && i % 2 ? 45 : 100; return { x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r }; }), { fill }); }
    else if (name === 'Arrow') o = new Polygon([{ x: 0, y: 45 }, { x: 150, y: 45 }, { x: 150, y: 0 }, { x: 240, y: 80 }, { x: 150, y: 160 }, { x: 150, y: 115 }, { x: 0, y: 115 }], { fill });
    else if (name === 'Speech bubble') o = new Path('M20 0 H220 Q240 0 240 20 V130 Q240 150 220 150 H80 L35 190 V150 H20 Q0 150 0 130 V20 Q0 0 20 0 Z', { fill });
    else if (name === 'Heart') o = new Path('M100 180 C-80 70 20 -40 100 35 C180 -40 280 70 100 180 Z', { fill });
    else if (name === 'Check') o = new Path('M0 80 L60 140 L180 0', { fill: '', stroke: fill, strokeWidth: 22, strokeLineCap: 'round', strokeLineJoin: 'round' });
    else if (name === 'Bolt') o = new Path('M80 0 L0 110 H65 L45 210 L155 75 H90 L125 0 Z', { fill });
    else if (name === 'Leaf') o = new Path('M0 160 Q-10 -10 170 0 Q185 165 0 160 Z', { fill });
    else o = new Rect({ ...common, rx: name === 'Rounded rectangle' ? 28 : 0, ry: name === 'Rounded rectangle' ? 28 : 0 });
    return this.add(o, name);
  }
  async importAsset(a: Imported) {
    if (a.kind === 'font') { const family = a.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80) || 'Imported Font'; const face = new FontFace(family, `url(${a.data})`); document.fonts.add(await face.load()); this.design.fonts.push({ family, data: a.data }); this.commit(); return; }
    if (a.kind === 'svg') { const result = await loadSVGFromString(sanitizeSVG(a.data)); const objects = result.objects.filter(Boolean) as FabricObject[]; if (!objects.length) throw new Error('SVG has no supported vector elements.'); const o = util.groupSVGElements(objects, result.options); o.scaleToWidth(Math.min(this.page.width * .6, o.width)); this.add(o, a.name); return; }
    const image = await FabricImage.fromURL(a.data); if (image.width * image.height > 70_000_000) { image.dispose(); throw new Error('Images are limited to 70 megapixels.'); } image.scaleToWidth(Math.min(this.page.width * .6, image.width)); (image as Item).originalSrc = a.data; this.add(image, a.name);
  }
  select(o: Item, additive = false) {
    if (additive) { const objects = this.selected.includes(o) ? this.selected.filter(x => x !== o) : [...this.selected, o]; this.canvas.discardActiveObject(); if (objects.length) this.canvas.setActiveObject(objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas: this.canvas })); }
    else this.canvas.setActiveObject(o); this.canvas.requestRenderAll(); this.emit();
  }
  set(props: Record<string, any>) { for (const o of this.selected) { o.set(props); o.setCoords(); } this.commit(); }
  rename(o: Item, name: string) { o.name = name.slice(0, 100); this.commit(); }
  visibility(o: Item) { o.visible = !o.visible; this.commit(); }
  lock(o: Item) { const locked = !o.lockMovementX; o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked }); this.commit(); }
  reorder(o: Item, index: number) { this.canvas.moveObjectTo(o, Math.max(0, Math.min(this.canvas.size() - 1, index))); this.commit(); }
  order(direction: 'front' | 'back' | 'up' | 'down') { for (const o of this.selected) { if (direction === 'front') this.canvas.bringObjectToFront(o); if (direction === 'back') this.canvas.sendObjectToBack(o); if (direction === 'up') this.canvas.bringObjectForward(o); if (direction === 'down') this.canvas.sendObjectBackwards(o); } this.commit(); }
  remove() { const active = this.selected; this.canvas.discardActiveObject(); this.canvas.remove(...active); this.commit(); }
  copy() { const objects = [...this.selected]; this.canvas.discardActiveObject(); this.clipboard = objects.map(x => x.toObject()); if (objects.length) this.canvas.setActiveObject(objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas: this.canvas })); }
  async paste() { this.canvas.discardActiveObject(); const objects = await util.enlivenObjects<FabricObject>(this.clipboard); for (const o of objects as Item[]) { o.id = uid(); o.set({ left: o.left + 24, top: o.top + 24 }); this.canvas.add(o); } if (objects.length) this.canvas.setActiveObject(objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas: this.canvas })); this.commit(); }
  async duplicate() { this.copy(); await this.paste(); }
  group() { const selected = [...this.selected]; if (selected.length < 2) return; this.canvas.discardActiveObject(); this.canvas.remove(...selected); const group = new Group(selected); group.id = uid(); group.name = 'Group'; this.canvas.add(group); this.canvas.setActiveObject(group); this.commit(); }
  ungroup() { const selected = this.selected[0]; if (!(selected instanceof Group)) return; this.canvas.discardActiveObject(); const objects = selected.removeAll(); this.canvas.remove(selected); this.canvas.add(...objects); this.canvas.setActiveObject(new ActiveSelection(objects, { canvas: this.canvas })); this.commit(); }
  nudge(x: number, y: number) { const o = this.canvas.getActiveObject(); if (!o || o.lockMovementX) return; o.set({ left: o.left + x, top: o.top + y }); o.setCoords(); this.commit(); }
  selectAll() { this.canvas.discardActiveObject(); const objects = this.canvas.getObjects().filter(x => x.visible); if (objects.length) this.canvas.setActiveObject(new ActiveSelection(objects, { canvas: this.canvas })); this.emit(); this.canvas.requestRenderAll(); }
  align(axis: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const objects = [...this.selected]; this.canvas.discardActiveObject();
    for (const o of objects) { const b = o.getBoundingRect(); let dx = 0, dy = 0;
      if (axis === 'left') dx = -b.left; if (axis === 'center') dx = this.page.width / 2 - b.left - b.width / 2; if (axis === 'right') dx = this.page.width - b.left - b.width;
      if (axis === 'top') dy = -b.top; if (axis === 'middle') dy = this.page.height / 2 - b.top - b.height / 2; if (axis === 'bottom') dy = this.page.height - b.top - b.height;
      o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
    } if (objects.length) this.canvas.setActiveObject(objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas: this.canvas })); this.commit();
  }
  distribute(vertical = false) {
    const objects = [...this.selected]; if (objects.length < 3) return; this.canvas.discardActiveObject();
    objects.sort((a, b) => vertical ? a.top - b.top : a.left - b.left);
    const first = objects[0].getBoundingRect(), last = objects.at(-1)!.getBoundingRect(); const key = vertical ? 'top' : 'left', size = vertical ? 'height' : 'width';
    const gap = (last[key] + last[size] - first[key] - objects.reduce((sum, o) => sum + o.getBoundingRect()[size], 0)) / (objects.length - 1);
    let pos = first[key]; for (const o of objects) { const b = o.getBoundingRect(); o.set(key, o[key] + pos - b[key]); o.setCoords(); pos += b[size] + gap; }
    this.canvas.setActiveObject(new ActiveSelection(objects, { canvas: this.canvas })); this.commit();
  }
  gradient(a: string, b: string) { for (const o of this.selected) o.set('fill', new Gradient({ type: 'linear', gradientUnits: 'percentage', coords: { x1: 0, y1: 0, x2: 1, y2: 1 }, colorStops: [{ offset: 0, color: a }, { offset: 1, color: b }] })); this.commit(); }
  shadow(color: string, blur: number, x: number, y: number) { this.set({ shadow: blur || x || y ? new Shadow({ color, blur, offsetX: x, offsetY: y }) : null }); }
  imageAdjust(values: Record<string, number>) {
    const image = this.selected[0]; if (!(image instanceof FabricImage)) return;
    const v = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, blur: 0, sharpen: 0, grayscale: 0, sepia: 0, ...(image as Item).adjustments, ...values };
    (image as Item).adjustments = v;
    image.filters = [new filters.Brightness({ brightness: v.brightness }), new filters.Contrast({ contrast: v.contrast }), new filters.Saturation({ saturation: v.saturation })];
    if (v.exposure) image.filters.push(new filters.Gamma({ gamma: [2 ** v.exposure, 2 ** v.exposure, 2 ** v.exposure] }));
    if (v.blur) image.filters.push(new filters.Blur({ blur: v.blur }));
    if (v.sharpen) { const s = v.sharpen; image.filters.push(new filters.Convolute({ matrix: [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0] })); }
    if (v.grayscale) image.filters.push(new filters.Grayscale()); if (v.sepia) image.filters.push(new filters.Sepia());
    image.applyFilters(); this.commit();
  }
  imageMask(kind: 'none' | 'circle' | 'rounded', radius = 32) {
    const image = this.selected[0]; if (!(image instanceof FabricImage)) return;
    image.clipPath = kind === 'none' ? undefined : kind === 'circle' ? new Ellipse({ rx: image.width / 2, ry: image.height / 2, originX: 'center', originY: 'center' }) : new Rect({ width: image.width, height: image.height, rx: radius, ry: radius, originX: 'center', originY: 'center' });
    (image as Item).imageRadius = radius; this.commit();
  }
  crop(x: number, y: number, w: number, h: number) {
    const image = this.selected[0]; if (!(image instanceof FabricImage)) return;
    const el = image.getElement() as HTMLImageElement; const sw = el.naturalWidth || el.width, sh = el.naturalHeight || el.height;
    x = Math.max(0, Math.min(sw - 1, x)); y = Math.max(0, Math.min(sh - 1, y));
    image.set({ cropX: x, cropY: y, width: Math.max(1, Math.min(sw - x, w)), height: Math.max(1, Math.min(sh - y, h)) }); image.setCoords(); this.commit();
  }
  async applyCutout(target: Item, output: string, mask: string) {
    if (!(target instanceof FabricImage)) return; target.originalSrc ||= target.getSrc(); target.maskSrc = mask;
    const { width, height, cropX, cropY } = target; await target.setSrc(output); target.set({ width, height, cropX, cropY }); target.applyFilters(); this.commit();
  }
  async resetImage() { const image = this.selected[0]; if (!(image instanceof FabricImage) || !(image as Item).originalSrc) return; const source = (image as Item).originalSrc!; await image.setSrc(source); (image as Item).maskSrc = undefined; image.filters = []; (image as Item).adjustments = {}; image.clipPath = undefined; image.set({ cropX: 0, cropY: 0 }); image.applyFilters(); this.commit(); }
  async undo() { const d = this.history.undo(); if (d) { this.design = d; this.pageIndex = Math.min(this.pageIndex, d.pages.length - 1); await this.loadPage(); this.dirty = true; this.emit(); } }
  async redo() { const d = this.history.redo(); if (d) { this.design = d; this.pageIndex = Math.min(this.pageIndex, d.pages.length - 1); await this.loadPage(); this.dirty = true; this.emit(); } }
  async export(format: string, indexes: number[], scale: number, quality: number, transparent: boolean, preview = false): Promise<string> {
    this.sync(); if (!indexes.length) throw new Error('Choose at least one page.');
    if (!['png', 'jpg', 'svg', 'pdf'].includes(format) || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(quality) || quality < 0 || quality > 1 || indexes.some(i => !Number.isInteger(i) || !this.design.pages[i])) throw new Error('Invalid export options.');
    if (format !== 'pdf' && indexes.length > 1) {
      const files: Record<string, Uint8Array> = {}; let total = 0;
      for (const index of [...new Set(indexes)]) {
        const data = await this.export(format, [index], scale, quality, transparent);
        const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0)); total += bytes.length;
        if (total > 120 * 1024 * 1024) throw new Error('Page bundle exceeds 120 MB. Export fewer pages or reduce the scale.');
        const name = this.design.pages[index].name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80) || 'Page';
        files[`${String(index + 1).padStart(3, '0')}-${name}.${format}`] = bytes;
      }
      const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
      return 'data:application/zip;base64,' + bufferBase64(bytes);
    }
    let pdf: jsPDF | undefined; let result = '';
    for (const index of indexes) {
      const p = this.design.pages[index]; if (p.width * p.height * scale * scale > 65_000_000) throw new Error('Export exceeds 65 megapixels. Reduce the scale.');
      const c = new StaticCanvas(undefined, { width: p.width, height: p.height, enableRetinaScaling: false });
      try {
        await c.loadFromJSON(p.scene); c.backgroundColor = transparent && format !== 'jpg' ? '' : p.background === 'transparent' ? '#ffffff' : p.background; c.renderAll(); await pause();
        if (format === 'svg') { const fonts = [...await window.forma.bundledFonts(), ...this.design.fonts]; const css = fonts.map(f => `@font-face{font-family:'${f.family.replace(/[^\w -]/g, '')}';src:url('${f.data}');}`).join(''); const svg = c.toSVG().replace('<defs>', '<defs><style type="text/css"><![CDATA[' + css + ']]></style>'); result = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); }
        else { const data = c.toDataURL({ format: format === 'jpg' ? 'jpeg' : 'png', multiplier: preview ? Math.min(800 / p.width, 1) : scale, quality, enableRetinaScaling: false });
          if (format !== 'pdf') result = data;
          else { const dims: [number, number] = [p.width * .75, p.height * .75]; if (!pdf) pdf = new jsPDF({ unit: 'pt', format: dims, orientation: p.width > p.height ? 'landscape' : 'portrait', compress: true }); else pdf.addPage(dims, p.width > p.height ? 'landscape' : 'portrait'); pdf.addImage(data, 'PNG', 0, 0, dims[0], dims[1]); }
        }
      } finally { await c.dispose(); } await pause();
    }
    return pdf ? 'data:application/pdf;base64,' + bufferBase64(new Uint8Array(pdf.output('arraybuffer'))) : result;
  }
  async dispose() { clearTimeout(this.textTimer); await this.canvas.dispose(); }
}
function bufferBase64(bytes: Uint8Array) { let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(binary); }
export async function loadFonts(d: Design) { for (const font of d.fonts) { try { const f = new FontFace(font.family, `url(${font.data})`); document.fonts.add(await f.load()); } catch { /* browser fallback for invalid imported fonts */ } } await Promise.all(['Inter', 'Space Grotesk', 'Lora'].map(f => document.fonts.load(`16px "${f}"`))); }
export async function pngForAI(src: string): Promise<string> {
  if (src.startsWith('data:image/png;')) return src;
  const blob = await new Promise<Blob>((resolve, reject) => { const img = new Image(); img.onload = () => { if (img.naturalWidth * img.naturalHeight > 40_000_000) { reject(new Error('AI images are limited to 40 megapixels.')); return; } const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0); c.toBlob(b => b ? resolve(b) : reject(new Error('Unable to prepare image.')), 'image/png'); }; img.onerror = () => reject(new Error('Unable to decode image.')); img.src = src; });
  return 'data:image/png;base64,' + bufferBase64(new Uint8Array(await blob.arrayBuffer()));
}
export function hitPoint(editor: Editor, x: number, y: number) { return editor.canvas.getScenePoint({ clientX: x, clientY: y } as PointerEvent); }
export { Textbox, FabricImage, Group, Point };
