import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const hash = body => createHash('sha256').update(body).digest('hex');
async function walk(root, prefix = '', output = []) {
  for (const e of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix + e.name;
    if (e.isDirectory()) await walk(root, name + '/', output); else output.push(name);
  }
  return output;
}
const baseline = await walk('public-site');
for (const name of baseline) {
  if (name === 'cities/registry.json') continue;
  assert.equal(hash(await readFile(`atlas-site/${name}`)), hash(await readFile(`public-site/${name}`)), `Shenzhen changed: ${name}`);
}
const originalRegistry = JSON.parse(await readFile('public-site/cities/registry.json', 'utf8'));
const registry = JSON.parse(await readFile('atlas-site/cities/registry.json', 'utf8'));
assert.equal(registry.defaultCity, 'shenzhen');
assert.deepEqual(registry.cities.filter(c => c.id !== 'wuhan'), originalRegistry.cities);
assert.equal(registry.cities.filter(c => c.id === 'wuhan').length, 1);
const manifestBytes = await readFile('atlas-site/cities/wuhan/manifest.json');
assert.ok(!manifestBytes.includes(13), 'manifest.json must use LF, matching Git checkout');
assert.equal(manifestBytes.at(-1), 10, 'manifest.json must end with LF');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.id, 'wuhan');
assert.equal(manifest.terrainExaggeration, 1);
assert.equal(manifest.projection.worldUnitMeters, 100);
assert.deepEqual(manifest.projection.origin, [114.32, 30.56]);
assert.equal(manifest.verticalDatum, 'EGM2008');
assert.ok(manifest.sources.length >= 2);
const meshes = {};
for (const [name, info] of Object.entries(manifest.dataFiles)) {
  let bytes = await readFile(`atlas-site/data/wuhan/${name}`);
  assert.equal(bytes.length, info.bytes, `size: ${name}`);
  assert.equal(hash(bytes), info.sha256, `checksum: ${name}`);
  if (name.endsWith('.json')) {
    assert.ok(!bytes.includes(13), `${name} must use LF, matching Git checkout`);
    assert.equal(bytes.at(-1), 10, `${name} must end with LF`);
  }
  if (!name.endsWith('.bin')) continue;
  if (info.compression === 'gzip') { bytes = gunzipSync(bytes); assert.equal(bytes.length, info.decodedBytes); }
  const spec = manifest[name.slice(0, -4)];
  assert.equal(bytes.length, spec.vertices * 12 + spec.triangles * 12);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  const xyz = new Float32Array(data, 0, spec.vertices * 3);
  const index = new Uint32Array(data, spec.vertices * 12, spec.triangles * 3);
  for (const v of xyz) assert.ok(Number.isFinite(v), `non-finite ${name}`);
  for (const i of index) assert.ok(i < spec.vertices, `index ${name}`);
  let reversed = 0;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const signed = (xyz[b] - xyz[a]) * (xyz[c + 2] - xyz[a + 2]) - (xyz[b + 2] - xyz[a + 2]) * (xyz[c] - xyz[a]);
    if (signed > .00001) reversed++;
    if (name === 'water.bin') {
      assert.equal(xyz[a + 1], xyz[b + 1]); assert.equal(xyz[a + 1], xyz[c + 1]);
    }
  }
  assert.equal(reversed, 0, `downward faces: ${name}`);
  meshes[name] = { vertices: spec.vertices, triangles: spec.triangles };
}
const quality = JSON.parse(await readFile('atlas-site/data/wuhan/quality.json', 'utf8'));
assert.ok(quality.waterBodies > 50);
assert.ok(quality.waterHoles > 5, 'islands must be retained');
assert.ok(quality.waterAreaKm2 > 50 && quality.waterAreaKm2 < 1800);
assert.equal(quality.hills.length, 4);
for (const hill of quality.hills) assert.ok(hill.maxMeters - hill.minMeters > 25, `Missing hill relief: ${hill.name}`);
const report = JSON.parse(await readFile('atlas-site/atlas-build-report.json', 'utf8'));
const actualFiles = (await walk('atlas-site')).filter(f => f !== 'atlas-build-report.json').sort();
assert.deepEqual(actualFiles, Object.keys(report.files).sort(), 'unexpected/missing aggregate files');
for (const name of actualFiles) assert.equal(hash(await readFile(`atlas-site/${name}`)), report.files[name], name);
for (const prefix of ['/', '/city/', '/nested/example/']) {
  const entry = new URL(`http://localhost${prefix}wuhan/`);
  const html = await readFile('atlas-site/wuhan/index.html', 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:http|data:)/.test(match[1])) continue;
    assert.ok(new URL(match[1], entry).pathname.startsWith(prefix), `resource escapes ${prefix}`);
  }
}
console.log(JSON.stringify({ result: 'PASS', shenzhenFilesPreserved: baseline.length - 1, dataset: manifest.datasetId, meshes, waterBodies: quality.waterBodies, islands: quality.waterHoles }, null, 2));
