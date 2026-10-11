export type Scene = { objects: any[]; background?: string; version?: string; [key: string]: any };
export interface Page { id: string; name: string; width: number; height: number; background: string; scene: Scene; thumbnail?: string }
export interface Design { format: 'forma'; version: 1; id: string; name: string; created: string; modified: string; pages: Page[]; fonts: { family: string; data: string }[]; template?: boolean }
export interface Recent { id: string; name: string; modified: string; thumbnail?: string; pages: number; recovery?: boolean; template?: boolean }
export interface Settings { theme: 'dark' | 'light'; autosaveSeconds: number; aiProvider: 'auto' | 'cpu'; reduceMotion: boolean }
export const defaults: Settings = { theme: 'dark', autosaveSeconds: 20, aiProvider: 'auto', reduceMotion: false };
export const MAX_DIMENSION = 16384;
export const presets = [
  ['YouTube thumbnail', 1280, 720, 'YouTube'], ['YouTube banner', 2560, 1440, 'YouTube'],
  ['Instagram post', 1080, 1080, 'Social Media'], ['Instagram story', 1080, 1920, 'Social Media'],
  ['Poster A3 · 300 dpi', 3508, 4961, 'Posters'], ['Flyer A5 · 300 dpi', 1748, 2480, 'Flyers'],
  ['Logo', 1000, 1000, 'Logos'], ['Business card · 300 dpi', 1050, 600, 'Business'],
  ['Presentation', 1920, 1080, 'Presentations'], ['Invitation', 1500, 2100, 'Invitations'],
  ['Resume A4 · 300 dpi', 2480, 3508, 'Resumes'], ['Worksheet A4', 2480, 3508, 'Education'],
] as const;
export const uid = () => crypto.randomUUID();
export function blankPage(width = 1280, height = 720): Page {
  return { id: uid(), name: 'Page 1', width, height, background: '#ffffff', scene: { objects: [] } };
}
export function newDesign(name = 'Untitled design', width = 1280, height = 720): Design {
  const now = new Date().toISOString();
  return { format: 'forma', version: 1, id: uid(), name, created: now, modified: now, pages: [blankPage(width, height)], fonts: [] };
}
export function validateDesign(value: unknown): asserts value is Design {
  const d = value as Design;
  if (!d || d.format !== 'forma' || d.version !== 1) throw new Error('Unsupported Forma format or version.');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(d.id) || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 200) throw new Error('Invalid project identity.');
  if (!Array.isArray(d.pages) || d.pages.length < 1 || d.pages.length > 100) throw new Error('A project must contain 1–100 pages.');
  let objects = 0;
  for (const p of d.pages) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.background !== 'string' || !/^#[a-f0-9]{6}$|^transparent$/i.test(p.background)) throw new Error('Invalid page.');
    if (![p.width, p.height].every(n => Number.isInteger(n) && n >= 16 && n <= MAX_DIMENSION) || p.width * p.height > 70_000_000) throw new Error('Page dimensions exceed safe limits.');
    if (!p.scene || !Array.isArray(p.scene.objects)) throw new Error('Invalid scene.');
    objects += p.scene.objects.length;
  }
  if (objects > 10000) throw new Error('Project has too many objects.');
  if (!Array.isArray(d.fonts) || d.fonts.length > 100) throw new Error('Invalid fonts.');
  let count = 0;
  const walk = (v: any, depth = 0) => {
    if (++count > 500000 || depth > 40) throw new Error('Project structure exceeds safe limits.');
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error('Unsafe project key.');
      if (['src', 'source', 'originalSrc', 'maskSrc', 'thumbnail', 'data'].includes(k) && typeof x === 'string' && !/^data:(image\/(png|jpeg|webp)|font\/[a-z0-9.+-]+|application\/(font-woff|octet-stream));base64,[a-z0-9+/=]+$/i.test(x)) throw new Error('Projects may contain only embedded raster images and fonts.');
      if (['width', 'height', 'fontSize', 'radius', 'rx', 'ry'].includes(k) && typeof x === 'number' && (x < 0 || x > 1_000_000)) throw new Error('Object dimensions exceed safe limits.');
      if (['scaleX', 'scaleY'].includes(k) && typeof x === 'number' && Math.abs(x) > 1000) throw new Error('Object scale exceeds safe limits.');
      walk(x, depth + 1);
    }
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Nonfinite project coordinate.');
  };
  walk(d);
}
export function validateSettings(v: unknown): Settings {
  const s = v as Settings;
  if (!s || !['dark', 'light'].includes(s.theme) || !['auto', 'cpu'].includes(s.aiProvider) || !Number.isInteger(s.autosaveSeconds) || s.autosaveSeconds < 5 || s.autosaveSeconds > 300 || typeof s.reduceMotion !== 'boolean') throw new Error('Invalid settings.');
  return { theme: s.theme, autosaveSeconds: s.autosaveSeconds, aiProvider: s.aiProvider, reduceMotion: s.reduceMotion };
}
export class History<T> {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  constructor(private limit = 60, private maxChars = 32_000_000) {}
  push(value: T) { const s = JSON.stringify(value); if (s === this.undoStack.at(-1)) return; this.undoStack.push(s); while (this.undoStack.length > 1 && (this.undoStack.length > this.limit || this.undoStack.reduce((n, x) => n + x.length, 0) > this.maxChars)) this.undoStack.shift(); this.redoStack = []; }
  undo(): T | undefined { if (this.undoStack.length < 2) return; this.redoStack.push(this.undoStack.pop()!); return JSON.parse(this.undoStack.at(-1)!); }
  redo(): T | undefined { const s = this.redoStack.pop(); if (!s) return; this.undoStack.push(s); return JSON.parse(s); }
  get canUndo() { return this.undoStack.length > 1; }
  get canRedo() { return this.redoStack.length > 0; }
}
