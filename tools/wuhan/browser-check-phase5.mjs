import assert from 'node:assert/strict';
import http from 'node:http';import path from 'node:path';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';import os from 'node:os';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),dev=process.argv.includes('--dev'),quick=process.argv.includes('--quick'),mobileOnly=process.argv.includes('--mobile-only');
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u.startsWith('/nested/example/'))u=u.slice('/nested/example'.length);if(u.endsWith('/'))u+='index.html';let file=path.resolve(root,'.'+decodeURIComponent(u));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(dev&&u.startsWith('/atlas/'))file=path.resolve('src'+u);if(dev&&u==='/vendor/three/addons/utils/BufferGeometryUtils.js')file=path.resolve('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(4199,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});
await mkdir('probe/wuhan',{recursive:true});const checks=[],views=[],issues=[];let bridgeRun=null,cycles=null;
const pass=x=>{checks.push(x);console.log('PASS',x);};
async function prepare(options={},prefix='/'){
 const page=await browser.newPage({viewport:{width:1440,height:900},...options});page.on('pageerror',e=>issues.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))issues.push(r.status()+' '+r.url());});
 await page.addInitScript(()=>{const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),pending=new Set();window.requestAnimationFrame=fn=>{let id=request(t=>{pending.delete(id);fn(t);});pending.add(id);return id;};window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};window.__rafPending=()=>pending.size;});
 await page.goto(`http://127.0.0.1:4199${prefix}wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().dynamics.ready&&window.__wuhan.getState().placesReady,null,{timeout:120000});return page;
}
const state=page=>page.evaluate(()=>window.__wuhan.getRideState());
async function spawn(page,id){assert.ok(await page.evaluate(id=>window.__wuhan.rideDebugSpawn('wuhan-ride-'+id),id),'spawn '+id);await page.waitForTimeout(1300);}
async function capture(page,name){await page.evaluate(()=>window.__wuhan.resetFrameStats());await page.waitForTimeout(3100);const metrics=await page.evaluate(()=>window.__wuhan.getState()),ride=await state(page);assert.equal(metrics.rendererCount,1);assert.equal(metrics.mainLoopCount,1);assert.equal(await page.evaluate(()=>window.__rafPending()),1);assert.ok(ride.contactError<1e-6);await page.screenshot({path:`probe/wuhan/phase5-${name}.png`});views.push({name,metrics,ride});console.log('VIEW',name,metrics.p95FrameMs,ride.meanMetrics?.rideUpdateMs);}
try{
 if(!mobileOnly){
 const page=await prepare();await spawn(page,'hankou');await capture(page,'hankou');
 const start=await state(page);await page.keyboard.down('w');await page.waitForTimeout(1600);await page.keyboard.up('w');const forward=await state(page);assert.ok(forward.travelMeters>1&&forward.state.speed>1&&forward.wheel!==start.wheel);
 await page.keyboard.down('a');await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('a');await page.keyboard.up('w');const turn=await state(page);assert.ok(Math.abs(turn.state.heading-forward.state.heading)>.1);assert.ok(turn.contactError<1e-6);
 await page.keyboard.down('Space');await page.waitForTimeout(1000);await page.keyboard.up('Space');const stopped=await state(page);assert.equal(stopped.state.speed,0);
 await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');assert.equal((await state(page)).state.heading,stopped.state.heading);
 await page.keyboard.down('s');await page.waitForTimeout(800);await page.keyboard.up('s');assert.ok((await state(page)).state.speed<0);await page.keyboard.press('Escape');pass('Hankou keyboard: forward, turn, brake, stationary turn rejection, reverse, Escape');
 await page.evaluate(()=>window.__wuhan.fly('place-yellow-crane',true));await page.waitForTimeout(2000);const cameraBefore=await state(page);assert.ok(await page.evaluate(()=>window.__wuhan.rideEnter()));await page.waitForTimeout(300);await page.keyboard.press('Escape');const cameraAfter=await state(page);
 for(const k of ['camera','cameraQuaternion','cameraTarget'])assert.ok(Math.hypot(...cameraBefore[k].map((v,i)=>v-cameraAfter[k][i]))<1e-8,k);
 for(const k of ['cameraNear','cameraFar','cameraZoom','cameraFov','controlsEnabled'])assert.equal(cameraBefore[k],cameraAfter[k],k);assert.deepEqual(cameraBefore.cameraView,cameraAfter.cameraView);pass('exact saved camera/projection/Orbit restoration');
 await spawn(page,'hankou');for(const view of ['front','side','rear']){await page.evaluate(v=>window.__wuhan.rideDebugView(v),view);await capture(page,'avatar-'+view);}await page.evaluate(()=>window.__wuhan.rideDebugView(null));
 const cityTime=await page.evaluate(()=>window.__wuhan.getState().dynamics.time);await page.waitForTimeout(600);assert.ok(await page.evaluate(t=>window.__wuhan.getState().dynamics.time>t,cityTime));
 for(const light of ['sunset','night','day']){await page.evaluate(v=>window.__wuhan.setLight(v),light);assert.equal((await state(page)).active,true);}
 await page.evaluate(()=>window.__wuhan.setDynamicPaused(true));const frozen=await page.evaluate(()=>window.__wuhan.getState().dynamics.time);await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');assert.ok((await state(page)).state.speed>0);assert.equal(await page.evaluate(()=>window.__wuhan.getState().dynamics.time),frozen);await page.evaluate(()=>window.__wuhan.setDynamicPaused(false));
 await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');assert.ok((await state(page)).state.speed>0);assert.equal((await state(page)).cameraSwing,0);assert.equal((await state(page)).cameraFov,57);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.keyboard.down('w');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(300);assert.equal((await state(page)).state.speed,0);await page.keyboard.up('w');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));pass('all light modes, city dynamics, manual pause, reduced motion and blur reset');
 await page.evaluate(()=>window.__wuhan.selectPlace('yellow-crane'));assert.equal((await state(page)).active,false);await page.waitForTimeout(1800);assert.ok(await page.locator('#place-card').isVisible());pass('place selection safely exits riding');
 if(!quick){
   for(const id of ['wuchang','donghu','luojia','guanggu','guishan','moshan']){await spawn(page,id);await page.keyboard.down('w');await page.waitForTimeout(1400);await page.keyboard.up('w');assert.ok((await state(page)).travelMeters>.1);await capture(page,id);}
   const waters=JSON.parse(await readFile('city-data/wuhan/generated/water.json','utf8'));
   const lake=waters.find(w=>w.id==='water-717');assert.equal(lake.kind,'lake');
   const shore=[];for(let i=1;i<lake.rings[0].length;i++){const a=lake.rings[0][i-1],b=lake.rings[0][i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.015)continue;const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;shore.push({x,z,nx:-dz/len,nz:dx/len,d:Math.hypot(x-43,z+7)});}shore.sort((a,b)=>a.d-b.d);
   let shoreStart=null;
   for(const edge of shore.slice(0,150)){
     const candidate=await page.evaluate(e=>{for(const sign of [-1,1]){const x=e.x+e.nx*.025*sign,z=e.z+e.nz*.025*sign,wet=window.__wuhan.sampleWorld(e.x-e.nx*.025*sign,e.z-e.nz*.025*sign),land=window.__wuhan.sampleWorld(x,z);if(land?.rideAllowed&&land.normal[1]>.94&&wet?.kind==='water')return {x,z,y:land.height,heading:Math.atan2(-e.nx*sign,-e.nz*sign),surfaceId:'terrain'};}return null;},edge);
     if(candidate&&await page.evaluate(s=>window.__wuhan.rideDebugAt(s),candidate)){shoreStart=candidate;break;}
   }
   assert.ok(shoreStart,'safe real East Lake shore fixture');await page.keyboard.down('w');await page.waitForTimeout(3400);const shoreStop=await state(page);assert.equal(shoreStop.state.speed,0);assert.ok(['water','edge'].includes(shoreStop.collision),shoreStop.collision);await page.waitForTimeout(400);assert.equal((await state(page)).wheel,shoreStop.wheel);await page.keyboard.up('w');await capture(page,'donghu-shore-stop');pass('actual East Lake shore: water stop and no wheel spin while blocked');
   await page.evaluate(()=>window.__wuhan.fly('place-yellow-crane',true));await page.waitForTimeout(1000);assert.ok(await page.evaluate(()=>window.__wuhan.rideEnter()));await capture(page,'yellow-crane');
   const landmark=await page.evaluate(()=>window.__wuhan.getLandmarks().find(l=>l.id==='yellow-crane'));const ring=landmark.footprint.coordinates[0];const point=ring[0];const probe=await page.evaluate(p=>window.__wuhan.rideProbe(p),{x:point[0],z:point[1],y:landmark.baseElevation/100,heading:0});assert.equal(probe.valid,false);pass('Yellow Crane footprint blocks riding');
   await spawn(page,'bridge');await capture(page,'bridge-approach');
   const trafficPoses=await page.evaluate(()=>window.__wuhan.getDynamics().vehicles.filter(v=>v.bridge==='yangtze-first').slice(0,8));let trafficBlocked=false;
   for(const car of trafficPoses){await page.evaluate(c=>window.__wuhan.ridePrepare(c.x,c.z),car);const result=await page.evaluate(c=>window.__wuhan.rideProbe({...c,surfaceId:'bridge-yangtze-first'}),car);if(result.collision==='traffic')trafficBlocked=true;}
   assert.ok(trafficBlocked,'live bridge vehicle footprint blocks riding');pass('live bridge traffic collision through local spatial query');
   const definitions=JSON.parse(await readFile('city-data/wuhan/generated/bridges.json','utf8')),bridge=definitions.find(b=>b.id==='yangtze-first');
   const wi=bridge.stationsMeters.findIndex(s=>s>(bridge.waterRange[0]+bridge.waterRange[1])/2),up=bridge.profile[wi],rail=bridge.lowerProfile[wi];
   const layers=await page.evaluate(({up,rail})=>({upper:window.__wuhan.sampleSurface(up[0],up[2],up[1],'bridge-yangtze-first'),rail:window.__wuhan.sampleSurface(rail[0],rail[2],rail[1],'rail-yangtze-first'),below:window.__wuhan.sampleWorld(up[0],up[2])}),{up,rail});assert.equal(layers.upper.layerId,'bridge-yangtze-first');assert.equal(layers.rail.rideAllowed,false);assert.equal(layers.below.kind,'water');pass('browser upper road / lower rail / river coexist without layer teleport');
   // Test-only pure pursuit supplies ordinary throttle/turn to the same controller.
   // No position writes, surface overrides, or rail/water exceptions. Simulated time
   // is accelerated in bounded batches, with rendering and async streaming between.
   // The published approach joins the DSM along its centreline. Merge smoothly
   // in its final 100m: its outer edge can have a real, correctly blocked step.
   await page.evaluate(b=>{window.__ridePath=b.profile.map((p,i,all)=>{const a=all[Math.max(0,i-1)],c=all[Math.min(all.length-1,i+1)],dx=c[0]-a[0],dz=c[2]-a[2],len=Math.hypot(dx,dz),offset=.085*Math.min(1,(b.stationsMeters.at(-1)-b.stationsMeters[i])/100);return [p[0]+dz/len*offset,p[1],p[2]-dx/len*offset];});const p=window.__ridePath.at(-1),a=b.profile.at(-2),dx=p[0]-a[0],dz=p[2]-a[2],len=Math.hypot(dx,dz);window.__ridePath.push([p[0]+dx/len*.18,p[1],p[2]+dz/len*.18]);window.__rideCursor=1;window.__rideCross={minY:Infinity,maxY:-Infinity,samples:0,blocked:{},layers:[],travel:0};},bridge);
   for(let batch=0;batch<150;batch++){
     const p=(await state(page)).state;await page.evaluate(p=>window.__wuhan.ridePrepare(p.x,p.z),p);
     const progress=await page.evaluate(()=>{
       const path=window.__ridePath,r=window.__rideCross;
       for(let frame=0;frame<360;frame++){
         const old=window.__wuhan.getRideState(),s=old.state;
         while(window.__rideCursor<path.length-1&&Math.hypot(path[window.__rideCursor][0]-s.x,path[window.__rideCursor][2]-s.z)<.10)window.__rideCursor++;
         const target=path[window.__rideCursor],distance=Math.hypot(target[0]-s.x,target[2]-s.z);
         if(window.__rideCursor===path.length-1&&distance<.025)return {done:true,...r};
         const desired=Math.atan2(target[0]-s.x,target[2]-s.z),error=Math.atan2(Math.sin(desired-s.heading),Math.cos(desired-s.heading));
         const steer=Math.atan2(2*.0116*Math.sin(error),Math.max(.035,distance)),limit=.5/(1+Math.abs(s.speed)/(25/3.6)*1.7);
         const out=window.__wuhan.rideStep(1/60,{throttle:1,turn:Math.max(-1,Math.min(1,steer/limit)),brake:false});
         if(out.collision)r.blocked[out.collision]=(r.blocked[out.collision]??0)+1;
         if(!r.layers.includes(out.state.layerId))r.layers.push(out.state.layerId);
         r.minY=Math.min(r.minY,out.state.y);r.maxY=Math.max(r.maxY,out.state.y);r.samples++;r.travel=out.travelMeters;
       }
       return {done:false,cursor:window.__rideCursor,...r};
     });
     if(batch%20===0){console.log('BRIDGE',batch,progress.cursor,progress.travel,progress.blocked);await page.screenshot({path:`probe/wuhan/phase5-bridge-progress-${batch}.png`});}
     if(batch===55){await capture(page,'bridge-middle');await page.evaluate(()=>window.__wuhan.setLight('night'));await capture(page,'bridge-night');await page.evaluate(()=>window.__wuhan.setLight('day'));}
     if(progress.done){bridgeRun=progress;break;}
     assert.ok(!(batch>15&&progress.travel<20),'bridge motion stalled');
   }
   assert.ok(bridgeRun?.done,'complete bridge crossing within simulation budget');assert.equal(bridgeRun.layers[0],'bridge-yangtze-first');assert.ok(!bridgeRun.layers.some(id=>id.includes('rail')||id.includes('water')));assert.notEqual((await state(page)).state.layerId,'bridge-yangtze-first');assert.ok(bridgeRun.travel>3400);await capture(page,'bridge-exit');pass('full first Yangtze bridge kinematic crossing with live traffic and streaming, then ground exit');
 }
 await spawn(page,'hankou');await page.waitForTimeout(5000);await page.evaluate(()=>window.__wuhan.rideExit());
 const session=await page.context().newCDPSession(page);await session.send('HeapProfiler.collectGarbage');const before=await session.send('Memory.getDOMCounters'),heapBefore=await session.send('Runtime.getHeapUsage');const resources=[];
 for(let i=0;i<20;i++){assert.ok(await page.evaluate(()=>window.__wuhan.rideEnter()));await page.waitForTimeout(30);await page.evaluate(()=>window.__wuhan.rideExit());resources.push(await page.evaluate(()=>({dom:document.querySelectorAll('*').length,geometries:window.__wuhan.getState().geometries,avatar:window.__wuhan.getRideState().avatarResources})));}
 await session.send('HeapProfiler.collectGarbage');const after=await session.send('Memory.getDOMCounters'),heapAfter=await session.send('Runtime.getHeapUsage');console.log('LIFECYCLE',JSON.stringify({before,after,heapDeltaBytes:heapAfter.usedSize-heapBefore.usedSize,cityGeometries:[resources[0].geometries,resources.at(-1).geometries]}));assert.equal(after.jsEventListeners,before.jsEventListeners);assert.ok(after.nodes<=before.nodes,'DOM nodes do not grow after GC');assert.equal(new Set(resources.map(r=>r.dom)).size,1);assert.ok(heapAfter.usedSize-heapBefore.usedSize<3*1024*1024,'bounded post-GC heap after 20 cycles');for(const resource of resources)assert.deepEqual(resource.avatar,resources[0].avatar,'same avatar geometry and material identities');assert.ok(resources[0].avatar?.materials.length>0);cycles={before,after,heapBefore,heapAfter,resources,geometryScope:'Ride geometry/material identities; total scene counts include independent city streaming'};pass('20 enter/exit cycles: stable listeners, DOM, geometry, materials and post-GC heap');
 await page.evaluate(()=>window.__wuhan.dispose());assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>window.__rafPending()),0);await page.close();
 }
 if(!quick){const mobile=await prepare({viewport:{width:390,height:844},isMobile:true,hasTouch:true},'/nested/example/');await spawn(mobile,'hankou');const box=await mobile.locator('[data-key="KeyW"]').boundingBox();const left=await mobile.locator('[data-key="KeyA"]').boundingBox(),light=await mobile.locator('[data-light="day"]').boundingBox();assert.ok(box.x>280&&left.x<30,'touch controls occupy opposite screen sides');if(light)assert.ok(box.y+box.height<=light.y,'touch controls do not cover light switch');await mobile.mouse.move(box.x+box.width/2,box.y+box.height/2);await mobile.mouse.down();await mobile.waitForTimeout(600);await mobile.mouse.up();assert.ok((await state(mobile)).travelMeters>.05);assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await capture(mobile,'mobile');await mobile.close();pass('nested deployment and mobile touch throttle');}
 assert.deepEqual(issues,[]);const report={result:'PASS',date:new Date().toISOString(),checks,views,bridgeRun,cycles,issues,physicalMobileTested:false,acceleratedBridgeSimulation:!quick&&!mobileOnly};await writeFile(mobileOnly?'docs/wuhan-phase5-mobile-qa.json':quick?'probe/wuhan/phase5-quick.json':'docs/wuhan-phase5-browser-qa.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
