import * as THREE from 'three';
import { waterAt, waterHeight } from '../geo/projection.js';
import { createTerrainIndex, createWaterIndex } from './terrain-index.js';
import {createRoadTriangleIndex} from './road-triangles.js';

/** Stable CPU ground geometry, independent of visible LOD; layered deck registry. */
export function createTerrainSurface(terrain, waters, projection, bounds) {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const surfaces = new Map();
  const cells = new Map();
  let fastTerrain=null,fastWater=null;
  const segments=new Map();let bridgeConnections=[];const rideAxes=new Map();
  const roadTriangles=createRoadTriangleIndex();
  function indexSegments(s){
    s.segmentCells=[];
    s.ends=[s.profile[0],s.profile[1],s.profile.at(-2),s.profile.at(-1)];
    for(let i=1;i<s.profile.length;i++){
      const a=s.profile[i-1],b=s.profile[i],margin=s.width/200;
      const segment={s,a,b,first:i===1,last:i===s.profile.length-1};
      for(let x=Math.floor((Math.min(a[0],b[0])-margin)/.5);x<=Math.floor((Math.max(a[0],b[0])+margin)/.5);x++)
        for(let z=Math.floor((Math.min(a[2],b[2])-margin)/.5);z<=Math.floor((Math.max(a[2],b[2])+margin)/.5);z++){
          const key=`${x},${z}`;if(!segments.has(key))segments.set(key,new Set());segments.get(key).add(segment);s.segmentCells.push([key,segment]);
        }
    }
  }
  function keysFor(surface) {
    const p=surface.profile,margin=surface.width/200;
    const xs=p.map(v=>v[0]),zs=p.map(v=>v[2]),keys=[];
    for(let x=Math.floor((Math.min(...xs)-margin)/8);x<=Math.floor((Math.max(...xs)+margin)/8);x++)for(let z=Math.floor((Math.min(...zs)-margin)/8);z<=Math.floor((Math.max(...zs)+margin)/8);z++)keys.push(`${x},${z}`);
    return keys;
  }
  const api = {
    setRideAxes(definitions){
      rideAxes.clear();const profiles=new Map();for(const b of definitions){profiles.set(b.id,b);for(const r of b.accessProfiles??[])profiles.set(r.id,r);}
      for(const r of profiles.values())for(let i=1;i<r.profile.length;i++){
        const a=r.profile[i-1],b=r.profile[i],entry={id:r.id,a,b,width:r.width};
        for(let x=Math.floor((Math.min(a[0],b[0])-.3)/.5);x<=Math.floor((Math.max(a[0],b[0])+.3)/.5);x++)for(let z=Math.floor((Math.min(a[2],b[2])-.3)/.5);z<=Math.floor((Math.max(a[2],b[2])+.3)/.5);z++){
          const key=x+','+z;if(!rideAxes.has(key))rideAxes.set(key,[]);rideAxes.get(key).push(entry);
        }
      }
    },
    chooseRideSurface(state,previous){
      const {x,z,heading}=state,selected=api.sampleSurface(x,z,previous.y,previous.surfaceId);
      if(selected?.kind!=='bridge')return selected;
      const alternatives=roadTriangles.candidates(x,z).filter(c=>c.surfaceId!==selected.surfaceId&&c.kind==='bridge'&&c.rideAllowed&&Math.abs(c.height-previous.y)<=.003&&api.allowsTransition(selected,c,x,z));
      if(!alternatives.length)return selected;
      const scores=new Map(),alignments=new Map();for(const {id,a,b} of rideAxes.get(Math.floor(x/.5)+','+Math.floor(z/.5))??[]){
        const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz;if(!d)continue;
        const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/d));
        const distance=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t),alignment=Math.abs((Math.sin(heading)*dx+Math.cos(heading)*dz)/Math.sqrt(d));
        const score=distance+.15*(1-alignment);if(score<(scores.get(id)??Infinity)){scores.set(id,score);alignments.set(id,alignment);}
      }
      let best=selected,score=scores.get(selected.surfaceId)??Infinity;
      for(const c of alternatives){
        const next=scores.get(c.surfaceId)??Infinity;if(next+.002<score&&(alignments.get(c.surfaceId)??0)>(alignments.get(selected.surfaceId)??0)+.001){best=c;score=next;}
      }
      return best;
    },
    allowsTransition(a,b,x,z){
      if(a?.kind!=='bridge'&&b?.kind!=='bridge'||a?.surfaceId===b?.surfaceId||!a?.canonical&&!b?.canonical)return true;
      if(roadTriangles.connected(a,b))return true;
      const ids=s=>new Set([s.surfaceId,...(s.roadIds??[])]),aa=ids(a),bb=ids(b),matches=(list,ids)=>list?.some(id=>ids.has(id));
      const groundAtJoin=(s,j)=>j.layerId?.startsWith('ground')&&(s.surfaceId==='terrain'||s.kind==='road'&&s.layerId?.startsWith('ground'))&&Math.abs((s.height??s.y)-j.height)<=.003;
      // A real ground junction can overlap another sourced ground road. The
      // shared top, not whichever coplanar road ID won sampling, defines entry.
      if(roadTriangles.candidates(x,z).some(j=>j.nodeId&&(matches(j.roadIds,aa)||groundAtJoin(a,j))&&(matches(j.roadIds,bb)||groundAtJoin(b,j))))return true;
      return bridgeConnections.some(p=>{
        const roads=[...(p.roadIds??[]),...(p.majorSurfaceId?[p.majorSurfaceId]:[]),...(p.bridge?['bridge-'+p.bridge]:[]),'ride-transition-'+p.node,'transition-'+p.node];
        const near=Math.hypot(x-p.position[0],z-p.position[1])<(p.radius??p.flatRadius??.3)+.01;
        // A ground join also admits its contiguous bare terrain crossfall.
        return near&&(matches(roads,aa)||p.kind==='ground'&&a.surfaceId==='terrain')&&(matches(roads,bb)||p.kind==='ground'&&b.surfaceId==='terrain');
      });
    },
    setBridgeConnections:connections=>{bridgeConnections=connections;},
    registerTriangles:(f,p,i)=>roadTriangles.register(f,p,i),
    unregisterTriangles:id=>roadTriangles.unregister(id),
    getRoadTriangles:()=>roadTriangles,
    enableFastSampling(){if(!fastTerrain){fastTerrain=createTerrainIndex(terrain);fastWater=createWaterIndex(waters);for(const s of surfaces.values())indexSegments(s);}return fastTerrain.bytes;},
    getSurfaces:()=>surfaces.values(),
    intersectsDeck(x,y,z){
      if(roadTriangles.intersectsDeck(x,y,z))return true;
      for(const {s,a,b} of segments.get(`${Math.floor(x/.5)},${Math.floor(z/.5)}`)??[]){
        if(s.kind!=='bridge')continue;
        const dx=b[0]-a[0],dz=b[2]-a[2],d=dx*dx+dz*dz,t=d?((x-a[0])*dx+(z-a[2])*dz)/d:-1;
        if(t<0||t>1)continue;const h=a[1]+t*(b[1]-a[1]);
        if(y>h+.001||y<h-.025)continue;
        if(Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz)<s.width/200)return true;
      }
      return false;
    },
    register(surface) { if(surfaces.has(surface.id))api.unregister(surface.id);surface.cells=keysFor(surface);surfaces.set(surface.id, surface);for(const key of surface.cells){if(!cells.has(key))cells.set(key,new Set());cells.get(key).add(surface.id);}if(fastTerrain)indexSegments(surface); },
    unregister(id) { const s=surfaces.get(id);if(s){for(const key of s.cells){cells.get(key)?.delete(id);}for(const [key,segment] of s.segmentCells??[]){const list=segments.get(key);list?.delete(segment);if(!list?.size)segments.delete(key);}}surfaces.delete(id); },
    sample(x, z) {
      const [lon, lat] = projection.inverse(x, z);
      if (lon < bounds[0] || lon > bounds[2] || lat < bounds[1] || lat > bounds[3]) return null;
      const water = fastWater?fastWater(x,z):waterAt(x, z, waters);
      if (water) {
        const model=water.surface;
        const normal=model ? new THREE.Vector3(model.gradient*model.direction[0],1,model.gradient*model.direction[1]).normalize().toArray() : [0,1,0];
        return { kind: 'water', height: waterHeight(water, x, z), surfaceId: water.id, layerId: 'water', traversable: true, rideAllowed: true, normal };
      }
      if(fastTerrain){const hit=fastTerrain.sample(x,z);return hit?{...hit,kind:'ground',surfaceId:'terrain',layerId:'ground',traversable:true,rideAllowed:true}:null;}
      ray.set(new THREE.Vector3(x, 100, z), down);
      const hit = ray.intersectObject(terrain, true)[0];
      return hit ? { kind: 'ground', height: hit.point.y, surfaceId: 'terrain', layerId: 'ground', traversable: true, rideAllowed: true, normal: hit.face.normal.toArray() } : null;
    },
    sampleSurface(x, z, referenceY, previousSurfaceId) {
      const ground = api.sample(x,z);
      const candidates = ground ? [{ ...ground, kind: ground.kind === 'ground' ? 'terrain' : ground.kind }] : [];
      const canonical=roadTriangles.candidates(x,z);
      // A rendered ground road replaces its underlying terrain support; using the
      // nearer bare terrain would put the wheels 8 cm inside the visible road.
      if(canonical.some(c=>c.kind==='road')&&ground?.kind==='ground')candidates.length=0;
      candidates.push(...canonical);
      if(fastTerrain){
        const seen=new Map();
        for(const {s,a,b,first,last} of segments.get(`${Math.floor(x/.5)},${Math.floor(z/.5)}`)??[]){
          const dx=b[0]-a[0],dz=b[2]-a[2],len2=dx*dx+dz*dz;if(!len2)continue;
          const rawT=((x-a[0])*dx+(z-a[2])*dz)/len2;
          if((first&&rawT< -1e-7)||(last&&rawT>1+1e-7))continue;
          // Internal joints use nearest-segment support across a bend. Clip the
          // whole strip at its true terminal planes (including neighbouring
          // segments), so those joints cannot extend the deck beyond either end.
          const [start,next,penultimate,end]=s.ends,radius=s.width/200;
          if(Math.hypot(start[0]-end[0],start[2]-end[2])>radius*2){
            if(Math.hypot(x-start[0],z-start[2])<radius*2&&(x-start[0])*(next[0]-start[0])+(z-start[2])*(next[2]-start[2])< -1e-10)continue;
            if(Math.hypot(x-end[0],z-end[2])<radius*2&&(x-end[0])*(end[0]-penultimate[0])+(z-end[2])*(end[2]-penultimate[2])>1e-10)continue;
          }
          const t=Math.max(0,Math.min(1,rawT));
          const distance=Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);
          if(distance>s.width/200||distance>=(seen.get(s.id)?.distance??Infinity))continue;
          const slope=(b[1]-a[1])/Math.sqrt(len2),n=Math.hypot(1,slope);
          seen.set(s.id,{distance,height:a[1]+t*(b[1]-a[1]),normal:[-dx/Math.sqrt(len2)*slope/n,1/n,-dz/Math.sqrt(len2)*slope/n],surfaceId:s.id,kind:s.kind,layerId:s.layerId,traversable:s.traversable,rideAllowed:s.rideAllowed});
        }
        candidates.push(...seen.values());
      }
      for (const id of fastTerrain?[]:cells.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)??[]) {
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
      // Access tags describe source roads; this virtual exploration mode allows
      // every support. Keep the original feature metadata intact in the pack.
      for(let i=0;i<candidates.length;i++)candidates[i]={...candidates[i],rideAllowed:true,traversable:true};
      if(referenceY===undefined) return candidates.find(c=>c.surfaceId==='terrain'||c.kind==='water')??null;
      // Coplanar junction ribbons can differ by Float32 roundoff. That must not
      // let a forbidden arm mask a rideable intersection at the SAME elevation.
      candidates.sort((a,b)=>{const d=Math.abs(a.height-referenceY)-Math.abs(b.height-referenceY);return Math.abs(d)>1e-6?d:Number(b.rideAllowed)-Number(a.rideAllowed);});
      const previous=candidates.find(c=>c.surfaceId===previousSurfaceId);
      if(previous?.rideAllowed&&(previous.kind==='bridge'||Math.abs(previous.height-referenceY)<=.003)){
        if(previous.kind==='terrain'||previous.kind==='road'){
          const top=candidates.find(c=>c.canonical&&c.rideAllowed&&Math.abs(c.height-referenceY)<=.003&&(c.kind==='road'&&previous.kind==='terrain'||c.kind==='bridge'&&(
            roadTriangles.connected(previous,c)||candidates.some(j=>j.nodeId&&j.roadIds?.some(id=>c.roadIds?.includes(id)))||bridgeConnections.some(p=>p.roadIds?.some(id=>c.roadIds?.includes(id))&&Math.hypot(x-p.position[0],z-p.position[1])<(p.radius??.3))
          )));
          if(top)return top;
        }
        return previous;
      }
      if(previousSurfaceId&&!previousSurfaceId.startsWith('rail')){
        const prior=roadTriangles.features.get(previousSurfaceId);
        const connected=candidates.find(c=>c.canonical&&c.rideAllowed&&Math.abs(c.height-referenceY)<=.003&&(!prior||prior.kind!=='bridge'||api.allowsTransition({...prior,surfaceId:prior.id},c,x,z)));
        if(connected)return connected;
      }
      return candidates[0]??null;
    },
  };
  return api;
}
