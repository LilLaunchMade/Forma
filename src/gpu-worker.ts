import * as ort from 'onnxruntime-web/webgpu';
import { applyAlpha, normalizeMask, normalizeRGB, resizeRGB } from '../electron/pixels';

self.onmessage = async event => {
  let session: ort.InferenceSession | undefined;
  try {
    const { model, wasm, rgba, width, height } = event.data;
    if (!width || !height || width * height > 40_000_000 || rgba.length !== width * height * 4) throw new Error('Invalid AI image dimensions.');
    const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu || !await gpu.requestAdapter()) throw new Error('WebGPU is unavailable.');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmBinary = wasm;
    session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu', 'wasm'], preferredOutputLocation: 'cpu' });
    const rgb = normalizeRGB(resizeRGB(rgba, width, height, 320), 320);
    const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', rgb, [1, 3, 320, 320]) });
    const alpha = normalizeMask(await outputs[session.outputNames[0]].getData() as Float32Array);
    const mask = applyAlpha(rgba, width, height, alpha, 320);
    self.postMessage({ rgba, mask }, { transfer: [rgba.buffer, mask.buffer] });
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : String(e) }); }
  finally { await session?.release(); }
};
