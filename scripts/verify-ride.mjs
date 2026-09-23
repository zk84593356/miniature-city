import assert from 'node:assert/strict';
import { advance } from '../public-overlay/ride/ride-motion.js';
import { RideCollision } from '../public-overlay/ride/ride-collision.js';
const state = () => ({x:0,z:0,heading:0,speed:0,steering:0});
const step = (s, t, turn=0, brake=false, seconds=1, dt=1/120) => { for(let i=0;i<Math.round(seconds/dt);i++) advance(s,t,turn,brake,dt); };
let s=state(); step(s,0,1); assert.equal(s.heading,0,'stationary bicycle cannot rotate');
step(s,1,0,false,8); assert.equal(s.speed,9,'speed cap');
step(s,0,0,true,2); assert.equal(s.speed,0,'brake must stop');
step(s,-1,0,false,3); assert.equal(s.speed,-2,'bounded reverse');
const a=state(), b=state(); step(a,1,0,false,3,1/60); step(b,1,0,false,3,1/120); assert.ok(Math.abs(a.z-b.z)<.002,'frame-rate independent motion');
step(a,0,1,false,.3); assert.ok(a.heading>0,'left steering'); step(b,0,-1,false,.3); assert.ok(b.heading<0,'right steering');
step(b,0,0,false,30); assert.equal(b.speed,0,'natural drag');
function mesh(y,name='city-terrain') { const vertices=[[0,y,0],[2,y+1,0],[0,y,2]]; return {name,geometry:{attributes:{position:{count:3,getX:i=>vertices[i][0],getY:i=>vertices[i][1],getZ:i=>vertices[i][2]}}}}; }
const collision = new RideCollision({ ground:[mesh(1),mesh(2,'road')], geo:{height:()=>1,isCity:(x,z)=>x>=0&&z>=0&&x+z<=2,isLand:()=>true}, placement:{chunks:[['0,0',[{x:.5,z:.5,y:1,h:2,w:.2,d:.2,angle:0}]]]}, buildings:[], landmarks:[], project:()=>[],excluded:()=>false });
assert.ok(Math.abs(collision.height(.4,.2,1.2)-1.2)<1e-10,'exact triangle slope');
assert.ok(Math.abs(collision.height(.4,.2,2.2)-2.2)<1e-10,'bridge deck');
assert.ok(Math.abs(collision.height(.4,.2,1.2)-1.2)<1e-10,'no snapping onto overhead bridge');
assert.equal(collision.height(5,5),-Infinity,'outside mesh');
assert.ok(collision.blocked(.5,.5,1),'building collision');
assert.ok(collision.blocked(.615,.5,1),'radius at cell edge');
assert.ok(!collision.blocked(.7,.5,1),'clear road');
assert.ok(!collision.blocked(.5,.5,4),'above roof');
assert.ok(!collision.valid(5,5,1),'city boundary');
console.log('PASS ride: stationary steering, speed cap, reverse, braking, drag, frame-rate independence, triangle slopes, bridge layer, building radius and city boundary');

