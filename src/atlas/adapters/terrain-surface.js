import * as THREE from 'three';
import { waterAt, waterHeight } from '../geo/projection.js';

/** Stable CPU ground geometry, independent of visible LOD; layered deck registry. */
export function createTerrainSurface(terrain, waters, projection, bounds) {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surfaces = new Map();
  const cells = new Map();
  function keysFor(surface) {
    const p=surface.profile,margin=surface.width/200;
    const xs=p.map(v=>v[0]),zs=p.map(v=>v[2]),keys=[];
    for(let x=Math.floor((Math.min(...xs)-margin)/8);x<=Math.floor((Math.max(...xs)+margin)/8);x++)for(let z=Math.floor((Math.min(...zs)-margin)/8);z<=Math.floor((Math.max(...zs)+margin)/8);z++)keys.push(`${x},${z}`);
    return keys;
  }
  const api = {
    register(surface) { if(surfaces.has(surface.id))api.unregister(surface.id);surface.cells=keysFor(surface);surfaces.set(surface.id, surface);for(const key of surface.cells){if(!cells.has(key))cells.set(key,new Set());cells.get(key).add(surface.id);} },
    unregister(id) { const s=surfaces.get(id);if(s)for(const key of s.cells){cells.get(key)?.delete(id);}surfaces.delete(id); },
    sample(x, z) {
      const [lon, lat] = projection.inverse(x, z);
      if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) return null;
      const water = waterAt(x, z, waters);
      if (water) {
        const model=water.surface;
        const normal=model ? new THREE.Vector3(model.gradient*model.direction[0],1,model.gradient*model.direction[1]).normalize().toArray() : [0,1,0];
        return { kind: 'water', height: waterHeight(water, x, z), surfaceId: water.id, layerId: 'water', traversable: false, rideAllowed: false, normal };
      }
      ray.set(new THREE.Vector3(x, 100, z), down);
      const hit = ray.intersectObject(terrain, true)[0];
      return hit ? { kind: 'ground', height: hit.point.y, surfaceId: 'terrain', layerId: 'ground', traversable: true, rideAllowed: true, normal: hit.face.normal.toArray() } : null;
    },
    sampleSurface(x, z, referenceY, previousSurfaceId) {
      const ground = api.sample(x,z);
      const candidates = ground ? [{ ...ground, kind: ground.kind === 'ground' ? 'terrain' : ground.kind }] : [];
      for (const id of cells.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)??[]) {
        const s=surfaces.get(id);
        const p=s.profile;
        for(let i=1;i<p.length;i++) {
          const a=p[i-1],b=p[i], dx=b[0]-a[0],dz=b[2]-a[2],len2=dx*dx+dz*dz;
          if (!len2) continue;
          const t=((x-a[0])*dx+(z-a[2])*dz)/len2;
          if(t<0||t>1||Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)>s.width/200) continue;
          const slope=(b[1]-a[1])/Math.sqrt(len2), normal=new THREE.Vector3(-dx/Math.sqrt(len2)*slope,1,-dz/Math.sqrt(len2)*slope).normalize();
          candidates.push({height:a[1]+t*(b[1]-a[1]),normal:normal.toArray(),surfaceId:s.id,kind:s.kind,layerId:s.layerId,traversable:s.traversable,rideAllowed:s.rideAllowed});
          break;
        }
      }
      if(referenceY===undefined) return candidates.find(c=>c.surfaceId==='terrain'||c.kind==='water')??null;
      candidates.sort((a,b)=>Math.abs(a.height-referenceY)-Math.abs(b.height-referenceY));
      const previous=candidates.find(c=>c.surfaceId===previousSurfaceId);
      return previous && Math.abs(previous.height-referenceY)<.03 ? previous : candidates[0]??null;
    },
  };
  return api;
}
