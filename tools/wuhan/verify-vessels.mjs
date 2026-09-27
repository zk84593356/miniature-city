import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {insideRing,waterHeight,waterAt} from '../../src/atlas/geo/projection.js';
import {createBridge} from '../../src/atlas/render/bridges.js';
import {preparePath,samplePath} from '../../src/atlas/simulation/path.js';
const load=async name=>JSON.parse(await readFile('city-data/wuhan/generated/'+name));
const data=await load('vessel-routes.json'),waters=await load('water.json'),bridges=await load('bridges.json'),config=await load('dynamic-config.json');
const obstacleExport=[];
for(const b of bridges){const g=createBridge(b,{register(){},sample(x,z){const w=waterAt(x,z,waters);return w?{kind:'water',height:waterHeight(w,x,z)}:null;}});obstacleExport.push({id:b.id,obstacles:g.userData.obstacles});g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
assert.deepEqual(data.obstacles,obstacleExport,'reuse exact Phase 2 obstacle metadata');
let points=0;const checks=[];
for(const r of data.routes){assert.equal(r.estimated,true);assert.ok(r.source);assert.ok(r.vesselTypes.every(t=>config.vesselTypes[t]));const w=waters.find(w=>w.id===r.waterBodyId);assert.ok(w);const curve=preparePath(r.path.map(([x,z])=>[x,0,z])),p={};
  // Independent runtime sampler including both directional offsets and hull corners;
  // exact continuous whole-footprint containment is additionally checked in Python.
  for(let s=0;s<=curve.length;s+=.1){samplePath(curve,s,p);for(const side of [-1,1])for(const dx of [-.045,.045])for(const dz of [-.21,.21]){
    const x=p.x-Math.cos(p.heading)*side*.06+Math.cos(p.heading)*dx+Math.sin(p.heading)*dz,z=p.z+Math.sin(p.heading)*side*.06-Math.sin(p.heading)*dx+Math.cos(p.heading)*dz;
    assert.ok(insideRing(x,z,w.rings[0])&&!w.rings.slice(1).some(r=>insideRing(x,z,r)),`${r.id}: hull outside water`);assert.ok(Number.isFinite(waterHeight(w,x,z)));points++;
  }}
  for(const c of r.bridgeConstraints){assert.ok(c.estimated);assert.ok(c.clearanceMeters>config.vesselTypes.cargo.height+2);assert.ok(bridges.some(b=>b.id===c.bridge));}
  checks.push({id:r.id,estimated:true,samples:Math.ceil(curve.length/.1),bridgeConstraints:r.bridgeConstraints});
}
const result={result:'PASS',points,checks,continuousFootprintCheck:'tools/wuhan/verify-dynamic-geography.py',obstaclesMatchPhase2:true};await writeFile('docs/wuhan-phase4-vessel-qa.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({result:'PASS',routes:checks.length,points,obstaclesMatchPhase2:true}));