// Use the exact Three primitives embedded in the preserved city runtime. No npm
// dependency, browser globals, renderer, or edits to the baseline are required.
const { readFileSync, readdirSync } = await import('node:fs');
const { runInNewContext } = await import('node:vm');
const { RideAvatar } = await import('../public-overlay/ride/ride-avatar.js');
const { RideCamera } = await import('../public-overlay/ride/ride-camera.js');
const { solveLimb, PosedRideAnimation } = await import('../public-overlay/ride/ride-animation.js');
const source = readFileSync(new URL('../site/assets/index-zfVzkv9E.js', import.meta.url), 'utf8');
const engineEnd = source.indexOf('class Kd');
assert.ok(engineEnd > 0, 'preserved Three boundary');
const T = runInNewContext(source.slice(0, engineEnd) + ';({Group:Xe,Vector3:R,Mesh:wt,Material:ct,Box:qt,Cylinder:rn,Sphere:Zn,Torus:ur,Camera:mn})', {
  console, document: { createElement: () => ({ relList: { supports: () => true } }) }
});
const vec = (...args) => new T.Vector3(...args);
const close = (actual, expected, message, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} vs ${expected}`);
const low = {...state(),speed:2}, high = {...state(),speed:9};
step(low,0,1,false,.2); step(high,1,1,false,.2);
assert.ok(Math.abs(high.steering) < Math.abs(low.steering), 'speed reduces steering sensitivity');
const fast30 = state(), fast120 = state();
step(fast30,1,.6,false,4,1/30); step(fast120,1,.6,false,4,1/120);
assert.ok(Math.hypot(fast30.x-fast120.x,fast30.z-fast120.z)<.03,'turns remain stable across frame rates');
step(high,1,0,false,2); assert.ok(Math.abs(high.steering)<.001,'steering recenters');
const water = Object.create(collision); water.geo = {...collision.geo, isLand:()=>false};
assert.ok(!water.valid(.2,.2,1.1),'water cannot be entered');
assert.ok(collision.spawn(vec(.2,1,.2),[{points:[[.1,.1],[.3,.1]]}]),'safe road spawn');
assert.equal(water.spawn(vec(.2,1,.2),[{points:[[.1,.1],[.3,.1]]}]),null,'no water spawn');

const avatar = new RideAvatar(T);
for (let i=0;i<240;i++) {
  avatar.animate(1/60, 8, Math.sin(i/30)*.25, i>180, 8/60);
  assert.ok(avatar.animation.contactError<1e-6,'fallback hands and feet stay at contacts');
}
const angle = avatar.animation.wheelAngle, phase = avatar.animation.phase;
avatar.animate(.08,9,.2,false,0);
close(avatar.animation.wheelAngle,angle,'blocked displacement never spins wheels');
close(avatar.animation.phase,phase,'blocked displacement never pedals');
avatar.animate(.1,-2,0,false,-.2);
close(avatar.animation.wheelAngle,angle-.2/.355,'reverse wheel distance');
close(avatar.animation.phase,phase-.2/1.02,'reverse crank distance');
const legA=avatar.legs[0].pedal.position,legB=avatar.legs[1].pedal.position;
close(legA.y+legB.y,.74,'opposed pedals'); close(legA.z+legB.z,-.1,'opposed cranks');
const root=vec(0,0,0), joint=vec(),end=vec();
for(const target of [vec(),vec(0,10,0),vec(0,.5,0)]) {
  solveLimb(root,target,.4,.3,vec(0,1,0),joint,end);
  close(root.distanceTo(joint),.4,'IK upper length'); close(joint.distanceTo(end),.3,'IK lower length');
}
const failed = new RideAvatar(T,{url:'./missing.glb',loadScene:async()=>{throw Error('404');}});
assert.equal(await failed.ready,false); assert.equal(failed.modelStatus,'fallback'); assert.ok(failed.body.visible);
failed.animate(.016,2,.1,false,.032); failed.dispose();
const malformed = new RideAvatar(T,{url:'./invalid.glb',loadScene:async()=>new T.Group()});
assert.equal(await malformed.ready,false); assert.ok(malformed.body.visible); malformed.dispose();
let resolveLate;
const timed = new RideAvatar(T,{url:'./slow.glb',timeoutMs:5,loadScene:()=>new Promise(r=>resolveLate=r)});
assert.equal(await timed.ready,false); resolveLate(new T.Group()); await Promise.resolve();
assert.equal(timed.modelStatus,'fallback'); timed.dispose();

function cameraHarness(obstacles={blocked:()=>false,height:()=>0}) {
  const camera=new T.Camera(40,1.6,.04,7500); camera.position.set(1,2,3);
  camera.setViewOffset(1280,800,20,-10,1280,800);
  const controls={target:vec(.1,.2,.3),enabled:true,enableDamping:true,update(){}};
  const controller={controls,cancel(){this.cancelled=true;},reduced:false};
  const follow=new RideCamera(T,camera,controller,obstacles);
  return {camera,controls,controller,follow};
}
const cam=cameraHarness(), saved={pos:cam.camera.position.clone(),q:cam.camera.quaternion.clone(),view:{...cam.camera.view}};
cam.follow.save(); cam.follow.update({...state(),y:0},0,true);
assert.ok(cam.controls.target.z>=4.8*.04,'look ahead clearly exceeds old 1m target');
assert.ok(cam.camera.position.z<0 && cam.camera.position.y>0,'rear upper camera');
const idleDistance=cam.camera.position.distanceTo(vec()),idleFov=cam.camera.fov;
for(let i=0;i<240;i++)cam.follow.update({...state(),y:0,speed:9,steering:.2},1/60);
assert.ok(cam.camera.position.distanceTo(vec())>idleDistance,'pace extends boom');
assert.ok(cam.camera.fov>idleFov && cam.camera.fov<=60,'small speed FOV');
assert.ok(cam.follow.swing>.1,'turn swings camera');
for(let i=0;i<240;i++)cam.follow.update({...state(),y:0},1/60);
assert.ok(Math.abs(cam.follow.swing)<.001,'swing returns smoothly');
cam.follow.drag(100); cam.follow.dragging=true;
cam.follow.update({...state(),y:0},.016); close(cam.follow.offset,-.6,'drag preserved');
cam.follow.dragging=false;
for(let i=0;i<240;i++)cam.follow.update({...state(),y:0},1/60);
assert.ok(Math.abs(cam.follow.offset)<.001,'drag returns');
cam.follow.heading=Math.PI-.01;
cam.follow.update({...state(),y:0,heading:-Math.PI+.01},1/60);
assert.ok(Math.abs(cam.follow.heading-Math.PI)<.02,'heading wraps shortest way');
cam.follow.restore();
close(cam.camera.position.distanceTo(saved.pos),0,'restore camera position');
close(cam.camera.quaternion.angleTo(saved.q),0,'restore orientation');
assert.deepEqual({...cam.camera.view},saved.view); close(cam.camera.fov,40,'restore FOV'); close(cam.camera.near,.04,'restore near');
assert.ok(cam.controls.enabled && cam.controls.enableDamping,'restore orbit controls');
const wall={blocked:(x,z)=>z<-.10&&z>-.18,height:()=>0}, occluded=cameraHarness(wall);
occluded.follow.save(); occluded.follow.update({...state(),y:0},0,true);
assert.ok(occluded.camera.position.z>=-.10,'boom retracts before wall');
occluded.camera.position.set(0,.1,-.14);
occluded.follow.update({...state(),y:0},.016);
assert.ok(!wall.blocked(occluded.camera.position.x,occluded.camera.position.z),'post-damping wall check');
const hill=cameraHarness({blocked:()=>false,height:(x,z)=>z<-.04?.11:0});
hill.follow.save(); hill.follow.update({...state(),y:0},0,true);
assert.ok(hill.camera.position.z>=-.04 || hill.camera.position.y>=.135,'ground clearance');
const reduced=cameraHarness(); reduced.controller.reduced=true; reduced.follow.save();
for(let i=0;i<60;i++)reduced.follow.update({...state(),y:0,speed:9,steering:.4},1/60);
close(reduced.follow.swing,0,'reduced motion swing'); close(reduced.camera.fov,57,'reduced motion FOV');
avatar.dispose();
for(const file of readdirSync(new URL('../public-overlay/ride/',import.meta.url))) {
  if(file.endsWith('.js')) assert.ok(!/requestAnimationFrame|setInterval/.test(readFileSync(new URL('../public-overlay/ride/'+file,import.meta.url),'utf8')),'ride must use city render loop');
  assert.ok(!/\.glb$/i.test(file),'no unlicensed GLBs in public overlay');
}
console.log('PASS ride upgrade: speed response, water/spawn, distance animation, limbs/contact IK, failed/invalid/late model fallback, forward road camera, pace/FOV/swing/drag, wall/ground clearance, full camera restoration, one render loop');

// Synthetic named rig: exercise parent-space IK and model swapping without
// copying unlicensed geometry. Deformed GLB appearance still needs licensed QA.
function posedFixture() {
  const scene=new T.Group();
  const add=(name,parent,position,bone=false)=>{
    scene.updateMatrixWorld(true);
    const node=new T.Group(); node.name=name; if(bone)node.isBone=true;
    node.position.copy(parent.worldToLocal(vec(...position))); parent.add(node); return node;
  };
  const body=add('RiderBody',scene,[0,0,0]),bike=add('FittedBicycle',scene,[0,0,0]);
  const torso=add('torso',body,[0,1.01,-.22],true),neck=add('neck',torso,[0,1.5,.03],true);
  add('head',neck,[0,1.65,.1],true);
  const fork=add('front-steering-assembly',bike,[0,.355,.58]);
  add('rear-wheel',bike,[0,.355,-.58]); add('front-wheel',fork,[0,.355,.58]);
  for(const [i,side] of ['L','R'].entries()) {
    const sign=i?1:-1;
    add('handlebar-grip:'+sign,fork,[sign*.28,1.08,.46]);
    add('pedal-'+side,bike,[sign*.16,.37,-.05+(i?-.16:.16)]);
    const crank=new T.Mesh(new T.Box(.03,.16,.03),new T.Material()); crank.name='crank-'+side; bike.add(crank);
    const arm=add('arm_'+side,torso,[sign*.13,1.48,.03],true);
    const elbow=add('forearm_'+side,arm,[sign*.4,1.23,.2],true);
    add('hand_'+side,elbow,[sign*.28,1.08,.46],true);
    const thigh=add('thigh_'+side,body,[sign*.13,1.01,-.22],true);
    const knee=add('shin_'+side,thigh,[sign*.16,.75,.26],true);
    add('shoe_'+side,knee,[sign*.16,.435,-.05+(i?-.16:.16)],true);
  }
  const skin=new T.Group(); skin.isSkinnedMesh=true; skin.skeleton={update(){},dispose(){}};body.add(skin);
  return scene;
}
const posedScene=posedFixture(),posed=new PosedRideAnimation(T,posedScene);
for(let i=0;i<180;i++) {
  posed.update(1/60,5,Math.sin(i/30)*.18,false,5/60);
  assert.ok(posed.contactError<.002,'posed bones retain reachable contacts');
  for(const side of ['L','R']) {
    const actual=posed.point(posed.body,posedScene.getObjectByName('shoe_'+side));
    const expected=posed.point(posed.body,posed.pedals[side==='L'?0:1]).add(posed.soleOffsets[side==='L'?0:1]);
    close(actual.distanceTo(expected),0,'posed foot world contact',.002);
  }
}
const loadedAvatar=new RideAvatar(T,{url:'./synthetic.glb',loadScene:async()=>posedFixture()});
assert.ok(await loadedAvatar.ready); assert.equal(loadedAvatar.modelStatus,'posed'); assert.equal(loadedAvatar.body.visible,false);
loadedAvatar.animate(.016,4,.1,false,.064);
loadedAvatar.modelAnimation.update=()=>{throw Error('invalid animation');};
loadedAvatar.animate(.016,4,.1,false,.064);
assert.ok(loadedAvatar.body.visible); assert.equal(loadedAvatar.modelStatus,'fallback');loadedAvatar.dispose();
let resolveDisposed;
const disposedAvatar=new RideAvatar(T,{url:'./disposed.glb',loadScene:()=>new Promise(resolve=>resolveDisposed=resolve)});
await Promise.resolve(); disposedAvatar.dispose(); resolveDisposed(posedFixture());
assert.equal(await disposedAvatar.ready,false);assert.equal(disposedAvatar.root.children.some(node=>node===disposedAvatar.modelRoot),false);
const curb=cameraHarness({blocked:()=>false,height:(x,z)=>z<-.01?.05:0});
curb.follow.save();curb.follow.update({...state(),y:0},0,true,.045);
assert.ok(curb.camera.position.z<-.20,'visual wheel support keeps boom above road edge');
console.log('PASS optional posed adapter: named hierarchy, bone contacts, model swap, animation failure and disposal race; road-edge camera support');
