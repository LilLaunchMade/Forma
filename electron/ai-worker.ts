import { parentPort, workerData } from 'node:worker_threads';
import { PNG } from 'pngjs';
import * as ort from 'onnxruntime-web';
import { readFile } from 'node:fs/promises';
import { resizeRGB, applyAlpha, normalizeRGB, normalizeMask } from './pixels';
async function run() {
  const { bytes, model, wasm } = workerData;
  const buffer = Buffer.from(bytes);
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('AI processing requires a decoded PNG image.');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width * height > 40_000_000) throw new Error('AI images are limited to 40 megapixels. Resize the image first.');
  const original = PNG.sync.read(buffer);
  // WASM builds contain no native trace telemetry. Read the bundled binary
  // directly so initialization cannot fetch code or a model from the network.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = await readFile(wasm);
  const session = await ort.InferenceSession.create(await readFile(model), { executionProviders: ['wasm'] });
  try {
    const rgb = resizeRGB(original.data, width, height, 320);
    const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', normalizeRGB(rgb, 320), [1, 3, 320, 320]) });
    const alpha = normalizeMask(output[session.outputNames[0]].data as Float32Array);
    const maskPixels = applyAlpha(original.data, width, height, alpha, 320);
    const result = PNG.sync.write(original);
    const mask = PNG.sync.write({ width, height, data: Buffer.from(maskPixels) } as PNG);
    parentPort?.postMessage({ output: 'data:image/png;base64,' + result.toString('base64'), mask: 'data:image/png;base64,' + mask.toString('base64'), width, height, provider: 'cpu' });
  } finally { await session.release(); }
}
if (parentPort) run().catch(e => parentPort?.postMessage({ error: 'Local AI: ' + (e instanceof Error ? e.message : String(e)) }));
