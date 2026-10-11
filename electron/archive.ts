import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';
import { validateDesign, type Design } from '../src/shared/model';
export const MAX_ARCHIVE = 512 * 1024 * 1024;
export function encodeProject(design: Design): Uint8Array {
  validateDesign(design);
  const assets: Record<string, Uint8Array> = {};
  const walk = (v: any): any => {
    if (typeof v === 'string' && v.startsWith('data:') && v.includes(';base64,')) {
      const [prefix, body] = v.split(';base64,'); const bytes = Buffer.from(body, 'base64');
      const key = createHash('sha256').update(bytes).digest('hex'); assets['assets/' + key] = bytes;
      return { $asset: key, mime: prefix.slice(5) };
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const doc = walk(design); const json = strToU8(JSON.stringify(doc));
  if (json.length + Object.values(assets).reduce((n, b) => n + b.length, 0) > MAX_ARCHIVE) throw new Error('Project exceeds 512 MB.');
  return zipSync({ 'project.json': json, ...assets }, { level: 1 });
}
export function decodeProject(bytes: Uint8Array): Design {
  if (bytes.length > MAX_ARCHIVE) throw new Error('Project exceeds 512 MB.');
  let total = 0; let count = 0;
  const files = unzipSync(bytes, { filter: f => {
    if (!/^(project\.json|assets\/[a-f0-9]{64})$/.test(f.name)) throw new Error('Unsafe archive entry.');
    total += f.originalSize; count++;
    if (total > MAX_ARCHIVE || count > 10000 || f.originalSize > MAX_ARCHIVE) throw new Error('Archive exceeds safe decompression limits.');
    return true;
  } });
  if (!files['project.json'] || files['project.json'].length > 64 * 1024 * 1024) throw new Error('Missing or oversized project metadata.');
  const walk = (v: any, depth = 0): any => {
    if (depth > 40) throw new Error('Project nesting too deep.');
    if (v && typeof v === 'object' && '$asset' in v) {
      if (!/^[a-f0-9]{64}$/.test(v.$asset) || typeof v.mime !== 'string') throw new Error('Invalid asset reference.');
      const data = files['assets/' + v.$asset];
      if (!data || createHash('sha256').update(data).digest('hex') !== v.$asset) throw new Error('Missing or corrupt asset.');
      if (v.mime.startsWith('image/')) { const size = imageSize(data); if (!size.width || !size.height || size.width * size.height > 70_000_000) throw new Error('Embedded image exceeds safe pixel limits.'); }
      return 'data:' + v.mime + ';base64,' + Buffer.from(data).toString('base64');
    }
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, depth + 1)]));
    return v;
  };
  const design = walk(JSON.parse(strFromU8(files['project.json']))); validateDesign(design); return design;
}
