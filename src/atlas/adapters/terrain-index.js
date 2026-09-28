// Exact barycentric queries on the immutable collision mesh. Typed CSR cells
// share vertex/index buffers with the mesh; visible LOD is never consulted.
export function createTerrainIndex(root, size = .5) {
  const chunks = [];
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position.array, idx = mesh.geometry.index.array;
    const box = mesh.geometry.boundingBox;
    const x0 = Math.floor(box.min.x / size), z0 = Math.floor(box.min.z / size);
    const nx = Math.floor(box.max.x / size) - x0 + 1, nz = Math.floor(box.max.z / size) - z0 + 1;
    const offsets = new Uint32Array(nx * nz + 1);
    function visit(fn) {
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        const ax = Math.floor(Math.min(p[a], p[b], p[c]) / size) - x0;
        const bx = Math.floor(Math.max(p[a], p[b], p[c]) / size) - x0;
        const az = Math.floor(Math.min(p[a+2], p[b+2], p[c+2]) / size) - z0;
        const bz = Math.floor(Math.max(p[a+2], p[b+2], p[c+2]) / size) - z0;
        for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) fn(z * nx + x, i);
      }
    }
    visit(k => offsets[k+1]++);
    for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i-1];
    const items = new Uint32Array(offsets.at(-1)), cursor = offsets.slice();
    visit((k, i) => { items[cursor[k]++] = i; });
    chunks.push({p, idx, x0, z0, nx, nz, offsets, items});
  });
  return {
    bytes: chunks.reduce((s,c)=>s+c.offsets.byteLength+c.items.byteLength,0),
    sample(x,z,out={normal:[0,1,0]}) {
      let height = -Infinity;
      for (const c of chunks) {
        const ix = Math.floor(x/size)-c.x0, iz = Math.floor(z/size)-c.z0;
        if(ix<0||iz<0||ix>=c.nx||iz>=c.nz)continue;
        const key=iz*c.nx+ix,p=c.p,idx=c.idx;
        for(let j=c.offsets[key];j<c.offsets[key+1];j++) {
          const i=c.items[j],a=idx[i]*3,b=idx[i+1]*3,d=idx[i+2]*3;
          const ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[d]-p[a],vz=p[d+2]-p[a+2];
          const den=ux*vz-vx*uz;if(Math.abs(den)<1e-15)continue;
          const u=((x-p[a])*vz-(z-p[a+2])*vx)/den,v=(ux*(z-p[a+2])-uz*(x-p[a]))/den;
          if(u< -1e-8||v< -1e-8||u+v>1+1e-8)continue;
          const uy=p[b+1]-p[a+1],vy=p[d+1]-p[a+1],y=p[a+1]+u*uy+v*vy;
          if(y<height)continue;height=y;
          const hx=(uy*vz-vy*uz)/den,hz=(ux*vy-vx*uy)/den,n=Math.hypot(hx,1,hz);
          out.normal[0]=-hx/n;out.normal[1]=1/n;out.normal[2]=-hz/n;
        }
      }
      if(!Number.isFinite(height))return null;
      out.height=height;return out;
    },
  };
}

// Point-in-polygon with exactly the same crossing rule as insideRing, but only
// visits edges spanning this Z row. Holes and the authoritative water shape stay intact.
export function createWaterIndex(waters) {
  const entries=waters.map(water=>({water,rings:water.rings.map(ring=>{
    const rows=new Map();let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[j],b=ring[i];x0=Math.min(x0,b[0]);x1=Math.max(x1,b[0]);z0=Math.min(z0,b[1]);z1=Math.max(z1,b[1]);
      if(a[1]===b[1])continue;
      for(let z=Math.floor(Math.min(a[1],b[1]));z<=Math.floor(Math.max(a[1],b[1]));z++){
        if(!rows.has(z))rows.set(z,[]);rows.get(z).push([a,b]);
      }
    }
    return {rows,x0,x1,z0,z1};
  })}));
  function inside(x,z,r){
    if(x<r.x0||x>r.x1||z<r.z0||z>r.z1)return false;
    let yes=false;for(const [a,b] of r.rows.get(Math.floor(z))??[])
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
    return yes;
  }
  const cells=new Map();
  for(const e of entries){const b=e.rings[0];for(let x=Math.floor(b.x0/8);x<=Math.floor(b.x1/8);x++)for(let z=Math.floor(b.z0/8);z<=Math.floor(b.z1/8);z++){const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(e);}}
  return (x,z)=>{for(const e of cells.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)??[]){if(!inside(x,z,e.rings[0]))continue;let hole=false;for(let i=1;i<e.rings.length;i++)if(inside(x,z,e.rings[i])){hole=true;break;}if(!hole)return e.water;}return null;};
}
