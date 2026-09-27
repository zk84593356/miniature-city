import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve('atlas-site'),port=4198,quick=process.argv.includes('--quick');
const server=http.createServer(async(req,res)=>{let url=new URL(req.url,'http://localhost').pathname;if(url.startsWith('/nested/example/'))url=url.slice('/nested/example'.length);if(url.endsWith('/'))url+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(url));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||path.join(os.homedir(),'AppData/Local/Google/Chrome/Application/chrome.exe'),headless:true,args:['--enable-unsafe-swiftshader']});
await mkdir('probe/wuhan',{recursive:true});const results=[],issues=[];
async function prepare(options={},prefix='/'){
  const page=await browser.newPage({viewport:{width:1440,height:900},...options});page.on('pageerror',e=>issues.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))issues.push(m.text());});page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))issues.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),pending=new Set();window.requestAnimationFrame=fn=>{let id=request(t=>{pending.delete(id);fn(t);});pending.add(id);return id;};window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};window.__rafPending=()=>pending.size;});
  await page.goto(`http://127.0.0.1:${port}${prefix}wuhan/`);await page.waitForFunction(()=>window.__wuhan?.getState().dynamics.ready&&window.__wuhan.getState().placesReady,null,{timeout:120000});await page.waitForTimeout(2500);return page;
}
async function view(page,id,light){
  await page.evaluate(({id,light})=>{window.__wuhan.fly(id,true);window.__wuhan.setLight(light);},{id,light});await page.waitForTimeout(4200);await page.evaluate(()=>window.__wuhan.resetFrameStats());await page.waitForTimeout(3500);
  const s=await page.evaluate(()=>window.__wuhan.getState());assert.equal(s.rendererCount,1);assert.equal(s.mainLoopCount,1);assert.equal(await page.evaluate(()=>window.__rafPending()),1);assert.equal(s.light,light);assert.deepEqual(s.dynamics.errors,[]);assert.ok(s.dynamics.vehicles>0&&s.dynamics.vessels>0);assert.ok(s.dynamics.nearVehicles<=400);assert.ok(s.dynamics.wakes<=18);assert.ok(s.dynamics.dynamicUpdateMs<12,'dynamic CPU budget');
  await page.screenshot({path:`probe/wuhan/phase4-${id}-${light}.png`});results.push({view:id,light,metrics:s});console.log(JSON.stringify({view:id,light,p95:s.p95FrameMs,drawCalls:s.drawCalls,dynamics:s.dynamics}));return s;
}
try{
  const page=await prepare();await view(page,'confluence','day');await view(page,'confluence','night');
  if(!quick){
    await view(page,'confluence','sunset');for(const [id,light] of [['wuhan-iconic','night'],['place-wuhan-center','night'],['campus-lake','day'],['bridge-sequence','night'],['bridge-yangtze-first','night'],['bridge-yingwuzhou','night'],['bridge-yangsigang','night'],['bridge-erqi','night'],['bridge-qingchuan','night'],['bridge-yangtze-second','night']])await view(page,id,light);
    await page.evaluate(()=>window.__wuhan.setDynamicPaused(true));const before=await page.evaluate(()=>window.__wuhan.getDynamics());await page.waitForTimeout(800);assert.deepEqual(await page.evaluate(()=>window.__wuhan.getDynamics()),before,'pause freezes all logical poses');
    await page.evaluate(()=>window.__wuhan.setDynamicPaused(false));await page.waitForTimeout(700);assert.notDeepEqual(await page.evaluate(()=>window.__wuhan.getDynamics()),before);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);let s=await page.evaluate(()=>window.__wuhan.getState());assert.ok(s.dynamics.reducedMotion&&s.dynamics.vehicles<=150&&s.dynamics.vessels===3&&s.dynamics.wakes===0&&s.dynamics.visibleBirds===0);const time=s.dynamics.time;await page.waitForTimeout(500);assert.equal((await page.evaluate(()=>window.__wuhan.getState())).dynamics.time,time);await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.waitForTimeout(100);const t=await page.evaluate(()=>window.__wuhan.getState().dynamics.time);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__wuhan.getState().dynamics.time),t);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    for(const tier of ['low','medium','high']){await page.evaluate(t=>window.__wuhan.setQuality(t),tier);await page.waitForTimeout(500);s=await page.evaluate(()=>window.__wuhan.getState());assert.equal(s.dynamics.qualityLevel,tier);assert.ok(s.dynamics.vehicles<=({low:400,medium:800,high:1200})[tier]);}
    await page.evaluate(()=>window.__wuhan.fly('place-yellow-crane',true));await page.waitForTimeout(8000);const memory=await page.evaluate(()=>window.__wuhan.getState().geometries);for(let i=0;i<18;i++){await page.evaluate(i=>window.__wuhan.setLight(['day','sunset','night'][i%3]),i);await page.waitForTimeout(50);}assert.equal(await page.evaluate(()=>window.__wuhan.getState().geometries),memory,'time mode does not allocate geometry');
    await page.evaluate(()=>window.__wuhan.selectPlace('yellow-crane'));await page.waitForTimeout(1800);assert.ok(await page.locator('#place-card').isVisible());await page.screenshot({path:'probe/wuhan/phase4-night-card.png'});
    await page.evaluate(()=>window.__wuhan.dispose());assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.evaluate(()=>window.__rafPending()),0);await page.close();
    const nested=await prepare({},'/nested/example/');await view(nested,'place-greenland','night');await nested.close();
    const mobile=await prepare({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});await view(mobile,'wuhan-iconic','night');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await mobile.evaluate(()=>window.__wuhan.getState().dynamics.qualityLevel),'low');await mobile.screenshot({path:'probe/wuhan/phase4-mobile.png'});await mobile.close();
  }
  assert.deepEqual(issues,[]);const report={result:'PASS',date:new Date().toISOString(),views:results,issues,checks:['single renderer/rAF','day/sunset/night','six bridges','pause/resume','live reduced motion','blur/focus pause','three tiers','mode switch geometry stability','night card','nested prefix','mobile emulated viewport'],physicalMobileTested:false,performanceTargetMs:25};await writeFile(quick?'probe/wuhan/phase4-quick.json':'docs/wuhan-phase4-browser-qa.json',JSON.stringify(report,null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
