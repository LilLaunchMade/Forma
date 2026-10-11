const fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const visited = new Set(), records = [];
async function walk(name, from) {
  let dir = from;
  while (true) { const candidate = path.join(dir, 'node_modules', name, 'package.json'); try { await fs.access(candidate); dir = path.dirname(candidate); break; } catch { const next = path.dirname(dir); if (next === dir) return; dir = next; } }
  if (visited.has(dir)) return; visited.add(dir);
  const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')); const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'UNSPECIFIED';
  const files = (await fs.readdir(dir)).filter(n => /^(licen[sc]e|copying|notice)(\.|$|-)/i.test(n)); let notice = '';
  for (const f of files) { try { notice += `\n--- ${f} ---\n` + await fs.readFile(path.join(dir, f), 'utf8'); } catch { /* directories */ } }
  if (!notice && !/UNLICENSED|UNSPECIFIED/.test(license)) notice = 'License declaration: ' + license;
  const identifier = (pkg.name + '-' + pkg.version).replaceAll('/', '__');
  await fs.writeFile(path.join(root, 'licenses/dependencies', identifier + '.txt'), `${pkg.name} ${pkg.version}\nLicense: ${license}\n${notice}`);
  records.push({ name: pkg.name, version: pkg.version, license });
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) await walk(dep, dir);
}
async function main() {
  await fs.mkdir(path.join(root, 'licenses/dependencies'), { recursive: true }); const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  for (const name of [...Object.keys(pkg.dependencies), 'electron', 'fabric', 'jspdf', 'lucide-react', 'react', 'react-dom', 'zustand']) await walk(name, root);
  records.sort((a, b) => a.name.localeCompare(b.name));
  const text = '# Third-party notices\n\nOriginal Forma code, branding and templates are MIT licensed. Dependencies keep their own licenses. Full installed notices are in `licenses/dependencies/`.\n\nU²-Net / U2NetP model by Xuebin Qin and collaborators: Apache-2.0, see `licenses/U2NET-Apache-2.0.txt`. Source: https://github.com/xuebinqin/U-2-Net ; ONNX distribution: https://github.com/danielgatis/rembg/releases/tag/v0.0.0 . Model SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`.\n\nInter by Rasmus Andersson, Space Grotesk by Florian Karsten, and Lora by Cyreal: SIL Open Font License 1.1. Full licenses in `licenses/`. Lucide icons: ISC. Electron also ships Chromium and Node notices in its distribution. ONNX Runtime MIT and full upstream third-party notices are included in licenses/ONNXRuntime-MIT.txt and licenses/ONNXRuntime-ThirdPartyNotices.txt. Sharp is a development-only asset/QA tool, excluded from the distributed runtime.\n\n| Package | Version | License |\n|---|---|---|\n' + records.map(r => `| ${r.name} | ${r.version} | ${r.license} |`).join('\n') + '\n';
  await fs.writeFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), text); await fs.writeFile(path.join(root, 'licenses/inventory.json'), JSON.stringify(records, null, 2));
  const blocked = records.filter(r => /UNSPECIFIED|UNLICENSED|AGPL|GPL-3/.test(r.license)); if (blocked.length) throw new Error('Review licenses: ' + JSON.stringify(blocked));
  console.log(`${records.length} installed dependency licenses inventoried.`);
}
main().catch(e => { console.error(e); process.exit(1); });

