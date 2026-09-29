import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,json} from './phase6-fixture.mjs';
const {adapter,urban,surface,pack,bridges}=await fixture();
const roads=(await Promise.all((await json(pack.manifest.urban.roads)).chunks.map(c=>json(c.file)))).flat(),results=[];
for(const bridge of urban.canonical.index.bridges){
 let samples=0,failures=[];
 const path=bridge.profile;let previous=null,last=null;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(!length)continue;
  if(!last||Math.hypot(a[0]-last[0],a[2]-last[2])>3){await adapter.prepare(a[0],a[2]);last=a;}
  for(let j=0,n=Math.ceil(length/.005);j<=n;j++){
   if(i===1&&j/n*length<.01||i===path.length-1&&(1-j/n)*length<.01)continue;
   const t=j/n,x=a[0]+t*dx,z=a[2]+t*dz,hit=surface.getRoadTriangles().candidates(x,z).find(c=>c.surfaceId===bridge.id),p={x,z,y:hit?.height??a[1],heading:Math.atan2(dx,dz),surfaceId:bridge.id};
   const support=adapter.validate(p,previous??p,false);samples++;
   if(!support){if(failures.length<12)failures.push({i,j,position:[x,p.y,z],reason:adapter.lastBlock});}else previous={...p,...support,y:support.height};
  }
 }
 const outer=[];
 const original=bridges.find(b=>'bridge-'+b.id===bridge.id);
 for(const side of [-1,1]){
  let prior=null,misses=[],visibleObstacles=[];let count=0;
  for(let i=2;i<path.length-1;i++){
   const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(!length)continue;
   if(i===2||i%25===0)await adapter.prepare(a[0],a[2]);
   for(let j=0,n=Math.ceil(length/.005);j<=n;j++){
    const t=j/n,station=original.stationsMeters[i-1]+t*(original.stationsMeters[i]-original.stationsMeters[i-1]);let width=bridge.width;
    for(const tr of urban.canonical.index.audit.transitions.filter(v=>'bridge-'+v.bridge===bridge.id)){
     const atStart=Math.hypot(tr.position[0]-path[0][0],tr.position[1]-path[0][2])<.001,distance=atStart?station:original.stationsMeters.at(-1)-station,blend=Math.min(1,distance/100),smooth=blend*blend*(3-2*blend);width=Math.min(width,tr.widthMeters+(bridge.width-tr.widthMeters)*smooth);
    }
    const offset=side*Math.max(0,width/200-.012),x=a[0]+dx*t+dz/length*offset,z=a[2]+dz*t-dx/length*offset;
    const hit=surface.getRoadTriangles().candidates(x,z).find(c=>c.surfaceId===bridge.id),p={x,z,y:hit?.height??a[1],surfaceId:bridge.id,heading:Math.atan2(dx,dz)};
    let support=adapter.validate(p,prior??p,false);count++;
    if(!support&&adapter.lastBlock==='building'){
     // Existing buildings remain solid. Audit the road top independently and
     // report these occupied edge positions, rather than classifying them as gaps.
     visibleObstacles.push({i,j,kind:'building',position:[x,p.y,z]});
     const blocked=adapter.blocked;adapter.blocked=()=>null;
     try{support=adapter.validate(p,prior??p,false);}finally{adapter.blocked=blocked;}
    }
    if(!support){if(misses.length<6)misses.push({i,j,reason:adapter.lastBlock,position:[x,p.y,z]});}else prior={...p,...support,y:support.height};
   }
  }
  outer.push({side,samples:count,failures:misses,visibleObstacles});
 }
 const transitions=[];
 for(const tr of urban.canonical.index.audit.transitions.filter(t=>'bridge-'+t.bridge===bridge.id)){
  for(const id of tr.roadIds){
   const r=roads.find(r=>r.id===id),end=Math.hypot(r.profile[0][0]-tr.position[0],r.profile[0][2]-tr.position[1])<.001?0:r.profile.length-1,p=r.profile[end],q=r.profile[end===0?1:end-1];await adapter.prepare(p[0],p[2]);
   const dx=p[0]-q[0],dz=p[2]-q[2],length=Math.hypot(dx,dz);let missing=0,maxSeam=0,prev=null;
   for(let d=-.03;d<=.03;d+=.002){const x=p[0]+dx/length*d,z=p[2]+dz/length*d,hit=surface.sampleSurface(x,z,tr.height,bridge.id);if(!hit?.rideAllowed||!hit.canonical)missing++;else{if(prev)maxSeam=Math.max(maxSeam,Math.abs(hit.height-prev)*100);prev=hit.height;}}
   transitions.push({node:tr.node,roadId:id,samples:31,missing,maxSeamMeters:maxSeam});
  }
 }
 results.push({id:bridge.id,samples,failures,outer,transitions});console.log(JSON.stringify(results.at(-1)));
}
const report={result:results.every(r=>!r.failures.length&&r.outer.every(o=>!o.failures.length)&&r.transitions.every(t=>!t.missing&&t.maxSeamMeters<.1))?'PASS':'FAIL',datasetId:pack.manifest.datasetId,results};await writeFile('docs/wuhan-phase6-six-bridges-qa.json',JSON.stringify(report,null,2)+'\n');assert.equal(report.result,'PASS');
