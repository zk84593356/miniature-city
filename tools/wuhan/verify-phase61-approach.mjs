import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,json} from './phase6-fixture.mjs';
import {BODY} from '../../src/atlas/ride/ride-collision.js';

const {adapter,surface,urban,projection,pack}=await fixture();
const bridge=urban.canonical.index.bridges.find(b=>b.id==='bridge-yangtze-first');
const original=(await json('bridges.json')).find(b=>b.id==='yangtze-first');
const results=[];
for(const [name,station] of [['approach-start',0],['approach-middle',600],['approach-transition',original.waterRange[0]]]){
  const i=original.stationsMeters.reduce((best,s,n)=>Math.abs(s-station)<Math.abs(original.stationsMeters[best]-station)?n:best,0);
  const p=bridge.profile[i],a=bridge.profile[Math.max(0,i-1)],b=bridge.profile[Math.min(bridge.profile.length-1,i+1)],heading=Math.atan2(b[0]-a[0],b[2]-a[2]);
  await adapter.prepare(p[0],p[2],heading,60/3.6);
  const points=[];
  for(const forward of [-BODY.half,0,BODY.half])for(const side of [-BODY.radius,0,BODY.radius]){
    const x=p[0]+Math.sin(heading)*forward+Math.cos(heading)*side,z=p[2]+Math.cos(heading)*forward-Math.sin(heading)*side;
    const top=surface.sampleSurface(x,z,p[1],bridge.id);
    const entry=urban.canonical.entries.find(e=>e.ids.includes(top?.surfaceId));
    const visual=!!top?.canonical&&!!entry?.geometry&&surface.getRoadTriangles().features.get(top.surfaceId).positions===entry.geometry.attributes.position.array;
    points.push({x,z,surfaceId:top?.surfaceId,layerId:top?.layerId,height:top?.height,visualTop:visual,canonicalTop:!!top?.canonical,chunkId:entry?.spec.file});
  }
  const top=surface.sampleSurface(p[0],p[2],p[1],bridge.id),state={x:p[0],z:p[2],y:top.height,surfaceId:bridge.id,heading};
  const valid=!!adapter.validate(state,state,false);
  results.push({name,stationMeters:original.stationsMeters[i],longitudeLatitude:projection.inverse(p[0],p[2]),world:{x:p[0],z:p[2]},bridgeId:bridge.id,roadIds:surface.getRoadTriangles().features.get(top.surfaceId).roadIds,surfaceId:top.surfaceId,layerId:top.layerId,chunkId:points[4].chunkId,points,valid,failureClass:points.some(p=>!p.visualTop)?'A-visual':points.some(p=>!p.canonicalTop)?'B-surface':!valid?'C-policy/collision':null,rejection:valid?null:adapter.lastRejected});
}
const report={id:'wuhan-phase6.1-yangtze-first-approach-regression',datasetId:pack.manifest.datasetId,result:results.every(r=>!r.failureClass)?'PASS':'FAIL',localization:'Reproducible west approach corridor identified from bridge and Guishan landmarks. The supplied screenshots contain no saved camera/rider state, so these are fixed geographic regression points, not an asserted exact reconstruction of the original pixels.',scope:'Nine actual footprint vertices at each point; visual and CPU array identity; static movement rules. Complete ground-to-ground browser riding is a separate required report.',results};
await writeFile('docs/wuhan-phase61-yangtze-first-approach-regression.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.result,'PASS');console.log('PASS first bridge approach start, middle and transition footprint');
