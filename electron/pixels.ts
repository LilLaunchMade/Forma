export function normalizeRGB(rgb: Uint8Array, size: number): Float32Array {
  const plane = size * size; const result = new Float32Array(plane * 3);
  let max = 1; for (const x of rgb) max = Math.max(max, x);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let p = 0; p < plane; p++) for (let c = 0; c < 3; c++) result[c * plane + p] = (rgb[p * 3 + c] / max - mean[c]) / std[c];
  return result;
}
export function normalizeMask(data: Float32Array): Uint8Array {
  let min = Infinity, max = -Infinity; for (const v of data) { if (!Number.isFinite(v)) throw new Error('Invalid model output.'); min = Math.min(min, v); max = Math.max(max, v); }
  const range = max - min; return Uint8Array.from(data, v => range > 1e-8 ? Math.round((v - min) / range * 255) : (v > 0.5 ? 255 : 0));
}
export function resizeRGB(rgba: Uint8Array, width: number, height: number, size: number): Uint8Array {
  const result = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.max(0, (x + .5) * width / size - .5), sy = Math.max(0, (y + .5) * height / size - .5);
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) result[(y * size + x) * 3 + c] = Math.round((rgba[(y0 * width + x0) * 4 + c] * (1 - fx) + rgba[(y0 * width + x1) * 4 + c] * fx) * (1 - fy) + (rgba[(y1 * width + x0) * 4 + c] * (1 - fx) + rgba[(y1 * width + x1) * 4 + c] * fx) * fy);
  }
  return result;
}
export function applyAlpha(rgba: Uint8Array, width: number, height: number, mask: Uint8Array, size: number): Uint8Array {
  if (rgba.length !== width * height * 4 || mask.length !== size * size) throw new Error('Invalid image or alpha channel dimensions.');
  const outMask = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.max(0, (x + .5) * size / width - .5), sy = Math.max(0, (y + .5) * size / height - .5);
    const x0 = Math.min(size - 1, Math.floor(sx)), y0 = Math.min(size - 1, Math.floor(sy)), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    const a = Math.round((mask[y0 * size + x0] * (1 - fx) + mask[y0 * size + x1] * fx) * (1 - fy) + (mask[y1 * size + x0] * (1 - fx) + mask[y1 * size + x1] * fx) * fy);
    const i = (y * width + x) * 4; rgba[i + 3] = Math.round(rgba[i + 3] * a / 255); outMask[i] = outMask[i + 1] = outMask[i + 2] = a; outMask[i + 3] = 255;
  }
  return outMask;
}
