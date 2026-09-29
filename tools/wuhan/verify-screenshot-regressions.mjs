import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,json} from './phase6-fixture.mjs';
const {adapter,surface,urban,bridges,pack,projection}=await fixture();
const original=bridges.find(b=>b.id==='yangtze-first'),bridge=urban.canonical.index.bridges.find(b=>b.id==='bridge-yangtze-first');
const roads=(await Promise.all((await json(pack.manifest.urban.roads)).chunks.map(c=>json(c.file)))).flat();
const results=[];
// Screenshot has no saved camera pose. These conservative station ranges were
// located from the two bridge portals and Guishan tower, not exact pixel picking.
for(const [id,range,representative] of [['west-red-box',[1000,1380],110],['east-red-box',[2810,2950],258]]){
 let count=0,oldBuried=0,maxOldBurialMeters=0,maxNewBurialMeters=0;const failures=[];
 for(let i=1;i<bridge.profile.length;i++){
  if(original.stationsMeters[i]<range[0]||original.stationsMeters[i-1]>range[1])continue;
  const a=bridge.profile[i-1],b=bridge.profile[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);await adapter.prepare(a[0],a[2]);
  for(let j=0,n=Math.ceil(length/.005);j<=n;j++)for(const lateral of [-.085,0,.085]){
   const t=j/n,x=a[0]+t*dx+dz/length*lateral,z=a[2]+t*dz-dx/length*lateral,top=surface.getRoadTriangles().candidates(x,z).find(c=>c.surfaceId===bridge.id),ground=surface.sample(x,z);
   const oldY=original.profile[i-1][1]+t*(original.profile[i][1]-original.profile[i-1][1]);
   if(ground?.kind==='ground'){const oldBurial=(ground.height-oldY)*100;maxOldBurialMeters=Math.max(maxOldBurialMeters,oldBurial);if(oldBurial>.1)oldBuried++;maxNewBurialMeters=Math.max(maxNewBurialMeters,(ground.height-(top?.height??-100))*100);}
   const p={x,z,y:top?.height,surfaceId:bridge.id,heading:Math.atan2(dx,dz)};count++;
   if(!top||!adapter.validate(p,p,false))failures.push({position:[x,p.y,z],reason:adapter.lastBlock});
  }
 }
 const point=original.profile[representative],near=roads.filter(r=>r.bridgeProfile===original.id||original.approachRoadIds.includes(r.id)).map(r=>({r,d:Math.min(...r.coordinates.map(p=>Math.hypot(p[0]-point[0],p[1]-point[2])))})).sort((a,b)=>a.d-b.d)[0];
 results.push({id,screenshotPixels:id.startsWith('west')?[195,226,333,291]:[1076,503,1232,568],localization:'Approximate screenshot region inferred from visible landmarks; exact original camera state unavailable. Fixed geographic samples below are reproducible.',stationRangeMeters:range,longitudeLatitude:projection.inverse(point[0],point[2]),roadId:near.r.id,osmId:near.r.osmId,surfaceId:bridge.id,samples:count,oldBuriedSamples:oldBuried,maxOldBurialMeters,maxNewBurialMeters,failures});
}
const report={result:results.every(r=>!r.failures.length&&r.maxNewBurialMeters<.1)?'PASS':'FAIL',datasetId:pack.manifest.datasetId,results};await writeFile('docs/wuhan-phase6-screenshot-regressions.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));assert.equal(report.result,'PASS');
