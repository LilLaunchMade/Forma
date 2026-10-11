import type { Design, Recent, Settings } from './model';
export interface Imported { name: string; kind: 'image' | 'svg' | 'font'; data: string }
export interface AIResult { output: string; mask: string; provider: string; width: number; height: number }
export interface FormaAPI {
  list(): Promise<Recent[]>;
  open(id?: string): Promise<Design | null>;
  save(design: Design, saveAs?: boolean): Promise<boolean>;
  autosave(design: Design): Promise<void>;
  recover(id: string): Promise<Design>;
  remove(id: string): Promise<void>;
  importAssets(kind: 'image' | 'font'): Promise<Imported[]>;
  exportFile(name: string, format: string, data: string): Promise<boolean>;
  removeBackground(data: string, provider: 'auto' | 'cpu'): Promise<AIResult>;
  aiAssets(): Promise<{ model: Uint8Array; wasm: Uint8Array }>;
  settings(value?: Settings): Promise<Settings>;
  fullscreen(): Promise<void>;
  version(): Promise<string>;
  bundledFonts(): Promise<{ family: string; data: string }[]>;
  onClose(callback: () => Promise<void>): () => void;
  onOpen(callback: (design: Design) => void): () => void;
}
declare global { interface Window { forma: FormaAPI } }
