import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const output = path.resolve(root, 'atlas-site');
const staging = path.resolve(root, '.atlas-site-build-tmp');
for (const target of [output, staging]) {
  if (path.dirname(target) !== root) throw new Error('Build target escapes repository');
}
const manifest = JSON.parse(await readFile('city-data/wuhan/generated/manifest.json', 'utf8'));
for (const [file, metadata] of Object.entries(manifest.dataFiles)) {
  if (path.basename(file) !== file) throw new Error('Invalid pack path');
  const data = await readFile(`city-data/wuhan/generated/${file}`);
  if (data.length !== metadata.bytes || createHash('sha256').update(data).digest('hex') !== metadata.sha256) throw new Error(`Invalid data: ${file}`);
}
const three = JSON.parse(await readFile('node_modules/three/package.json', 'utf8'));
if (three.version !== '0.185.0') throw new Error('Three.js must match the pinned revision');
await rm(staging, { force: true, recursive: true });
await cp('public-site', staging, { recursive: true });
for (const dir of ['wuhan', 'vendor/three/addons/controls', 'cities/wuhan']) await mkdir(path.join(staging, dir), { recursive: true });
await cp('src/atlas', path.join(staging, 'atlas'), { recursive: true });
for (const name of ['index.html', 'wuhan.css']) await cp(`src/cities/wuhan/${name}`, path.join(staging, 'wuhan', name));
for (const name of ['three.module.js', 'three.core.js']) await cp(`node_modules/three/build/${name}`, path.join(staging, 'vendor/three', name));
await cp('node_modules/three/examples/jsm/controls/OrbitControls.js', path.join(staging, 'vendor/three/addons/controls/OrbitControls.js'));
await cp('node_modules/three/LICENSE', path.join(staging, 'vendor/three/LICENSE'));
await mkdir(path.join(staging, 'data/wuhan'), { recursive: true });
for (const file of Object.keys(manifest.dataFiles)) await cp(`city-data/wuhan/generated/${file}`, path.join(staging, 'data/wuhan', file));
await cp('city-data/wuhan/generated/manifest.json', path.join(staging, 'cities/wuhan/manifest.json'));
const registry = JSON.parse(await readFile(path.join(staging, 'cities/registry.json'), 'utf8'));
registry.cities.push({ id: 'wuhan', name: manifest.name, route: '../wuhan/', manifest: './wuhan/manifest.json', status: 'geography-preview' });
await writeFile(path.join(staging, 'cities/registry.json'), JSON.stringify(registry, null, 2) + '\n');
async function inventory(dir, prefix = '', files = {}) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix + item.name;
    if (item.isDirectory()) await inventory(path.join(dir, item.name), rel + '/', files);
    else files[rel] = createHash('sha256').update(await readFile(path.join(dir, item.name))).digest('hex');
  }
  return files;
}
await writeFile(path.join(staging, 'atlas-build-report.json'), JSON.stringify({ schemaVersion: 1, datasetId: manifest.datasetId, files: await inventory(staging) }, null, 2) + '\n');
await rm(output, { force: true, recursive: true });
await rename(staging, output);
console.log(`PASS — atlas-site: Shenzhen baseline + Wuhan ${manifest.datasetId}`);
