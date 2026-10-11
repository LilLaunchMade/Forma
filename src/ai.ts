import type { AIResult } from './shared/api';

async function encode(rgba: Uint8Array, width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Image encoding is unavailable.');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG encoding failed.')), 'image/png'));
  canvas.width = canvas.height = 0;
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('PNG encoding failed.')); r.readAsDataURL(blob); });
}

export async function removeLocalBackground(png: string, provider: 'auto' | 'cpu'): Promise<AIResult> {
  if (provider === 'auto' && 'gpu' in navigator) {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const image = new Image(); image.src = png; await image.decode();
      const width = image.naturalWidth, height = image.naturalHeight;
      if (width * height > 40_000_000) throw new Error('AI images are limited to 40 megapixels.');
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Image decoding is unavailable.');
      context.drawImage(image, 0, 0); const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
      canvas.width = canvas.height = 0;
      const { model, wasm } = await window.forma.aiAssets();
      worker = new Worker(new URL('./gpu-worker.ts', import.meta.url), { type: 'module' });
      const result = await new Promise<{ rgba: Uint8Array; mask: Uint8Array }>((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('GPU processing timed out.')), 60000);
        worker!.onmessage = e => e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
        worker!.onerror = () => reject(new Error('GPU worker failed.'));
        worker!.postMessage({ rgba, width, height, model, wasm }, [rgba.buffer]);
      });
      return { output: await encode(result.rgba, width, height), mask: await encode(result.mask, width, height), width, height, provider: 'WebGPU / WASM fallback' };
    } catch { /* A fresh isolated WASM worker is the reliable fallback. */ }
    finally { clearTimeout(timeout); worker?.terminate(); }
  }
  return window.forma.removeBackground(png, 'cpu');
}
