// One canonical float32 top, shared by visual geometry and CPU support queries.
// Grid entries refer to existing typed arrays; no per-step raycaster or mesh copy.
export function createRoadTriangleIndex(size=.25){
  const cells=new Map(),features=new Map(),joints=new Map();
  function register(feature,positions,indices){
    if(features.has(feature.id))return;
    const f={...feature,positions,indices,entries:[]};features.set(f.id,f);
    if(f.nodeId)for(const id of f.roadIds??[]){if(!joints.has(id))joints.set(id,new Set());joints.get(id).add(f);}
    for(let i=f.triangleStart*3,end=i+f.triangleCount*3;i<end;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const minX=Math.floor(Math.min(positions[a],positions[b],positions[c])/size),maxX=Math.floor(Math.max(positions[a],positions[b],positions[c])/size);
      const minZ=Math.floor(Math.min(positions[a+2],positions[b+2],positions[c+2])/size),maxZ=Math.floor(Math.max(positions[a+2],positions[b+2],positions[c+2])/size);
      const entry={f,a,b,c};
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=x+','+z;let bin=cells.get(key);if(!bin)cells.set(key,bin=new Set());bin.add(entry);f.entries.push([key,entry]);}
    }
  }
  function unregister(id){const f=features.get(id);if(!f)return;for(const [key,e] of f.entries){const bin=cells.get(key);bin.delete(e);if(!bin.size)cells.delete(key);}if(f.nodeId)for(const id of f.roadIds??[]){joints.get(id)?.delete(f);if(!joints.get(id)?.size)joints.delete(id);}features.delete(id);}
  function heightIn(e,x,z){
    const {f,a,b,c}=e,p=f.positions,ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vz=p[c+2]-p[a+2],den=ux*vz-vx*uz;
    if(Math.abs(den)<1e-16)return null;
    const u=((x-p[a])*vz-(z-p[a+2])*vx)/den,v=(ux*(z-p[a+2])-uz*(x-p[a]))/den;
    return u< -1e-7||v< -1e-7||u+v>1+1e-7?null:p[a+1]+u*(p[b+1]-p[a+1])+v*(p[c+1]-p[a+1]);
  }
  function query(x,z,fn){
    for(const {f,a,b,c} of cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]){
      const p=f.positions,ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vz=p[c+2]-p[a+2],den=ux*vz-vx*uz;
      if(Math.abs(den)<1e-16)continue;
      const u=((x-p[a])*vz-(z-p[a+2])*vx)/den,v=(ux*(z-p[a+2])-uz*(x-p[a]))/den;
      if(u< -1e-7||v< -1e-7||u+v>1+1e-7)continue;
      const uy=p[b+1]-p[a+1],vy=p[c+1]-p[a+1],height=p[a+1]+u*uy+v*vy;
      const hx=(uy*vz-vy*uz)/den,hz=(ux*vy-vx*uy)/den,n=Math.hypot(hx,1,hz);
      fn(f,height,[-hx/n,1/n,-hz/n]);
    }
  }
  return {register,unregister,features,query,
    connected(a,b){const ids=new Set([b.surfaceId,...(b.roadIds??[])]);return [a.surfaceId,...(a.roadIds??[])].some(id=>[...(joints.get(id)??[])].some(j=>j.roadIds.some(other=>ids.has(other))));},
    heightFor(id,x,z,cache){
      if(cache?.f.id===id&&features.get(id)===cache.f){const height=heightIn(cache,x,z);if(height!==null)return {height,triangle:cache};}
      for(const e of cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]){if(e.f.id!==id)continue;const height=heightIn(e,x,z);if(height!==null)return {height,triangle:e};}
      return null;
    },
    candidates(x,z){const found=new Map();query(x,z,(f,height,normal)=>{found.set(f.id,{height,normal,surfaceId:f.id,layerId:f.layerId,kind:f.kind==='junction'?'road':f.kind,rideAllowed:f.rideAllowed,traversable:f.rideAllowed,canonical:true,bounds:f.bounds,source:f.osmIds?.length?'OSM '+f.osmIds.join(','):'canonical-road-top',roadIds:f.roadIds,nodeId:f.nodeId});});return [...found.values()];},
    intersectsDeck(x,y,z){let hit=false;query(x,z,(f,height)=>{if(f.kind==='bridge'&&y<=height+.001&&y>=height-.024)hit=true;});return hit;},
    clear(){cells.clear();features.clear();joints.clear();},get triangles(){let n=0;for(const f of features.values())n+=f.triangleCount;return n;}
  };
}
