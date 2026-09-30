import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture} from './phase6-fixture.mjs';
const {adapter,surface,pack}=await fixture();
const state={x:-29.51230888398404,y:.25996101167801766,z:-70.52176879416031,surfaceId:'osm-way-826105809',heading:-2.280743840275509};
await adapter.prepare(state.x,state.z);
const hits=[];for(const heading of [state.heading,state.heading+Math.PI]){
 const s={...state,heading};assert.ok(adapter.validate(s,s,false),JSON.stringify(adapter.lastRejected));hits.push({heading,result:'PASS'});
}
const x=-29.5200168684619,z=-70.52258562695195,candidates=surface.getRoadTriangles().candidates(x,z),a=candidates.find(c=>c.surfaceId==='osm-way-826105809'),b=candidates.find(c=>c.surfaceId==='osm-way-548693460');
assert.ok(surface.allowsTransition(a,b,x,z),'coplanar ground road enters within actual junction triangles');
assert.equal(surface.allowsTransition(a,b,x+1,z+1),false,'no bridge admission outside the actual join');
await writeFile('docs/wuhan-phase61-ground-join-qa.json',JSON.stringify({result:'PASS',datasetId:pack.manifest.datasetId,state,joinNode:5300641305,candidates,hits,checks:['full footprint in both headings','coincident ground road admitted only inside real ground join','outside junction remains forbidden']},null,2)+'\n');
console.log('PASS overlapping ground-road bridge entry regression');
