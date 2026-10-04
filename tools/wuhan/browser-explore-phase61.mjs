import http from 'node:http';import path from 'node:path';import os from 'node:os';
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),port=4207,errors=[],regions=[];
if(process.env.APPEND_REGIONS){const prior=JSON.parse(await readFile('probe/wuhan/phase61-exploration-raw.json','utf8'));regions.push(...prior.regions);errors.push(...prior.errors);}
const compactRegions=()=>regions.map(({events,samples,...region})=>{
 const unique=new Map();for(const e of events){const p=e.blockPosition,key=[e.blockKind,e.blockId,Math.round(p.x*100),Math.round(p.z*100)].join(':');const row=unique.get(key);if(row)row.retainedOccurrences++;else unique.set(key,{...e,retainedOccurrences:1});}
 return {...region,eventScope:'Grouped last 2000 runtime rejections per district; blockCounts retain total counts',events:[...unique.values()],samples:samples.filter((s,i)=>i===0||i===samples.length-1||Math.floor(s.wallMs/5000)!==Math.floor(samples[i-1].wallMs/5000))};
});
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u.endsWith('/'))u+='index.html';const f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await chromium.launch({executablePath:path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});await mkdir('probe/wuhan',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().dynamics.ready&&window.__wuhan.getState().urban.surfacesReady&&window.__wuhan.getState().placesReady,null,{timeout:120000});
 const destinations=[['hankou','hankou'],['hanyang','hanyang'],['wuchang','wuchang'],['donghu','donghu'],['wuhan-university','luojia'],['guanggu','guanggu'],['guishan','guishan'],['sheshan','sheshan'],['bridge-neighborhood','bridge-neighborhood']];
 let activeKeys=new Set();const setKeys=async codes=>{const next=new Set(codes);for(const code of activeKeys)if(!next.has(code))await page.keyboard.up(code);for(const code of next)if(!activeKeys.has(code))await page.keyboard.down(code);activeKeys=next;};
 for(const [name,id] of destinations.filter(([name])=>!process.env.APPEND_REGIONS||process.env.APPEND_REGIONS.split(',').includes(name))){
  await setKeys([]);
  const entered=await page.evaluate(async id=>{
   const api=window.__wuhan;
   if(!['hanyang','sheshan','bridge-neighborhood'].includes(id))return api.rideDebugSpawn('wuhan-ride-'+id);
   const lonlat={hanyang:[114.263,30.544],sheshan:[114.298,30.546],'bridge-neighborhood':[114.27,30.557]}[id];
   // Use the normal road spawn search, driven by a geographic camera target.
   const manifest=await (await fetch('../cities/wuhan/manifest.json')).json(),c=manifest.projection,degree=Math.PI/180*c.earthRadiusMeters/c.worldUnitMeters,x=(lonlat[0]-c.origin[0])*degree*Math.cos(c.origin[1]*Math.PI/180),z=(c.origin[1]-lonlat[1])*degree;
   api.rideExit();return api.rideEnterAt({x,z});
  },id);assert.ok(entered,name+' ordinary road spawn');
  const start=Date.now(),samples=[];let lastLog=0,reverseUntil=0,turnBias=1;
  while(Date.now()-start<100000){
   const observation=await page.evaluate(()=>{
    const api=window.__wuhan,ride=api.getRideState(),s=ride.state;
    const options=[0,.35,-.35,.7,-.7,1.1,-1.1,1.7,-1.7,2.3,-2.3].map(angle=>{
     const heading=s.heading+angle;let clear=0;
     for(const meters of [2,5,10,20]){const x=s.x+Math.sin(heading)*meters/100,z=s.z+Math.cos(heading)*meters/100,h=api.sampleSurface(x,z,s.y,s.surfaceId);if(!h?.rideAllowed||!api.rideProbe({...s,x,z,y:h.height,surfaceId:h.surfaceId,heading}).valid)break;clear=meters;}
     return {angle,clear};
    });return {ride,options,invisible:api.rideCollisionProbe().filter(o=>o.visualResident===false).map(o=>o.id)};
   });
   const {ride,options}=observation,best=options.sort((a,b)=>b.clear-a.clear||Math.abs(a.angle)-Math.abs(b.angle))[0];
   if((best.clear<2||ride.collision&&Math.abs(ride.state.speed)<.1)&&Date.now()>reverseUntil){reverseUntil=Date.now()+6500;turnBias=-turnBias;}
   let keys;
   if(Date.now()<reverseUntil)keys=reverseUntil-Date.now()>2500?['s']:['s',turnBias>0?'a':'d'];
   else{const target=best.clear<10||Math.abs(best.angle)>.7?1.8:25/3.6;keys=ride.state.speed>target+.2?['Space']:ride.state.speed<target?['w']:[];if(Math.abs(best.angle)>.15)keys.push(best.angle>0?'a':'d');}
   await setKeys(keys);samples.push({wallMs:Date.now()-start,position:ride.state,travelMeters:ride.travelMeters,blockCounts:ride.blockCounts,recoveryCount:ride.recoveryCount,lastRejected:ride.lastRejected,invisible:observation.invisible,metrics:ride.meanMetrics});
   if(Date.now()-start-lastLog>20000){lastLog=Date.now()-start;console.log('EXPLORE',name,Math.round(lastLog/1000),Math.round(ride.travelMeters),ride.blockCounts);}
   await page.waitForTimeout(250);
  }
  await setKeys([]);const state=await page.evaluate(()=>window.__wuhan.getRideState()),events=await page.evaluate(()=>window.__wuhan.rideBlockEvents());await page.screenshot({path:`probe/wuhan/phase61-explore-${name}.png`});
  regions.push({name,wallDurationMs:Date.now()-start,travelMeters:state.travelMeters,recoveryCount:state.recoveryCount,blockCounts:state.blockCounts,events,samples});
  await writeFile('docs/wuhan-phase61-exploration-qa.json',JSON.stringify({status:'IN_PROGRESS',method:'Real elapsed RAF browser exploration with keyboard inputs; nine ordinary-road district starts, no position writes while riding',regions:compactRegions(),errors},null,2)+'\n');
 }
 const unexpected=regions.flatMap(r=>r.events.filter(e=>!['building','dataset-end','fatal-invalid-state'].includes(e.blockKind))),invisible=regions.flatMap(r=>r.samples.flatMap(s=>s.invisible));
 const elapsed=regions.reduce((n,r)=>n+r.wallDurationMs,0),recovery=regions.reduce((n,r)=>n+r.recoveryCount,0);
 const report={status:unexpected.length||recovery||invisible.length||errors.length?'FAIL':'PASS',wallDurationMs:elapsed,unexpectedBlocks:unexpected,loadingBlocks:regions.reduce((n,r)=>n+(r.blockCounts.loading??0),0),surfaceMissing:regions.reduce((n,r)=>n+(r.blockCounts['surface-missing']??0),0),recovery,invisibleColliders:invisible,method:'100-second real elapsed browser exploration segments across nine districts; keyboard controls and live traffic, retries retained. District relocation only between segments.',regions,errors};
 await writeFile('probe/wuhan/phase61-exploration-raw.json',JSON.stringify(report)+'\n');
 await writeFile('docs/wuhan-phase61-exploration-qa.json',JSON.stringify({...report,regions:compactRegions()},null,2)+'\n');assert.ok(elapsed>=900000);assert.equal(report.status,'PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
