import { expect, it } from 'vitest';
import { applyAlpha, resizeRGB } from '../electron/pixels';
it('keeps mask channel indices and source alpha correct at original resolution', () => {
  const rgba = Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255, 100, 110, 120, 255]);
  const mask = applyAlpha(rgba, 2, 2, Uint8Array.from([0, 255, 128, 64]), 2);
  expect([...rgba]).toEqual([10, 20, 30, 0, 40, 50, 60, 128, 70, 80, 90, 128, 100, 110, 120, 64]);
  expect([...mask]).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 64, 64, 64, 255]);
  expect(() => applyAlpha(rgba, 2, 2, new Uint8Array(12), 2)).toThrow();
});
it('resizes input RGB without mixing alpha into color channels', () => { expect([...resizeRGB(Uint8Array.from([255, 0, 0, 128]), 1, 1, 2)]).toEqual([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 0]); });
