import assert from 'node:assert/strict';
import http from 'node:http';import path from 'node:path';import os from 'node:os';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),port=4214,errors=[],views=[];
const server=http.createServer(async(req,res)=>{let u=new URL(req.url,'http://localhost').pathname;if(u.endsWith('/'))u+='index.html';const f=path.resolve(root,'.'+decodeURIComponent(u));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));const browser=await chromium.launch({executablePath:path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});await mkdir('probe/wuhan',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().urban.surfacesReady&&window.__wuhan.getState().placesReady&&window.__wuhan.getState().dynamics.ready,null,{timeout:120000});
 const points=JSON.parse(await readFile('docs/wuhan-phase61-yangtze-first-approach-regression.json','utf8')).results,checks=[];
 for(const point of points){
  const initialized=await page.evaluate(async p=>{const api=window.__wuhan;await api.ridePrepare(p.world.x,p.world.z);const q=api.sampleSurface(p.world.x,p.world.z,p.points[4].height,p.surfaceId);return api.rideDebugAt({x:p.world.x,z:p.world.z,y:q.height,surfaceId:p.surfaceId,heading:Math.PI/2});},point);assert.ok(initialized);
  await page.waitForTimeout(1200);const s=await page.evaluate(()=>({ride:window.__wuhan.getRideState(),surface:window.__wuhan.rideSurfaceProbe(),collision:window.__wuhan.rideCollisionProbe()}));
  assert.equal(s.ride.recoveryCount,0);assert.ok(s.surface.canonical.length);assert.ok(s.collision.every(o=>o.id&&o.kind&&o.source&&o.bounds&&Number.isFinite(o.bottom)&&Number.isFinite(o.top)));
  await page.screenshot({path:`probe/wuhan/phase61-${point.name}.png`});assert.ok(await page.evaluate(()=>window.__wuhan.rideCollisionDebug(true)));await page.waitForTimeout(400);await page.screenshot({path:`probe/wuhan/phase61-${point.name}-debug.png`});await page.evaluate(()=>window.__wuhan.rideCollisionDebug(false));checks.push({point:point.name,...s});
 }
 assert.deepEqual(errors,[]);await writeFile('docs/wuhan-phase61-diagnostics-browser-qa.json',JSON.stringify({result:'PASS',scope:'Static visual/diagnostic inspection at three saved points, separate from the 24 ground-to-ground driving cases',checks,errors},null,2)+'\n');console.log('PASS three approach points and local debug overlay');
}finally{await browser.close();await new Promise(r=>server.close(r));}
