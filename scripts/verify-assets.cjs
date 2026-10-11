const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'); const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
for (const [file, hash] of Object.entries(manifest)) if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') !== hash) throw new Error('Asset integrity mismatch: ' + file);
for (const file of ['assets/brand/icon.ico', 'licenses/U2NET-Apache-2.0.txt', 'licenses/Inter-OFL.txt', 'licenses/SpaceGrotesk-OFL.txt', 'licenses/Lora-OFL.txt']) fs.accessSync(path.join(root, file));
console.log('Asset hashes and required licenses verified.');
