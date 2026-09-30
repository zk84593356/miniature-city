import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {fixture} from './phase6-fixture.mjs';
import {DEBUG_SPAWNS} from '../../src/atlas/ride/ride-spawn.js';
import {BODY} from '../../src/atlas/ride/ride-collision.js';
const {adapter,surface,projection,pack}=await fixture();
let seed=61029;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const regions={...DEBUG_SPAWNS,hanyang:[114.263,30.544],sheshan:[114.298,30.546]},points=[],blocks=[],falsePositives=[];
for(const [region,lonlat] of Object.entries(regions)){
 const center=projection.forward(lonlat);await adapter.prepare(...center);let accepted=0;
 for(let attempt=0;attempt<15000&&accepted<112;attempt++){
  const x=center[0]+(random()-.5)*5,z=center[1]+(random()-.5)*5,ground=surface.sample(x,z);if(!ground?.rideAllowed||ground.normal[1]<Math.cos(BODY.maxSlope))continue;
  const support=surface.sampleSurface(x,z,ground.height,'terrain');if(!support?.rideAllowed||support.kind==='bridge'||Math.abs(support.height-ground.height)>.003)continue;
  if(adapter.blocked(x,z,support.height,BODY.half+BODY.radius))continue;
  const point={region,longitude:projection.inverse(x,z)[0],latitude:projection.inverse(x,z)[1],x,z,surfaceId:support.surfaceId,headings:[]};
  for(let h=0;h<8;h++){
   const heading=h*Math.PI/4,previous={...support,x,z,y:support.height,heading},next={...previous,x:x+Math.sin(heading)*.001,z:z+Math.cos(heading)*.001};
   const hit=adapter.validate(next,previous,false);point.headings.push({heading,pass:!!hit});
   if(!hit){
    const rejection={region,position:next,...adapter.lastRejected};blocks.push(rejection);
    const q=rejection.candidateSurface;
    const legal=['building','landmark','bridge-pier','bridge-tower','bridge-portal','bridge-abutment','water','rail','forbidden-surface','dataset-boundary'].includes(rejection.blockKind)||rejection.blockKind==='slope'&&rejection.slopeDegrees>26||['surface-edge','layer-transition'].includes(rejection.blockKind)&&(q?.kind==='bridge'||previous.kind==='bridge'||Math.abs((q?.height??Infinity)-previous.y)>.003);
    if(!legal)falsePositives.push(rejection);
   }
  }
  points.push(point);accepted++;
 }
 assert.equal(accepted,112,region+' has enough independent clear points');console.log('AIRWALL',region,accepted,'unexpected',falsePositives.length);
}
const report={result:falsePositives.length?'FAIL':'PASS',datasetId:pack.manifest.datasetId,seed:61029,pointCount:points.length,headingCount:points.length*8,airWallFalsePositiveCount:falsePositives.length,scope:'Seeded ordinary land/road points clear of static solids; eight 10 cm movement attempts with the full footprint, independent of camera. Legal shores, forbidden surfaces, deck edges and steep samples are recorded, not counted as clear passage.',points,blocks,falsePositives};
await writeFile('docs/wuhan-phase61-airwall-qa.json',JSON.stringify(report,null,2)+'\n');assert.equal(report.result,'PASS');
