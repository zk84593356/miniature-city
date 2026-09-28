const priorities=['cycleway','residential','tertiary','secondary','service','unclassified','living_street','primary'];
export const DEBUG_SPAWNS={hankou:[114.2904,30.5861],wuchang:[114.299,30.559],donghu:[114.365,30.566],luojia:[114.365,30.541],guanggu:[114.404,30.506],guishan:[114.276,30.552],moshan:[114.409,30.547]};
export async function findSpawn(adapter,target){
  await adapter.prepare(target.x,target.z);
  const candidates=[];
  for(const e of adapter.roads)for(const r of e.data??[]){
    const rank=priorities.indexOf(r.roadClass);
    if(rank<0||r.tunnel||r.access==='no'||!r.rendered||r.width<2||r.bridgeProfile)continue;
    for(let i=1;i<r.profile.length;i++){
      const a=r.profile[i-1],b=r.profile[i];if(!a||!b)continue;
      const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz;if(!d)continue;
      const t=Math.max(.1,Math.min(.9,((target.x-a[0])*dx+(target.z-a[2])*dz)/d));
      const x=a[0]+t*dx,z=a[2]+t*dz,dist=Math.hypot(x-target.x,z-target.z);if(dist>6)continue;
      candidates.push({x,z,y:a[1]+t*(b[1]-a[1]),heading:Math.atan2(dx,dz),speed:0,steering:0,roadClass:r.roadClass,score:dist+rank*.14});
    }
  }
  // A view centred over a river can enter the actual upper road deck. The lower
  // rail registry entry is never a spawn candidate; full clearance still applies.
  for(const bridge of adapter.surface.getSurfaces()){
    if(!bridge.id.startsWith('bridge-')||!bridge.rideAllowed||bridge.width<2)continue;
    for(let i=1;i<bridge.profile.length;i++){
      const a=bridge.profile[i-1],b=bridge.profile[i],dx=b[0]-a[0],dz=b[2]-a[2],len=dx*dx+dz*dz;if(!len)continue;
      const t=Math.max(.1,Math.min(.9,((target.x-a[0])*dx+(target.z-a[2])*dz)/len)),x=a[0]+t*dx,z=a[2]+t*dz,dist=Math.hypot(x-target.x,z-target.z);if(dist>6)continue;
      candidates.push({x,z,y:a[1]+t*(b[1]-a[1]),heading:Math.atan2(dx,dz),surfaceId:bridge.id,speed:0,steering:0,roadClass:'bridge-road',score:dist+.42});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const s of candidates){const hit=adapter.validate(s);if(hit){Object.assign(s,hit,{y:hit.height});delete s.score;return s;}}
  return null;
}
