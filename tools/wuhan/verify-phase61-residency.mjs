import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import * as T from 'three';
import {fixture} from './phase6-fixture.mjs';import {rideWindow} from '../../src/atlas/ride/ride-residency.js';
import {decode} from '../../src/atlas/render/geography.js';
const {urban,surface,pack}=await fixture(),canonical=urban.canonical,bridge=canonical.index.bridges.find(b=>b.id==='bridge-yangtze-first'),p=bridge.profile[0];
await canonical.prepareRide(rideWindow(p[0],p[2],Math.PI/2,60/3.6));const before=canonical.residency();
assert.ok(before.pinnedBridges.includes(bridge.id));
const access=canonical.entries.filter(e=>e.spec.bridgeAccessIds?.includes(bridge.id));assert.ok(access.length);assert.ok(access.every(e=>e.ridePinned&&e.geometry));
const camera=new T.PerspectiveCamera(45,1,.01,2000);camera.position.set(600,2,600);camera.lookAt(650,2,650);camera.updateMatrixWorld();
canonical.update(camera,performance.now()+60000,new T.Vector3(600,0,600));
assert.ok(access.every(e=>e.geometry&&e.ridePinned),'camera relocation cannot evict required connections');
assert.ok(surface.getRoadTriangles().features.has(bridge.id),'CPU bridge remains registered');
for(const e of canonical.entries.filter(e=>e.ridePinned)){
 const metadata=await pack.loadJSON(e.spec.metadata);
 const originalGeometry=decode(await pack.loadAsset(e.spec.file),e.spec);
 for(const id of e.ids){const feature=surface.getRoadTriangles().features.get(id);assert.equal(feature.positions,e.geometry.attributes.position.array,'CPU and visual vertex arrays are identical');assert.equal(feature.indices,e.geometry.index.array,'CPU and GPU share the final index array');const original=metadata.features.find(f=>f.id===id);assert.equal(feature.triangleCount,original.triangleCount);assert.deepEqual(feature.roadIds,original.roadIds);assert.deepEqual(feature.indices.subarray(feature.triangleStart*3,(feature.triangleStart+feature.triangleCount)*3),originalGeometry.index.array.subarray(original.triangleStart*3,(original.triangleStart+original.triangleCount)*3),'every feature retains exactly the same ordered triangles after material batching');}
 originalGeometry.dispose();
}
canonical.releaseRide();canonical.update(camera,performance.now()+120000,new T.Vector3(600,0,600));
assert.ok(!surface.getRoadTriangles().features.has(bridge.id),'release and timeout permit bounded eviction');
await writeFile('docs/wuhan-phase61-residency-qa.json',JSON.stringify({result:'PASS',datasetId:pack.manifest.datasetId,before,accessChunks:access.map(e=>e.spec.file),checks:['whole bridge and both access chains pinned','camera/frustum independent CPU and visual residency','exact shared positions and final indices identity','preserved feature counts and road identities','release and distant timeout unregister CPU geometry']},null,2)+'\n');canonical.dispose();console.log('PASS ride residency and release');
