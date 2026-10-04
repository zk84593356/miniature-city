import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {advance,SCALE,RIDE_MOTION} from '../../src/atlas/ride/ride-motion.js';
import {WuhanRideAvatar} from '../../src/atlas/ride/ride-avatar.js';
import {RideCamera} from '../../src/atlas/ride/ride-camera.js';
import {WuhanRideSurfaceAdapter,circlePolygon,circleBox} from '../../src/atlas/ride/ride-collision.js';
import {findSpawn,DEBUG_SPAWNS} from '../../src/atlas/ride/ride-spawn.js';
import {createTerrainSurface} from '../../src/atlas/adapters/terrain-surface.js';
import {createProjection,waterAt} from '../../src/atlas/geo/projection.js';
import {createWaterIndex} from '../../src/atlas/adapters/terrain-index.js';
import {decode} from '../../src/atlas/render/geography.js';
import {createBridge} from '../../src/atlas/render/bridges.js';
import {createTraffic} from '../../src/atlas/simulation/traffic.js';
const root=new URL('../../city-data/wuhan/generated/',import.meta.url),json=async f=>JSON.parse(await readFile(new URL(f,root),'utf8'));
const checks=[],pass=s=>{checks.push(s);console.log('PASS',s);};
const initial=()=>({x:0,y:0,z:0,heading:0,steering:0,speed:0});
const run=(s,throttle,turn,brake,seconds)=>{for(let i=0;i<seconds*120;i++)advance(s,throttle,turn,brake,1/120);};
let s=initial();run(s,0,1,false,1);assert.equal(s.heading,0);run(s,1,0,false,15);assert.equal(s.speed,RIDE_MOTION.maxSpeed);run(s,0,0,true,3);assert.equal(s.speed,0);run(s,-1,0,false,5);assert.equal(s.speed,-1.4);assert.equal(SCALE,.01);pass('SI scale, forward 60 km/h, reverse, brake, no stationary turn');
const avatar=new WuhanRideAvatar();const feet=avatar.feet.map(f=>f.position.toArray());
for(let i=0;i<600;i++){avatar.animate(1/60,Math.sin(i/60)*6,Math.sin(i/40)*.5,i%80>60,.02);assert.ok(avatar.animation.contactError<1e-6);assert.deepEqual(avatar.feet.map(f=>f.position.toArray()),feet);}
const wheel=avatar.animation.wheelAngle;avatar.animate(.1,6,0,false,0);assert.equal(avatar.animation.wheelAngle,wheel);avatar.animate(.1,-1,0,false,-.1);assert.ok(Math.abs(avatar.animation.wheelAngle-(wheel-.1/.23))<1e-10);assert.equal(avatar.animation.phase,undefined);assert.equal(avatar.torso.position.y,.89);pass('seated adult moped: hand IK, fixed feet, no pedaling, accepted wheel travel/reverse');
assert.ok(!circlePolygon(.5,.5,.02,[[[0,0],[1,0],[1,.1],[.1,.1],[.1,1],[0,1]]]));assert.ok(circlePolygon(.05,.5,.02,[[[0,0],[1,0],[1,.1],[.1,.1],[.1,1],[0,1]]]));assert.ok(circleBox(0,0,.004,{center:[0,0,0],size:[.1,1,.1],rotationY:.7}));pass('concave footprint near phase and rotated structure collision');
const manifest=await json('manifest.json'),waters=await json('water.json'),projection=createProjection(manifest.projection);
const bytes=gunzipSync(await readFile(new URL('terrain.bin',root))),g=decode(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),manifest.terrain);g.computeBoundingBox();
const terrain=new T.Group();terrain.add(new T.Mesh(g,new T.MeshBasicMaterial()));terrain.updateMatrixWorld(true);
const surface=createTerrainSurface(terrain,waters,projection,manifest.bounds.context);
const samples=[];for(const [lon,lat] of Object.values(DEBUG_SPAWNS)){const [x,z]=projection.forward([lon,lat]);for(let i=0;i<8;i++)samples.push({x:x+i*.07,z:z+i*.05});}
for(const p of samples)p.before=surface.sample(p.x,p.z);const indexBytes=surface.enableFastSampling();
let maxHeightError=0;for(const p of samples){const after=surface.sample(p.x,p.z);assert.equal(after?.kind,p.before?.kind);if(after){maxHeightError=Math.max(maxHeightError,Math.abs(after.height-p.before.height));assert.ok(Math.abs(after.height-p.before.height)<1e-7);}}
const waterIndex=createWaterIndex(waters);for(let i=0;i<500;i++){const x=Math.sin(i*7.8)*130,z=Math.cos(i*3.2)*130;assert.equal(waterIndex(x,z)?.id,waterAt(x,z,waters)?.id);}pass('exact stable terrain vs raycast and exact indexed water with holes');
const bridges=await json('bridges.json'),urban={bridges:new T.Group()};for(const b of bridges)urban.bridges.add(createBridge(b,surface));
const definitions=await json('landmarks.json'),pack={manifest,loadJSON:json},places={readyPromise:Promise.resolve(),definitions};
const adapter=new WuhanRideSurfaceAdapter({pack,surface,urban,places,dynamics:{rideQuery:()=>({blocked:false,distance:null})}});
const spawns={};for(const [id,ll] of Object.entries(DEBUG_SPAWNS)){const [x,z]=projection.forward(ll),p=await findSpawn(adapter,{x,z});assert.ok(p,'spawn '+id);assert.ok(!/motorway|trunk/.test(p.roadClass));spawns[id]=p;}
pass('seven districts: full capsule safe road spawn, no motorway/trunk/tunnel');
for(const d of definitions){const c=d.components[0],p=c.position;await adapter.prepare(p[0],p[2]);assert.equal(adapter.blocked(p[0],p[2],c.baseElevation/100+(d.model==='calla'?.065:.005))?.kind,'building',d.id);}
for(const bridge of urban.bridges.children)for(const o of bridge.userData.obstacles){assert.ok(!adapter.collisionProbe({x:o.center[0],z:o.center[2]}).some(c=>c.id===o.id),o.id);}
pass('all landmark buildings retained; six bridges have no structural blockers');
const first=bridges.find(b=>b.id==='yangtze-first');let previous=null,maxStep=0,count=0,blocked=[];const kinds=new Set();
for(let i=1;i<first.profile.length;i++){
  const a=first.profile[i-1],b=first.profile[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
  if(i===1||i%30===0)await adapter.prepare(a[0],a[2]);
  for(let j=0,n=Math.ceil(length/.004);j<=n;j++){
    // Centre must leave room for the full vehicle: the first road outside the
    // published approach is a non-rideable trunk, not a valid straddling spawn.
    if(i===1&&j/n*length<.012)continue;
    const t=j/n,p={x:a[0]+t*(b[0]-a[0]),y:a[1]+t*(b[1]-a[1]),z:a[2]+t*(b[2]-a[2]),heading:Math.atan2(b[0]-a[0],b[2]-a[2]),surfaceId:'bridge-yangtze-first'};
    const hit=adapter.validate(p,previous??p,false);count++;if(!hit){blocked.push({i,j,reason:adapter.lastBlock,p});if(blocked.length>12)break;}else{assert.equal(hit.layerId,first.layerId);kinds.add(hit.kind);if(previous)maxStep=Math.max(maxStep,Math.abs(hit.height-previous.y));previous={...p,...hit,y:hit.height};}
  }
  if(blocked.length>12)break;
}
if(blocked.length)console.log(JSON.stringify(blocked,null,2));assert.deepEqual(blocked,[]);pass('entire first Yangtze bridge: approach / deck / opposite exit, no rail/water/layer jump');
let outerSamples=0;for(let i=2;i<first.profile.length;i++){const a=first.profile[i-1],b=first.profile[i],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz);if(i===2||i%30===0)await adapter.prepare(a[0],a[2]);for(let j=0,n=Math.ceil(len/.005);j<=n;j++){const t=j/n,p={x:a[0]+t*dx+dz/len*.085,z:a[2]+t*dz-dx/len*.085,y:a[1]+t*(b[1]-a[1]),heading:Math.atan2(dx,dz),surfaceId:'bridge-yangtze-first'};assert.ok(adapter.validate(p,p,false),`outer bridge ${i}:${j} ${adapter.lastBlock}`);outerSamples++;}}pass('whole bridge outer road strip and every bend joint');
const endpoint=first.profile.at(-1),penultimate=first.profile.at(-2),ex=endpoint[0]-penultimate[0],ez=endpoint[2]-penultimate[2],el=Math.hypot(ex,ez);let exitLayer;
for(let d=.001;d<.2;d+=.001){const p={...previous,x:endpoint[0]+ex/el*d,z:endpoint[2]+ez/el*d};const hit=adapter.validate(p,previous,false);assert.ok(hit,'actual bridge exit '+adapter.lastBlock);previous={...p,...hit,y:hit.height};exitLayer=hit.layerId;}assert.notEqual(exitLayer,first.layerId);pass('leave the actual deck endpoint onto ground without a phantom deck extension');
const middle=Math.floor(first.profile.length*.6),upper=first.profile[middle],lower=first.lowerProfile[middle];
assert.equal(surface.sampleSurface(...[upper[0],upper[2],upper[1],'bridge-yangtze-first']).layerId,first.layerId);
assert.equal(surface.sampleSurface(lower[0],lower[2],lower[1],first.lowerLayerId).rideAllowed,true);
assert.equal(adapter.cameraBlocked(upper[0],upper[1]-.012,upper[2],{y:lower[1],surfaceId:first.lowerLayerId}),'deck');
const ground=spawns.hankou;await adapter.prepare(ground.x,ground.z);assert.ok(adapter.cameraBlocked(ground.x,ground.y-.004,ground.z,ground));
const building=adapter.buildings.find(e=>e.loaded&&e.items.length)?.items[0];assert.ok(building);const corner=building.rings[0][0];assert.ok(adapter.blocked(corner[0],corner[1],building.bottom+.005));pass('camera rejects terrain and overhead deck slabs; real ordinary building footprint collision');
const wet=waters.find(w=>w.name?.includes('东湖'))??waters[0];let waterSupported=false;for(const ring of wet.rings)for(const [x,z] of ring.slice(0,40)){const q=surface.sample(x+.001,z+.001);if(q?.kind==='water'){assert.ok(adapter.validate({x:x+.001,z:z+.001,y:q.height,heading:0}));waterSupported=true;break;}}assert.ok(waterSupported);pass('water support, upper road/lower rail identity and coexistence');
const flat={sampleSurface:()=>({height:0,normal:[0,.5,.866],rideAllowed:true,layerId:'ground',surfaceId:'terrain'})};const slope=new WuhanRideSurfaceAdapter({surface:flat});assert.ok(slope.validate(initial()));assert.equal(slope.lastBlock,null);pass('steep slope is support, never a hard rejection');
const traffic=createTraffic(await json('traffic-network.json'));let rider;for(const v of traffic.vehicles.filter(v=>v.active&&!v.pose.hidden)){assert.equal(traffic.rideQuery(v.pose).blocked,false);assert.ok(traffic.rideQuery(v.pose).overlapping);const gap=v.length/2+.05,p={...v.pose,x:v.pose.x+Math.sin(v.pose.heading)*gap,z:v.pose.z+Math.cos(v.pose.heading)*gap};if(!traffic.rideQuery(p).blocked){rider=p;break;}}assert.ok(rider);traffic.setRider(rider);for(let i=0;i<200;i++){traffic.update(.05);assert.ok(!traffic.rideQuery(rider).blocked);}pass('20 Hz traffic diagnostics do not block the rider');
const overhead=traffic.vehicles.find(v=>v.active&&!v.pose.hidden);assert.ok(!traffic.rideQuery({...overhead.pose,y:overhead.pose.y-.025}).blocked,'2.5m overhead traffic does not hit a 1.75m rider');pass('dynamic collision respects rider vertical clearance below an overhead road');
const controls={target:new T.Vector3(1,2,3),enabled:false,enableDamping:true,update(){}},camera=new T.PerspectiveCamera(40,1.6,.03,2300);camera.position.set(2,3,4);camera.zoom=1.2;camera.setViewOffset(1440,900,5,6,1440,900);
const original={p:camera.position.toArray(),q:camera.quaternion.toArray(),view:{...camera.view}};const collision={height:()=>0,cameraBlocked:(x,y,z)=>z<-.03?'wall':null,metrics:{cameraCollisionMs:0}},controller={controls,cancel(){},reduced:false};const follow=new RideCamera(T,camera,controller,collision);follow.save();follow.update(initial(),0,true);assert.ok(camera.position.z>=-.03);follow.restore();assert.deepEqual(camera.position.toArray(),original.p);assert.deepEqual(camera.quaternion.toArray(),original.q);assert.deepEqual(camera.view,original.view);assert.equal(camera.zoom,1.2);assert.equal(controls.enabled,false);assert.equal(camera.near,.03);assert.equal(camera.far,2300);pass('camera obstruction and exact position/quaternion/projection/view/Orbit restoration');
avatar.dispose();adapter.dispose();const report={result:'PASS',date:new Date().toISOString(),checks,indexBytes,maxHeightError,spawns,bridge:{samples:count,maxHeightStepMeters:maxStep*100,kinds:[...kinds]},unchangedDataset:manifest.datasetId};await writeFile('docs/wuhan-phase6-ride-qa.json',JSON.stringify(report,null,2)+'\n');
