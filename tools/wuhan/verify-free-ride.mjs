import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {WuhanRideSurfaceAdapter} from '../../src/atlas/ride/ride-collision.js';
import {advance,RIDE_MOTION} from '../../src/atlas/ride/ride-motion.js';
import {findSpawn} from '../../src/atlas/ride/ride-spawn.js';
const checks=[];
for(const kind of ['building','tree','shrub','flower','traffic','bridge-pier','bridge-tower','water','road-edge','slope','rail']){
  const terrain=(x,z)=>({height:kind==='water'&&z>.02?.12:kind==='slope'?z*2:0,normal:kind==='slope'?[0,1/Math.sqrt(5),-2/Math.sqrt(5)]:[0,1,0],kind:kind==='water'&&z>.02?'water':'terrain',surfaceId:'test',layerId:'ground',rideAllowed:kind!=='rail'});
  const adapter=new WuhanRideSurfaceAdapter({surface:{sampleSurface:terrain},dynamics:{rideQuery(){throw Error('Ride must not query traffic');}},urban:{vegetation:{blocked(){throw Error('Ride must not query plants');}}}});
  adapter.grid.add({id:kind,source:'test-fixture',kind,center:[0,.1,.08],size:[.1,.2,.0002],bottom:0,top:.2},[-.05,.0799,.05,.0801]);
  adapter.coverageIssue=()=>({source:'building-visual/collision-residency'}); // Missing data must never become an invisible wall.
  const s={x:0,y:0,z:0,heading:0,steering:0,speed:0,surfaceId:'test'};let stopped=false,maxSpeed=0;
  for(let t=0;t<12;t+=1/120){const old={...s};advance(s,1,0,false,1/120);const support=adapter.validate(s,old);if(!support){Object.assign(s,old,{speed:0});stopped=true;break;}Object.assign(s,support,{y:support.height});maxSpeed=Math.max(maxSpeed,s.speed);}
  assert.equal(stopped,kind==='building',kind);
  if(kind==='building'){assert.equal(adapter.lastRejected.blockKind,'building');assert.equal(adapter.lastRejected.buildingId,'building');assert.ok(s.z<.08);}
  else{assert.ok(s.z>.08,kind);assert.equal(maxSpeed,RIDE_MOTION.maxSpeed);assert.equal(adapter.lastBlock,null);}
  checks.push({kind,result:'PASS',stopped,distanceMeters:s.z*100,maxSpeedKmh:maxSpeed*3.6});
}
const a=new WuhanRideSurfaceAdapter({surface:{sampleSurface:()=>null}}),s={x:0,y:0,z:0,heading:0};assert.equal(a.validate(s),null);assert.equal(a.lastBlock,'dataset-end');assert.equal(a.validate({...s,x:NaN}),null);assert.equal(a.lastBlock,'fatal-invalid-state');
for(const kind of ['terrain','water']){
 const support={kind,height:.3,normal:[0,1,0],surfaceId:kind,layerId:kind,rideAllowed:true};
 const spawn=await findSpawn({prepare:async()=>{},roads:[],surface:{getSurfaces:()=>[]},sample:()=>support,validate:()=>support},{x:3,z:4});
 assert.equal(spawn.kind,kind);assert.equal(spawn.x,3);assert.equal(spawn.z,4);
}
await writeFile('docs/wuhan-free-collision-qa.json',JSON.stringify({result:'PASS',policy:'Only buildings hard-block; dataset-end and fatal-invalid-state are exceptional guards.',checks},null,2)+'\n');console.log('PASS all 11 sustained-throttle building/pass-through cases');
