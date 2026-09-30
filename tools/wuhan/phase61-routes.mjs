import {readFile} from 'node:fs/promises';
import {json} from './phase6-fixture.mjs';
export async function bridgeRoutes(){
  const config=JSON.parse(await readFile('src/cities/wuhan/ride-connections.json','utf8'));
  const index=await json('road-surfaces.json'),roads=(await Promise.all((await json('roads.json')).chunks.map(c=>json(c.file)))).flat();
  return config.connections.map(c=>{
    const bridge=index.bridges.find(b=>b.id==='bridge-'+c.bridgeId);
    const sides=c.sides.map(s=>s.legs.flatMap(leg=>{
      const r=roads.find(r=>r.id===leg.roadId);
      const at=node=>{const q=r.coordinates[r.nodes.indexOf(node)];return r.profile.reduce((n,p,i)=>Math.hypot(p[0]-q[0],p[2]-q[1])<Math.hypot(r.profile[n][0]-q[0],r.profile[n][2]-q[1])?i:n,0);};
      const a=at(leg.fromNode),b=at(leg.toNode),p=r.profile.slice(Math.min(a,b),Math.max(a,b)+1);return b<a?p.reverse():p;
    }));
    const from=c.sides[0].bridgeIndex,to=c.sides[1].bridgeIndex,p=bridge.profile;
    const main=p.slice(from,to+1).map((q,n)=>{
      const i=n+from,a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],d=Math.hypot(dx,dz);
      const t=Math.min(1,Math.hypot(q[0]-p[from][0],q[2]-p[from][2])/2,Math.hypot(q[0]-p[to][0],q[2]-p[to][2])/2),offset=Math.min(.085,bridge.width/200-.02)*t*t*(3-2*t);
      return [q[0]+dz/d*offset,q[1],q[2]-dx/d*offset];
    });
    const path=[...sides[0].reverse(),...main,...sides[1]].filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[2]-a[i-1][2])>.00001);
    return {bridgeId:c.bridgeId,path,source:c,roadIds:c.sides.flatMap(s=>s.roadIds),startRoadId:c.sides[0].roadIds.at(-1),endRoadId:c.sides[1].roadIds.at(-1)};
  });
}
