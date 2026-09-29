import assert from 'node:assert/strict';
export async function crossBridge(page,route,reverse=false){
 // A visible outside road strip clears the live car lanes. Smoothly join it from
 // ordinary ground and leave it before the sourced Huanghelou South Road branch.
 const bridge=route.bridgeProfile,join=route.joinIndex;
 let path=route.path.map(p=>{const i=bridge.findIndex(q=>q[0]===p[0]&&q[2]===p[2]);if(i<0||i>=join)return p;
   const a=bridge[Math.max(0,i-1)],b=bridge[Math.min(bridge.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
   const from=Math.hypot(p[0]-bridge[0][0],p[2]-bridge[0][2]),to=Math.hypot(p[0]-bridge[join][0],p[2]-bridge[join][2]);
   const t=Math.min(1,from/2,to/2),offset=.085*t*t*(3-2*t);return [p[0]+dz/length*offset,p[1],p[2]-dx/length*offset];});
 path=reverse?[...path].reverse():path;
 await page.evaluate(async path=>{
  window.__phase6Path=path;window.__phase6Cursor=1;window.__phase6Run={samples:0,blocked:{},layers:[],maxKmh:0,recoveryCount:0};
  const a=path[0],b=path[1];await window.__wuhan.ridePrepare(a[0],a[2]);const hit=window.__wuhan.roadDebugProbe(a[0],a[2]).filter(c=>c.rideAllowed).sort((a,b)=>a.height-b.height)[0];
  if(!hit||!await window.__wuhan.rideDebugAt({x:a[0],z:a[2],y:hit.height,surfaceId:hit.surfaceId,heading:Math.atan2(b[0]-a[0],b[2]-a[2])}))throw new Error('Ground route spawn failed');
 },path);
 let result,lastTravel=0,stalled=0;
 for(let batch=0;batch<150;batch++){
  await page.evaluate(async()=>{const s=window.__wuhan.getRideState().state;await window.__wuhan.ridePrepare(s.x,s.z);});
  result=await page.evaluate(()=>{
   const path=window.__phase6Path,r=window.__phase6Run;
   for(let frame=0;frame<240;frame++){
    const s=window.__wuhan.getRideState().state;
    const look=Math.max(.04,Math.abs(s.speed)*.007);
    while(window.__phase6Cursor<path.length-1&&Math.hypot(path[window.__phase6Cursor][0]-s.x,path[window.__phase6Cursor][2]-s.z)<look)window.__phase6Cursor++;
    const target=path[window.__phase6Cursor],distance=Math.hypot(target[0]-s.x,target[2]-s.z);
    if(window.__phase6Cursor===path.length-1&&distance<.03)return {done:true,...r};
    const error=Math.atan2(Math.sin(Math.atan2(target[0]-s.x,target[2]-s.z)-s.heading),Math.cos(Math.atan2(target[0]-s.x,target[2]-s.z)-s.heading));
    const steer=Math.atan2(2*.0116*Math.sin(error),Math.max(.025,distance)),pace=Math.abs(s.speed)/(60/3.6),limit=.5/(1+pace*pace*9);
    // Curves are taken at a stable exploration pace; long straight deck reaches 60.
    const limitSpeed=Math.abs(error)>.14?4:60/3.6;
    const out=window.__wuhan.rideStep(1/60,{throttle:s.speed<limitSpeed?1:0,turn:Math.max(-1,Math.min(1,steer/limit)),brake:s.speed>limitSpeed+1});
    if(out.collision)r.blocked[out.collision]=(r.blocked[out.collision]??0)+1;
    if(!r.layers.includes(out.state.layerId))r.layers.push(out.state.layerId);
    r.samples++;r.travel=out.travelMeters;r.maxKmh=Math.max(r.maxKmh,out.state.speed*3.6);r.recoveryCount=out.recoveryCount;
   }
   return {done:false,cursor:window.__phase6Cursor,...r};
  });
  if(batch%15===0)console.log('PHASE6 BRIDGE',reverse,batch,result.cursor,result.travel,result.blocked);
  if(result.done)break;
  stalled=result.travel-lastTravel<.1?stalled+1:0;lastTravel=result.travel;
  assert.ok(stalled<6,'Full ground-to-ground bridge route stalled: '+JSON.stringify(result));
 }
 assert.ok(result.done,'completed full crossing');assert.equal(result.recoveryCount,0);assert.ok(result.travel>3500);
 assert.ok(!result.layers.some(l=>l.includes('rail')||l.includes('water')));assert.equal(result.layers[0],'ground-0');
 assert.equal((await page.evaluate(()=>window.__wuhan.getRideState())).state.layerId,'ground-0');
 for(const reason of Object.keys(result.blocked))assert.equal(reason,'traffic','No physical geometry blockage: '+reason);
 return {...result,reverse};
}
