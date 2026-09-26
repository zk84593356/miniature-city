import * as THREE from 'three';

export function decode(buffer, spec) {
  if (buffer.byteLength !== spec.vertices * 12 + spec.triangles * 12) throw new Error('地形网格长度与清单不匹配');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, 0, spec.vertices * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, spec.vertices * 12, spec.triangles * 3), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createGeography(pack) {
  const terrainGeometry = decode(pack.buffers['terrain.bin'], pack.manifest.terrain);
  const waterGeometry = decode(pack.buffers['water.bin'], pack.manifest.water);
  const colors = new Float32Array(terrainGeometry.attributes.position.count * 3);
  const low = new THREE.Color('#dddcc7'), middle = new THREE.Color('#b6c7a2'), high = new THREE.Color('#71956c');
  const color = new THREE.Color();
  const p = terrainGeometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const meters = p.getY(i) * 100;
    if (meters < 48) color.copy(low).lerp(middle, THREE.MathUtils.smoothstep(meters, 24, 48));
    else color.copy(middle).lerp(high, THREE.MathUtils.smoothstep(meters, 48, 110));
    color.toArray(colors, i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const landMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#78b5aa', roughness: .48, metalness: .08, side: THREE.DoubleSide });
  const terrain = new THREE.Group();
  const stableTerrain = new THREE.Group();
  const lodMeshes = [];
  let disposed = false, loading = 0, lastUpdate = 0;
  terrain.name = 'wuhan-ground';
  // Exact shared vertices/normals across chunks; only visibility changes.
  // This avoids drawing the entire 60 km dataset in a hill close-up.
  const chunks = new Map();
  const index = terrainGeometry.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    const key = `${Math.floor(x / 70)},${Math.floor(z / 70)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(a, b, c);
  }
  for (const [key, indices] of chunks) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(terrainGeometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const i of indices) bounds.expandByPoint(point.fromBufferAttribute(p, i));
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, landMaterial);
    mesh.name = `ground:${key}`;
    stableTerrain.add(mesh);
    if (!pack.manifest.terrainChunks) terrain.add(mesh.clone());
  }
  if (pack.manifest.terrainChunks) {
    const overview = decode(pack.buffers['terrain-overview.bin'], pack.manifest.terrainOverview);
    const op=overview.attributes.position;
    const oc=new Float32Array(op.count*3);
    for(let i=0;i<op.count;i++) { const h=op.getY(i)*100; color.copy(low).lerp(h<48?middle:high, THREE.MathUtils.smoothstep(h,h<48?24:48,h<48?48:110)); color.toArray(oc,i*3); }
    overview.setAttribute('color', new THREE.BufferAttribute(oc,3));
    for(const spec of pack.manifest.terrainChunks) {
      const g=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(overview.attributes)) g.setAttribute(name,attribute);
      g.setIndex(new THREE.BufferAttribute(overview.index.array.slice(spec.overviewTriangleStart*3,(spec.overviewTriangleStart+spec.overviewTriangleCount)*3),1));
      const [x0,z0,x1,z1]=spec.bounds;
      g.boundingBox=new THREE.Box3(new THREE.Vector3(x0,-1,z0),new THREE.Vector3(x1,8,z1));
      g.boundingSphere=g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const mesh=new THREE.Mesh(g,landMaterial); terrain.add(mesh);
      lodMeshes.push({mesh,spec,level:3,pending:false,coarse:g});
    }
  }
  async function update(camera,now) {
    if(disposed||now-lastUpdate<350) return;
    lastUpdate=now;
    const sorted=[...lodMeshes].sort((a,b)=>a.mesh.geometry.boundingSphere.center.distanceTo(camera.position)-b.mesh.geometry.boundingSphere.center.distanceTo(camera.position));
    for(const entry of sorted) {
      const [x0,z0,x1,z1]=entry.spec.bounds;
      const d=Math.hypot(Math.max(x0-camera.position.x,0,camera.position.x-x1),camera.position.y,Math.max(z0-camera.position.z,0,camera.position.z-z1));
      const desired=d<38?0:d<85?1:d<180?2:3;
      if(entry.pending||entry.level===desired||loading>=3) continue;
      // Hysteresis prevents oscillation around an LOD threshold.
      if(Math.abs(d-[38,85,180][Math.min(desired,entry.level)])<5) continue;
      if(desired===3) { if(entry.mesh.geometry!==entry.coarse)entry.mesh.geometry.dispose(); entry.mesh.geometry=entry.coarse;entry.level=3;continue; }
      entry.pending=true;loading++;
      const spec=entry.spec.levels[desired];
      pack.loadAsset(spec.file).then(buffer=>{
        if(disposed)return;
        const g=decode(buffer,spec),p=g.attributes.position,c=new Float32Array(p.count*3);
        for(let i=0;i<p.count;i++){const h=p.getY(i)*100;color.copy(low).lerp(h<48?middle:high,THREE.MathUtils.smoothstep(h,h<48?24:48,h<48?48:110));color.toArray(c,i*3);}
        g.setAttribute('color',new THREE.BufferAttribute(c,3));
        if(entry.mesh.geometry!==entry.coarse)entry.mesh.geometry.dispose();
        entry.mesh.geometry=g;entry.level=desired;
        delete pack.buffers[spec.file];
      }).catch(error=>{ if(error.name!=='AbortError')console.error(error); }).finally(()=>{entry.pending=false;loading--;});
    }
  }
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.name = 'wuhan-water';
  const group = new THREE.Group();
  group.add(terrain, water);
  return { group, terrain, stableTerrain, water, landMaterial, waterMaterial, update,
    dispose() { disposed=true; stableTerrain.traverse(object => object.geometry?.dispose()); for(const e of lodMeshes)e.coarse.dispose(); terrain.traverse(object => object.geometry?.dispose()); terrainGeometry.dispose(); waterGeometry.dispose(); landMaterial.dispose(); waterMaterial.dispose(); }
  };
}
