import assert from 'node:assert/strict';
import http from 'node:http';import path from 'node:path';import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),port=4217,errors=[],views=[];
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u.endsWith('/'))u+='index.html';const f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await chromium.launch({executablePath:path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});await mkdir('probe/wuhan',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().urban.surfacesReady&&window.__wuhan.getState().placesReady&&window.__wuhan.getState().dynamics.ready,null,{timeout:120000});
 const checks=[];
 await page.evaluate(()=>window.__wuhan.rideDebugSpawn('luojia'));await page.waitForTimeout(1800);
 const plants=await page.evaluate(()=>window.__wuhan.vegetationDebug());
 for(const kind of ['tree','shrub','flower']){
  let result=null;for(const item of plants.filter(p=>p.kind===kind).slice(0,80)){
   result=await page.evaluate(async item=>{const api=window.__wuhan,[x,y,z]=item.position;if(!await api.rideDebugAt({x,y,z:z-.04,heading:0,surfaceId:'terrain'}))return null;const end=api.rideStep(3,{throttle:1,turn:0,brake:false});return !end.collision&&end.state.z>z+.01?{id:item.id,position:item.position,travelMeters:end.travelMeters,blockCounts:end.blockCounts,recoveryCount:end.recoveryCount}:null;},item);if(result)break;
  }assert.ok(result,kind+' real source instance crossed');assert.equal(result.recoveryCount,0);checks.push({kind,result:'PASS',...result});
 }
 const bridges=await page.evaluate(()=>window.__wuhan.getBridges());const bridge=bridges.find(b=>b.bridgeId==='yingwuzhou');
 for(const kind of ['pier','tower']){
  let result=null;for(const o of bridge.obstacles.filter(o=>o.kind===kind)){
   result=await page.evaluate(async o=>{const api=window.__wuhan,x=o.center[0],z=o.center[2],q=api.sampleSurface(x,z,o.center[1],'bridge-yingwuzhou');if(!q||!await api.rideDebugAt({x,z:z-.04,y:q.height,heading:0,surfaceId:q.surfaceId}))return null;const end=api.rideStep(3,{throttle:1,turn:0,brake:false});return !end.collision&&end.state.z>z+.01?{id:o.id,position:o.center,travelMeters:end.travelMeters,blockCounts:end.blockCounts,recoveryCount:end.recoveryCount}:null;},o);if(result)break;
  }assert.ok(result,'bridge '+kind+' crossed');assert.equal(result.recoveryCount,0);checks.push({kind:'bridge-'+kind,result:'PASS',...result});
 }
 const cars=await page.evaluate(()=>window.__wuhan.getDynamics().vehicles.filter(v=>v.bridge==='yangtze-first').slice(0,20));let carResult=null;
 for(const car of cars){carResult=await page.evaluate(async car=>{const api=window.__wuhan,dx=Math.sin(car.heading),dz=Math.cos(car.heading);if(!await api.rideDebugAt({x:car.x-dx*.065,y:car.y,z:car.z-dz*.065,heading:car.heading,surfaceId:'bridge-yangtze-first'}))return null;const start=api.getRideState().state,end=api.rideStep(5,{throttle:1,turn:0,brake:false});return !end.collision&&(end.state.x-start.x)*dx+(end.state.z-start.z)*dz>.13?{id:car.id,travelMeters:end.travelMeters,blockCounts:end.blockCounts,recoveryCount:end.recoveryCount}:null;},car);if(carResult)break;}
 assert.ok(carResult,'live traffic path crossed by actual RideController');assert.equal(carResult.recoveryCount,0);checks.push({kind:'traffic',result:'PASS',...carResult});
 const waters=JSON.parse(await readFile('city-data/wuhan/generated/water.json','utf8')),lake=waters.find(w=>w.id==='water-717');let shore=null;
 for(const ring of lake.rings){for(let i=1;i<ring.length;i+=Math.max(1,Math.floor(ring.length/100))){const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(!len)continue;
  shore=await page.evaluate(async p=>{const api=window.__wuhan;for(const sign of [-1,1]){const x=p.x+p.nx*.025*sign,z=p.z+p.nz*.025*sign,land=api.sampleWorld(x,z),wet=api.sampleWorld(p.x-p.nx*.025*sign,p.z-p.nz*.025*sign);if(land?.kind!=='ground'||wet?.kind!=='water')continue;if(!await api.rideDebugAt({x,z,y:land.height,heading:Math.atan2(-p.nx*sign,-p.nz*sign),surfaceId:'terrain'}))continue;let result;for(let t=0;t<240;t++){result=api.rideStep(1/60,{throttle:1,turn:0,brake:false});if(result.collision)break;if(result.state.kind==='water')return {start:{x,z,y:land.height},state:result.state,waterHeight:api.sampleWorld(result.state.x,result.state.z).height,blockCounts:result.blockCounts,recoveryCount:result.recoveryCount};}}return null;},{x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,nx:dz/len,nz:-dx/len});if(shore)break;
 }if(shore)break;}
 assert.ok(shore,'actual terrain-to-East-Lake boundary');assert.ok(Math.abs(shore.state.y-shore.waterHeight)<1e-8);assert.equal(shore.recoveryCount,0);assert.deepEqual(shore.blockCounts,{});checks.push({kind:'terrain-to-water',result:'PASS',...shore});
 assert.deepEqual(errors,[]);await page.screenshot({path:'probe/wuhan/free-water-ride.png'});await writeFile('docs/wuhan-free-pass-browser-qa.json',JSON.stringify({result:'PASS',method:'Normal throttle through sourced visible objects and shoreline with actual RideController; no position writes after each spawn.',checks,errors},null,2)+'\n');console.log('PASS real plants, traffic, bridge structures and East Lake water ride');
}finally{await browser.close();await new Promise(r=>server.close(r));}
