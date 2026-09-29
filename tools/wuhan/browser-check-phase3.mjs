import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),port=4197;
const server=http.createServer(async(req,res)=>{
  let url=new URL(req.url,'http://localhost').pathname;
  if(url.startsWith('/nested/example/'))url=url.slice('/nested/example'.length);
  if(url.endsWith('/'))url+='index.html';
  const file=path.resolve(root,'.'+decodeURIComponent(url));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});
await mkdir('probe/wuhan',{recursive:true});
const results=[],issues=[];
async function prepare(page,prefix='/'){
  page.on('pageerror',e=>issues.push(e.message));
  page.on('response',r=>{if(r.status()>=400)issues.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),pending=new Set();window.requestAnimationFrame=fn=>{let id=request(t=>{pending.delete(id);fn(t);});pending.add(id);return id;};window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};window.__rafPending=()=>pending.size;});
  await page.goto(`http://127.0.0.1:${port}${prefix}wuhan/`);
  await page.waitForFunction(()=>window.__wuhan?.getState().placesReady&&window.__wuhan.getState().urban.buildingCount>0,null,{timeout:120000});
  const state=await page.evaluate(()=>window.__wuhan.getState());
  assert.equal(state.landmarks.loaded,12);assert.ok(state.phase>=3);assert.deepEqual(state.placeErrors,[]);
  assert.equal(await page.locator('#regions button').count(),6);
  assert.equal(await page.evaluate(()=>window.__wuhan.getPlaces().length),22);
}
async function view(page,id){
  await page.evaluate(id=>{window.__flightClearance=[];window.__flightTimer=setInterval(()=>{const w=window.__wuhan,s=w.getState(),p=s.camera;window.__flightClearance.push(p[1]-w.cameraFloor(p[0],p[2]));},50);window.__wuhan.fly(id);},id);
  await page.waitForFunction(()=>!window.__wuhan.getState().flying,null,{timeout:30000});
  const floor=await page.evaluate(()=>{clearInterval(window.__flightTimer);return Math.min(...window.__flightClearance);});
  assert.ok(floor>=-.001,`${id}: camera below conservative clearance: ${floor}`);
  await page.waitForTimeout(4500);
  const transition=await page.evaluate(()=>window.__wuhan.getState().p95FrameMs);
  await page.evaluate(()=>window.__wuhan.resetFrameStats());await page.waitForTimeout(3500);
  const s=await page.evaluate(()=>window.__wuhan.getState());
  assert.equal(s.region,id);assert.equal(s.rendererCount,1);assert.equal(s.mainLoopCount,1);assert.deepEqual(s.urbanErrors,[]);assert.deepEqual(s.placeErrors,[]);
  assert.equal(await page.evaluate(()=>window.__rafPending()),1);
  const labels=await page.evaluate(()=>window.__wuhan.getLabels().filter(l=>l.visible));
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].rect,b=labels[j].rect;assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,`label overlap: ${labels[i].id} / ${labels[j].id}`);}
  await page.screenshot({path:`probe/wuhan/phase3-${id}.png`});
  const record={view:id,metrics:s,transitionP95FrameMs:transition,minFlightClearance:floor,visibleLabels:labels.map(l=>l.id)};results.push(record);console.log(JSON.stringify({view:id,p95:s.p95FrameMs,transitionP95:transition,drawCalls:s.drawCalls,labels:labels.length}));
}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await prepare(page);
  const ids=['confluence','wuhan-iconic','place-yellow-crane','place-customs','place-wuhan-center','place-greenland','place-qingchuan-pavilion','place-guishan-tower','place-qintai-theater','place-wuhan-university','campus-lake','place-hubei-museum','place-moshan-chutian','place-wuhan-station','place-calla','place-xingyin','bridge-sequence'];
  for(const id of ids)await view(page,id);
  // Exercise the real canvas pick target, separately from a DOM label.
  await page.evaluate(()=>window.__wuhan.fly('place-yellow-crane'));await page.waitForTimeout(2500);
  const point=await page.evaluate(()=>{const b=window.__wuhan.getLandmarks().find(l=>l.id==='yellow-crane').pickBounds;return window.__wuhan.projectWorld([(b[0]+b[3])/2,b[1]+(b[4]-b[1])*.65,(b[2]+b[5])/2]);});
  await page.mouse.click(point[0],point[1]);await page.waitForTimeout(200);
  assert.equal(await page.locator('#place-card').getAttribute('data-place-id'),'yellow-crane');assert.equal(await page.locator('#place-card').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#place-card').isVisible(),false);
  await page.waitForTimeout(2400);
  await page.locator('[data-place-id="yellow-crane"].place-label').click();assert.equal(await page.locator('#place-name').textContent(),'黄鹤楼');
  await page.waitForTimeout(2000);await page.screenshot({path:'probe/wuhan/phase3-place-card.png'});
  await page.locator('#journey-toggle').click();await page.locator('[data-route="east-lake"]').click();
  for(let i=1;i<9;i++){await page.waitForFunction(()=>!window.__wuhan.getState().flying);await page.locator('#route-next').click();}
  await page.waitForFunction(()=>!window.__wuhan.getState().flying);assert.equal(await page.locator('#route-next').isDisabled(),true);assert.equal((await page.evaluate(()=>window.__wuhan.getState())).region,'moshan');
  await page.locator('#route-prev').click();await page.waitForFunction(()=>!window.__wuhan.getState().flying);assert.equal((await page.evaluate(()=>window.__wuhan.getState())).region,'place-moshan-chutian');
  await page.screenshot({path:'probe/wuhan/phase3-route.png'});await page.keyboard.press('Escape');
  // Every place uses one identity / information / camera contract.
  const placeIds=await page.evaluate(()=>window.__wuhan.getPlaces().map(p=>p.id));
  for(const id of placeIds){await page.evaluate(id=>window.__wuhan.selectPlace(id),id);assert.equal(await page.locator('#place-card').getAttribute('data-place-id'),id);assert.ok((await page.locator('#place-description').textContent()).length>=30);}
  await page.evaluate(()=>window.__wuhan.dispose());assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>window.__rafPending()),0);await page.close();
  const nested=await browser.newPage({viewport:{width:1280,height:800}});await prepare(nested,'/nested/example/');await view(nested,'place-hubei-museum');await nested.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});await prepare(mobile);
  await mobile.evaluate(()=>window.__wuhan.selectPlace('yellow-crane'));await mobile.waitForTimeout(6000);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const card=await mobile.locator('#place-card').boundingBox();assert.ok(card.x>=0&&card.x+card.width<=390&&card.y>=0&&card.y+card.height<=844);
  await mobile.screenshot({path:'probe/wuhan/phase3-mobile.png'});results.push({view:'mobile-emulated',metrics:await mobile.evaluate(()=>window.__wuhan.getState()),physicalDevice:false});
  await mobile.locator('#place-close').tap();assert.equal(await mobile.locator('#place-card').isVisible(),false);
  await mobile.locator('#journey-toggle').tap();await mobile.locator('[data-route="east-lake"]').tap();await mobile.waitForTimeout(2500);await mobile.screenshot({path:'probe/wuhan/phase3-mobile-route.png'});await mobile.locator('#journey-close').tap();assert.equal(await mobile.locator('#journeys').isVisible(),false);await mobile.close();
  assert.deepEqual(issues,[]);
  await writeFile(results[0].metrics.runtimePhase>=5?'docs/wuhan-phase6-landmarks-regression-qa.json':results[0].metrics.phase>=4?'docs/wuhan-phase4-landmarks-regression-qa.json':'docs/wuhan-phase3-browser-qa.json',JSON.stringify({result:'PASS',date:new Date().toISOString(),views:results,issues,checks:['12 models','22 places','replacement QA separate','real canvas pick','label click','non-overlapping labels','22 cards','route next/previous','fly clearance','one renderer and rAF','nested deployment','mobile viewport','dispose'],performanceTargetMs:25,physicalMobileTested:false},null,2)+'\n');
  console.log('PASS — Phase 3 browser interaction and visual captures');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
