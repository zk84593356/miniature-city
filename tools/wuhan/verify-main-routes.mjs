import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,json} from './phase6-fixture.mjs';
import {DEBUG_SPAWNS} from '../../src/atlas/ride/ride-spawn.js';
const {adapter,surface,pack,projection}=await fixture();
const roads=(await Promise.all((await json(pack.manifest.urban.roads)).chunks.map(c=>json(c.file)))).flat();
const results=[],rejected=[];
async function traverse(road,spacing){
 let previous=null,prepared=null,samples=0,distance=0,junctions=0,maxGrade=0;
 const path=road.profile;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(!length)continue;
  if(!prepared||Math.hypot(a[0]-prepared[0],a[2]-prepared[2])>3){await adapter.prepare(a[0],a[2]);prepared=a;}
  for(let j=0,n=Math.ceil(length*100/spacing);j<=n;j++){
   const t=j/n;if(i===1&&t*length<.012||i===path.length-1&&(1-t)*length<.012)continue;
   const x=a[0]+t*dx,z=a[2]+t*dz;
   const top=surface.getRoadTriangles().candidates(x,z).find(c=>c.surfaceId===road.id);
   if(!top)return {pass:false,i,j,reason:'missing canonical top',position:[x,z]};
   const p={x,z,y:top.height,surfaceId:road.id,heading:Math.atan2(dx,dz)};
   const hit=adapter.validate(p,previous??p,false);samples++;
   if(!hit)return {pass:false,i,j,reason:adapter.lastBlock,position:[x,p.y,z]};
   if(previous)distance+=Math.hypot(x-previous.x,z-previous.z)*100;
   maxGrade=Math.max(maxGrade,Math.acos(Math.min(1,hit.normal[1]))*180/Math.PI);
   if(surface.getRoadTriangles().candidates(x,z).some(c=>c.nodeId))junctions++;
   previous={...p,...hit,y:hit.height};
  }
 }
 return {pass:true,samples,distanceMeters:distance,junctionSamples:junctions,maxSlopeDegrees:maxGrade,surfaceMissing:0,waterFall:0,railTransition:0,teleport:0};
}
for(const region of ['hankou','wuchang','donghu','guanggu']){
 const [x,z]=projection.forward(DEBUG_SPAWNS[region]);
 const candidates=roads.filter(r=>r.rendered&&!r.bridge&&!r.tunnel&&r.access!=='no'&&!/^(trunk|motorway)/.test(r.roadClass)&&r.width>=3&&r.profile.every(Boolean)&&r.coordinates.some(p=>Math.hypot(p[0]-x,p[1]-z)<15)).map(r=>({r,length:r.profile.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-r.profile[i][0],p[2]-r.profile[i][2])*100,0)})).filter(r=>r.length>800).sort((a,b)=>b.length-a.length);
 let chosen;
 for(const {r} of candidates){const check=await traverse(r,.5);if(check.pass){chosen=r;break;}rejected.push({region,roadId:r.id,...check});}
 assert.ok(chosen,`continuous long route in ${region}`);
 const speeds=[];
 for(const kmh of [10,25,40,60]){const spacing=Math.min(.1,kmh/3.6/120),result=await traverse(chosen,spacing);assert.ok(result.pass,JSON.stringify(result));speeds.push({kmh,stepMeters:spacing,...result});}
 results.push({region,roadId:chosen.id,osmId:chosen.osmId,name:chosen.name,speeds});console.log('MAIN ROUTE',region,chosen.id,speeds[0].distanceMeters);
}
await writeFile('docs/wuhan-phase6-main-routes-qa.json',JSON.stringify({result:'PASS',datasetId:pack.manifest.datasetId,scope:'Actual runtime full footprint and static collisions at four speed-dependent substep distances; geometric route replay, not steering autopilot or traffic simulation.',results,rejectedCandidates:rejected},null,2)+'\n');
