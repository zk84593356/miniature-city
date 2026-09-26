import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createLandmark,disposeLandmarkMaterials} from '../../src/atlas/render/landmark-models.js';

const definitions=JSON.parse(await readFile('city-data/wuhan/generated/landmarks.json','utf8'));
assert.equal(definitions.filter(d=>!d.supplementary).length,11);
const rows=[];
for(const d of definitions){
  const group=createLandmark(d);let triangles=0,bytes=0;
  group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;assert.ok([...g.attributes.position.array].every(Number.isFinite),d.id);assert.ok([...g.attributes.normal.array].every(Number.isFinite),d.id);assert.ok([...g.index.array].every(i=>i<g.attributes.position.count));triangles+=g.index.count/3;for(const a of [...Object.values(g.attributes),g.index])bytes+=a.array.byteLength;});
  const box=new THREE.Box3().setFromObject(group),top=Math.max(...d.components.map(c=>c.position[1]+c.height/100));
  assert.ok(Math.abs(box.max.y-top)<.08,`${d.id}: model top differs from declared height`);
  const bounds=d.collisionBounds;
  assert.ok(box.min.toArray().every((v,i)=>v>=bounds[i]-1e-4)&&box.max.toArray().every((v,i)=>v<=bounds[i+3]+1e-4),`${d.id}: collision bounds must contain the visual model`);
  assert.ok(group.children.length<=10,`${d.id}: draw calls`);assert.ok(triangles<30000,`${d.id}: triangle budget`);
  rows.push({id:d.id,triangles,drawCalls:group.children.length,geometryBytes:bytes,bounds:[...box.min.toArray(),...box.max.toArray()],heightMeters:(box.max.y-Math.min(...d.components.map(c=>c.position[1])))*100});
  group.traverse(o=>o.geometry?.dispose());
}
disposeLandmarkMaterials();
await writeFile('docs/wuhan-phase3-model-qa.json',JSON.stringify({result:'PASS',landmarks:rows,totalTriangles:rows.reduce((n,r)=>n+r.triangles,0),totalDrawCalls:rows.reduce((n,r)=>n+r.drawCalls,0)},null,2)+'\n');
console.log(JSON.stringify(rows));
