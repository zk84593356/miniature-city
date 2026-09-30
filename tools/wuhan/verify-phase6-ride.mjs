import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {fixture,firstBridgeRoute} from './phase6-fixture.mjs';
import {advance,RIDE_MOTION} from '../../src/atlas/ride/ride-motion.js';
import {WuhanRideSurfaceAdapter} from '../../src/atlas/ride/ride-collision.js';
const {adapter,surface,pack}=await fixture(),route=await firstBridgeRoute(),runs=[];
for(const reverse of [false,true]){
 const path=reverse?[...route.path].reverse():route.path;let previous=null,count=0,lastPrepare=null,maxStep=0,failed=[];
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);if(!length)continue;
  if(!lastPrepare||Math.hypot(a[0]-lastPrepare[0],a[2]-lastPrepare[2])>3){await adapter.prepare(a[0],a[2]);lastPrepare=a;}
  for(let j=0,n=Math.ceil(length/.005);j<=n;j++){
   const t=j/n,p={x:a[0]+dx*t,z:a[2]+dz*t,y:a[1]+(b[1]-a[1])*t,heading:Math.atan2(dx,dz)};
   const expected=surface.getRoadTriangles().candidates(p.x,p.z).filter(c=>c.rideAllowed).sort((a,b)=>Math.abs(a.height-p.y)-Math.abs(b.height-p.y))[0];
   if(expected){p.y=expected.height;p.surfaceId=expected.surfaceId;}
   const hit=adapter.validate(p,previous??p,false);count++;
   if(!hit){failed.push({i,j,p,reason:adapter.lastBlock,previous});if(failed.length===10)break;}
   else{if(previous)maxStep=Math.max(maxStep,Math.abs(hit.height-previous.y)*100);previous={...p,...hit,y:hit.height};}
  }
  if(failed.length===10)break;
 }
 runs.push({reverse,count,maxStepMeters:maxStep,failed});console.log(JSON.stringify({...runs.at(-1),failed:failed.slice(0,2)}));
}
const speedChecks=[];for(const kmh of [10,25,40,60]){
 const speed=kmh/3.6,s={x:0,z:0,speed,heading:0,steering:0};let maximumTravel=0;
 for(let t=0;t<1;){const dt=Math.min(1/120,RIDE_MOTION.maxStepMeters/(Math.abs(s.speed)+RIDE_MOTION.acceleration/120)),a={...s};advance(s,0,0,false,dt);maximumTravel=Math.max(maximumTravel,Math.hypot(s.x-a.x,s.z-a.z)*100);t+=dt;}
 assert.ok(maximumTravel<=.100001);speedChecks.push({kmh,maximumTravelMeters:maximumTravel});
}
const collisionChecks=[];
for(const kmh of [10,25,40,60])for(const kind of ['building','tower','tree','traffic']){
 const top={height:0,normal:[0,1,0],surfaceId:'test-road',layerId:'ground',rideAllowed:true};
 const a=new WuhanRideSurfaceAdapter({surface:{sampleSurface:()=>top},urban:{vegetation:{blocked(x,z,y,r){return kind==='tree'&&Math.hypot(x,z-.02)<r+.0018?{kind:'tree'}:null;}}},dynamics:{rideQuery(s){return {blocked:kind==='traffic'&&Math.abs(s.z-.06)<.025+.0058&&Math.abs(s.x)<.009+.0044};}}});
 a.covered=()=>true;
 if(kind==='building'||kind==='tower')a.grid.add({kind,center:[0,.01,.02],size:[.03,.02,.0002],rotationY:kind==='tower'?.4:0,bottom:0,top:.02},[-.03,0,.03,.04]);
 const state={x:0,y:0,z:0,heading:0,steering:0,speed:kmh/3.6,surfaceId:'test-road'};let stopped=false,maxTravel=0;
 assert.ok(a.validate(state,state),'collision scenario starts outside every obstacle');
 // Deliberately coarse 80ms input frames; the 2cm wall must never be crossed.
 for(let frame=0;frame<100&&!stopped;frame++)for(let remaining=.08;remaining>1e-8;){
  const dt=Math.min(remaining,1/120,RIDE_MOTION.maxStepMeters/(state.speed+RIDE_MOTION.acceleration/120));remaining-=dt;
  const before={...state};advance(state,0,0,false,dt);maxTravel=Math.max(maxTravel,Math.hypot(state.x-before.x,state.z-before.z)*100);
  if(!a.validate(state,before)){Object.assign(state,before,{speed:0});stopped=true;break;}
 }
 if(kind==='tree'){assert.equal(stopped,false,'vegetation is visual-only');assert.ok(state.z>.02);assert.notEqual(a.lastBlock,'tree');}else{assert.ok(stopped,`${kmh} km/h ${kind} collision`);assert.equal(a.lastBlock,kind);assert.ok(state.z<(kind==='traffic'?.06:.02));}assert.ok(maxTravel<=.100001);collisionChecks.push({kmh,kind,stopped,maxTravelMeters:maxTravel,acceptedPosition:state.z*100});
}
const report={result:runs.every(r=>!r.failed.length)?'PASS':'FAIL',datasetId:pack.manifest.datasetId,route:route.roadIds,sourceJoin:route.sourceJoin,runs,speedChecks,collisionChecks,collisionScope:'Runtime footprint adapter against thin static boxes, vegetation pass-through, and oriented-lane vehicle extent; live traffic separately tested in browser.'};
await writeFile('docs/wuhan-phase61-bridge-ride-qa.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.result,'PASS');
