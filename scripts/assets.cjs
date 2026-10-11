/* Build-time downloads only. The installed application never downloads assets. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function download(url, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try { return await fs.readFile(target); } catch { /* download missing asset */ }
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} downloading ${url}`);
  const data = Buffer.from(await r.arrayBuffer()); await fs.writeFile(target, data); return data;
}
async function main() {
  const files = {};
  const model = await download('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', path.join(root, 'assets/models/u2netp.onnx'));
  if (crypto.createHash('md5').update(model).digest('hex') !== '8e83ca70e441ab06c318d82300c84806') throw new Error('Upstream model checksum mismatch.');
  files['assets/models/u2netp.onnx'] = crypto.createHash('sha256').update(model).digest('hex');
  await download('https://raw.githubusercontent.com/xuebinqin/U-2-Net/master/LICENSE', path.join(root, 'licenses/U2NET-Apache-2.0.txt'));
  for (const [dir, name] of [['inter', 'Inter'], ['spacegrotesk', 'SpaceGrotesk'], ['lora', 'Lora']]) {
    const suffix = name === 'SpaceGrotesk' ? '[wght]' : name === 'Inter' ? '[opsz,wght]' : '[wght]';
    const target = 'public/fonts/' + name + '.ttf';
    const bytes = await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/${name}${encodeURIComponent(suffix)}.ttf`, path.join(root, target));
    files[target] = crypto.createHash('sha256').update(bytes).digest('hex');
    await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/OFL.txt`, path.join(root, 'licenses', name + '-OFL.txt'));
  }
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="60" fill="#775BFF"/><path d="M62 55h136v42H106v29h71v40h-71v37H62z" fill="#F6F7FB"/><path d="M151 126h26v40h-26z" fill="#80E8DB"/></svg>`;
  for (const dir of ['assets/brand', 'public/brand']) { await fs.mkdir(path.join(root, dir), { recursive: true }); await fs.writeFile(path.join(root, dir, 'logo.svg'), logo); await sharp(Buffer.from(logo)).png().toFile(path.join(root, dir, 'icon.png')); }
  const png = await sharp(Buffer.from(logo)).resize(256, 256).png().toBuffer();
  const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 0; header[7] = 0; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  await fs.writeFile(path.join(root, 'assets/brand/icon.ico'), Buffer.concat([header, png]));
  const manifestPath = path.join(root, 'assets/manifest.json');
  try { const old = JSON.parse(await fs.readFile(manifestPath, 'utf8')); for (const [f, hash] of Object.entries(old)) if (files[f] !== hash) throw new Error('Asset integrity changed: ' + f); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.writeFile(manifestPath, JSON.stringify(files, null, 2) + '\n');
  console.log('Bundled model, three font families, licenses and original Forma branding verified.');
}
main().catch(e => { console.error(e); process.exit(1); });
