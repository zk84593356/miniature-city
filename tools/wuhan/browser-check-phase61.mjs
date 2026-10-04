import assert from 'node:assert/strict';
import http from 'node:http';import path from 'node:path';import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';
import {bridgeRoutes} from './phase61-routes.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const dev=process.argv.includes('--dev'),root=path.resolve('atlas-site'),port=Number(process.env.WUHAN_QA_PORT??4206),errors=[],runs=[];
const reportPath=process.env.WUHAN_QA_REPORT??(dev?'docs/wuhan-phase61-bridge-development-qa.json':'docs/wuhan-free-bridge-browser-qa.json');
if(process.env.WUHAN_QA_RESUME){const prior=JSON.parse(await readFile(reportPath,'utf8'));runs.push(...prior.runs.filter(r=>r.result==='PASS'));}
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u.endsWith('/'))u+='index.html';let f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(u==='/qa/ride-detour.mjs')f=path.resolve('tools/wuhan/ride-detour.mjs');if(dev&&u.startsWith('/atlas/'))f=path.resolve('src'+u);if(dev&&u==='/cities/wuhan/manifest.json')f=path.resolve('city-data/wuhan/generated/manifest.json');if(dev&&u.startsWith('/data/wuhan/'))f=path.resolve('city-data/wuhan/generated',path.basename(u));try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});await mkdir('probe/wuhan',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().dynamics.ready&&window.__wuhan.getState().placesReady&&window.__wuhan.getState().urban.surfacesReady,null,{timeout:120000});
 const routes=await bridgeRoutes();
 assert.ok(routes.some(r=>!process.env.BRIDGE||process.env.BRIDGE.split(',').includes(r.bridgeId)),'Bridge filter must select at least one route');
 for(const route of routes.filter(r=>!process.env.BRIDGE||process.env.BRIDGE.split(',').includes(r.bridgeId)))for(const kmh of process.env.KMH?[Number(process.env.KMH)]:[25,60])for(const reverse of process.env.ONE_WAY?[false]:[false,true]){
  if(runs.some(r=>r.bridgeId===route.bridgeId&&r.kmh===kmh&&r.direction===(reverse?'B→A':'A→B')))continue;
  const points=reverse?[...route.path].reverse():route.path;
  const initialized=await page.evaluate(async({points,kmh})=>{
   const api=window.__wuhan,a=points[0],b=points[1];window.__rideAdvance=(await import('/atlas/ride/ride-motion.js')).advance;window.__planDetour=(await import('/qa/ride-detour.mjs')).planDetour;await api.ridePrepare(a[0],a[2]);
   const h=api.roadDebugProbe(a[0],a[2]).filter(c=>c.rideAllowed&&c.kind==='road').sort((a,b)=>a.height-b.height)[0];
   if(!h)return {error:'no ordinary road at start'};
   const ok=await api.rideDebugAt({x:a[0],y:h.height,z:a[2],surfaceId:h.surfaceId,heading:Math.atan2(b[0]-a[0],b[2]-a[2])});
   window.__run={points,kmh,cursor:1,surfaces:[h.surfaceId],layers:[h.layerId],maxSpeed:0,startSurfaceId:h.surfaceId,samples:0};return {ok,ride:api.getRideState()};
  },{points,kmh});
  let result={done:false,initialization:initialized},lastTravel=0,stalled=0;
  if(initialized.ok)for(let batch=0;batch<4500;batch++){
   result=await page.evaluate(()=>{
    const api=window.__wuhan,r=window.__run;r.current=api.getRideState().state;
    for(let frame=0;frame<240;frame++){
     const s=r.current??api.getRideState().state,look=Math.max(.025,Math.abs(s.speed)*.005);
     while(r.cursor<r.points.length-1&&Math.hypot(r.points[r.cursor][0]-s.x,r.points[r.cursor][2]-s.z)<look)r.cursor++;
     if(r.needsPlan&&!r.escapeFrames){r.needsPlan=false;const plan=window.__planDetour(api,r);if(plan){r.detourQueue=plan.points;r.detourGoal=plan.goalIndex;r.detour=null;}}
     while(r.detourQueue?.length&&Math.hypot(r.detourQueue[0][0]-s.x,r.detourQueue[0][2]-s.z)<.02)r.detourQueue.shift();
     if(r.detourQueue&&!r.detourQueue.length){r.detourQueue=null;r.cursor=Math.max(r.cursor,r.detourGoal);}
     const target=r.detourQueue?.[0]??r.detour??r.points[r.cursor],distance=Math.hypot(target[0]-s.x,target[2]-s.z);
     if(r.detour&&distance<.015)r.detour=null;
     if(!r.detourQueue&&!r.detour&&r.cursor===r.points.length-1&&distance<.025)return {done:true,...r,points:undefined,detourQueue:undefined,ride:api.getRideState()};
     const error=Math.atan2(Math.sin(Math.atan2(target[0]-s.x,target[2]-s.z)-s.heading),Math.cos(Math.atan2(target[0]-s.x,target[2]-s.z)-s.heading));
     const steer=Math.atan2(2*.0116*Math.sin(error),Math.max(.02,distance)),pace=Math.abs(s.speed)/(60/3.6),limit=.5/(1+pace*pace*9);
     let speed=Math.abs(error)>.9?1.2:Math.abs(error)>.4?1.8:Math.abs(error)>.14?Math.min(4,r.kmh/3.6):r.kmh/3.6;
     // Brake before upcoming corners; a 60 km/h rider needs braking distance,
     // not a last-frame steering command at a hairpin or fork.
     let ahead=distance;for(let i=r.cursor;i<r.points.length-1&&ahead<.55;i++){
       const a=r.points[Math.max(0,i-1)],b=r.points[i],c=r.points[i+1],ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-b[0],vz=c[2]-b[2],den=Math.hypot(ux,uz)*Math.hypot(vx,vz);
       const angle=den?Math.acos(Math.max(-1,Math.min(1,(ux*vx+uz*vz)/den))):0;
       if(angle>.18){const curveSpeed=angle>.65?1.2:4;speed=Math.min(speed,Math.sqrt(curveSpeed*curveSpeed+2*6*Math.max(0,ahead*100-8)));}
       ahead+=Math.hypot(vx,vz);
     }
     const input=r.escapeFrames>0?r.escapeInput:{throttle:s.speed<(r.detourQueue?Math.min(1.8,speed):r.detour?Math.min(3,speed):speed)?1:0,turn:Math.abs(error)>1.2?Math.sign(error):Math.max(-1,Math.min(1,steer/limit)),brake:s.speed>(r.detourQueue?Math.min(1.8,speed):r.detour?Math.min(3,speed):speed)+.2};
     if(r.escapeFrames>0)r.escapeFrames--;
     if(r.reverseFrames>0)r.reverseFrames--;
     const out=api.rideStep(1/60,input,true);r.current=out.state;
     if(out.collision==='traffic'&&!r.escapeFrames){
       // Preview ordinary controls against current real colliders, including
       // steering settling while stopped. Forecasts never write the rider pose.
       let best=null;for(const throttle of [-1,1])for(const turn of [0,-1,1]){
         const p={...out.state};let travel=0;
         for(let i=0;i<240;i++){
           const before={...p};window.__rideAdvance(p,throttle,turn,false,1/120);
           const probe=api.rideProbe(p);
           if(probe.valid){travel+=Math.hypot(p.x-before.x,p.z-before.z);p.y=probe.surface.height;}
           else{p.x=before.x;p.z=before.z;p.heading=before.heading;p.speed=0;}
         }
         if(!best||travel>best.travel)best={travel,input:{throttle,turn,brake:false}};
       }
       if(best.travel>.002){r.escapeInput=best.input;r.escapeFrames=120;}r.needsPlan=true;
       const obstacle=api.rideCollisionProbe().find(o=>o.id===api.getRideState().lastBlockId),away=obstacle?Math.sign((out.state.x-obstacle.center[0])*Math.cos(out.state.heading)-(out.state.z-obstacle.center[2])*Math.sin(out.state.heading))||1:1;
       for(const side of [away,-away]){
         const x=out.state.x+Math.sin(out.state.heading)*.015+Math.cos(out.state.heading)*side*.055,z=out.state.z+Math.cos(out.state.heading)*.015-Math.sin(out.state.heading)*side*.055,h=api.sampleSurface(x,z,out.state.y,out.state.surfaceId);
         if(h?.rideAllowed&&Math.abs(h.height-out.state.y)<.003&&api.rideProbe({...out.state,x,z,y:h.height,surfaceId:h.surfaceId}).valid){r.detour=[x,h.height,z];break;}
       }
       r.trafficManeuvers=(r.trafficManeuvers??0)+1;
     }
     if(r.surfaces.at(-1)!==out.state.surfaceId)r.surfaces.push(out.state.surfaceId);
     if(r.layers.at(-1)!==out.state.layerId)r.layers.push(out.state.layerId);
     r.maxSpeed=Math.max(r.maxSpeed,out.state.speed*3.6);r.samples++;
     if(out.collision&&out.collision!=='traffic')return {done:false,failed:true,...r,points:undefined,current:undefined,ride:api.getRideState(),probe:api.rideCollisionProbe(),surface:api.rideSurfaceProbe()};
    }
    return {done:false,...r,points:undefined,detourQueue:undefined,ride:api.getRideState()};
   });
   if(result.done||result.failed)break;
   if((result.trafficManeuvers??0)>60)break;
   const travel=result.ride.travelMeters;stalled=travel-lastTravel<.05?stalled+1:0;lastTravel=travel;if(stalled>25)break;
   if(batch%25===0)console.log('RIDE',route.bridgeId,kmh,reverse,batch,Math.round(travel),'waypoint',result.cursor,result.ride.blockCounts);
   // Yield to the real renderer and ordinary asynchronous runtime prefetch.
   // No extra prepare(), position writes, traffic pause or recovery is used.
   await page.waitForTimeout(30);
  }
  const out={bridgeId:route.bridgeId,direction:reverse?'B→A':'A→B',kmh,startRoadId:reverse?route.endRoadId:route.startRoadId,endRoadId:reverse?route.startRoadId:route.endRoadId,...result};
  const counts=result.ride?.blockCounts??{};
  Object.assign(out,{endSurfaceId:result.ride?.surfaceId,loadingBlockCount:counts.loading??0,surfaceMissingCount:counts['surface-missing']??0,wrongLayerCount:counts['layer-transition']??0,waterTransitionCount:counts.water??0,recoveryCount:result.ride?.recoveryCount});
  out.result=result.done&&result.ride.recoveryCount===0&&Object.keys(counts).length===0?'PASS':'FAIL';
  runs.push(out);await page.screenshot({path:`probe/wuhan/phase61-${route.bridgeId}-${kmh}-${reverse?'reverse':'forward'}.png`});
  await writeFile(reportPath,JSON.stringify({result:runs.every(r=>r.result==='PASS')?'PASS':'FAIL',runtime:'real browser RideController; accelerated input stepping with render/network yields',runs,errors},null,2)+'\n');
  console.log('RESULT',out.result,route.bridgeId,kmh,reverse,result.ride?.lastRejected??initialized.error);
 }
 assert.equal(runs.length,routes.filter(r=>!process.env.BRIDGE||process.env.BRIDGE.split(',').includes(r.bridgeId)).length*(process.env.KMH?1:2)*(process.env.ONE_WAY?1:2));assert.ok(runs.every(r=>r.result==='PASS'));assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
