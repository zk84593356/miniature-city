import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Accept a real Git checkout directory so working-tree newline conversion cannot
// hide a mismatch between the committed bytes and the generated manifest.
const root=path.resolve(process.argv[2]??'city-data/wuhan/generated');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestBytes=await readFile(path.join(root,'manifest.json'));
assert.ok(!manifestBytes.includes(13)&&manifestBytes.at(-1)===10,'manifest LF');
const manifest=JSON.parse(manifestBytes);
const samples={};
for(const [name,info] of Object.entries(manifest.dataFiles)) {
  assert.equal(path.basename(name),name,'resource stays inside pack');
  const bytes=await readFile(path.join(root,name));
  assert.equal(bytes.length,info.bytes,`${name}: byte length`);
  assert.equal(hash(bytes),info.sha256,`${name}: SHA256`);
  if(name.endsWith('.json'))assert.ok(!bytes.includes(13)&&bytes.at(-1)===10,`${name}: LF`);
  if(['water.json','water-provenance.json','quality.json'].includes(name))samples[name]={bytes:bytes.length,sha256:hash(bytes)};
}
console.log(JSON.stringify({result:'PASS',datasetId:manifest.datasetId,assets:Object.keys(manifest.dataFiles).length,LF:true,samples},null,2));
