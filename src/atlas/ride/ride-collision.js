import {rideWindow,inRideWindow} from './ride-residency.js';
import {insideRing} from '../geo/projection.js';
import {createLandmark} from '../render/landmark-models.js';
import {landmarkCollision} from './landmark-collision.js';

export const BODY = Object.freeze({radius:.0044,half:.0058,height:.0175,maxSlope:26*Math.PI/180});
export class SpatialGrid {
  constructor(size=1){this.size=size;this.cells=new Map();}
  add(item,bounds){
    item.bounds=bounds;item.cells=[];
    for(let x=Math.floor((bounds[0]-.02)/this.size);x<=Math.floor((bounds[2]+.02)/this.size);x++)
      for(let z=Math.floor((bounds[1]-.02)/this.size);z<=Math.floor((bounds[3]+.02)/this.size);z++){
        const k=`${x},${z}`;if(!this.cells.has(k))this.cells.set(k,new Set());this.cells.get(k).add(item);item.cells.push(k);
      }
  }
  remove(item){for(const k of item.cells){const c=this.cells.get(k);c.delete(item);if(!c.size)this.cells.delete(k);}}
  near(x,z){return this.cells.get(`${Math.floor(x/this.size)},${Math.floor(z/this.size)}`)??[];}
}
export function circlePolygon(x,z,r,rings){
  if(insideRing(x,z,rings[0])&&!rings.slice(1).some(ring=>insideRing(x,z,ring)))return true;
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],d=dx*dx+dz*dz;
    const t=d?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/d)):0;
    if((x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2<r*r)return true;
  }
  return false;
}
export function circleBox(x,z,r,o){
  const dx=x-o.center[0],dz=z-o.center[2],angle=o.rotationY??0,c=Math.cos(angle),s=Math.sin(angle);
  const a=Math.max(Math.abs(dx*c-dz*s)-o.size[0]/2,0),b=Math.max(Math.abs(dx*s+dz*c)-o.size[2]/2,0);
  return a*a+b*b<r*r;
}
const distance=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]));
function bounds(rings){const points=rings.flat();return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
export class WuhanRideSurfaceAdapter {
  constructor({pack,surface,urban,places,dynamics}){
    Object.assign(this,{pack,surface,urban,places,dynamics});this.grid=new SpatialGrid();this.buildings=[];this.roads=[];this.ready=false;this.disposed=false;
    this.metrics={surfaceQueries:0,surfaceQueryMs:0,staticObstacleQueryMs:0,dynamicQueryMs:0,cameraCollisionMs:0};
    this.coverageCells=new Map();
    this.lastBlock=null;this.lastRejected=null;this.blockCounts={};this.blockEvents=[];this.nearestTrafficDistance=null;
  }
  async initialize(){
    if(!this.initializing)this.initializing=this.initializeOnce().catch(error=>{this.initializing=null;throw error;});return this.initializing;
  }
  async initializeOnce(){
    if(this.ready)return;
    await this.places.readyPromise;
    if(this.disposed)return;
    this.indexBytes=this.surface.enableFastSampling();
    this.buildings=this.pack.manifest.urban.buildingChunks.map(spec=>({spec,items:[],loaded:false,promise:null}));
    const index=await this.pack.loadJSON(this.pack.manifest.urban.roads);
    if(this.disposed)return;
    this.roads=index.chunks.map(spec=>({spec,items:[],loaded:false,promise:null}));
    for(const def of this.places.definitions){
      const visible=this.places.group?.children.find(o=>o.userData.placeId===def.id),model=visible??createLandmark(def);
      const shape=landmarkCollision(model);
      this.grid.add({id:def.id,kind:'building',buildingType:'landmark',source:def.components.map(c=>c.sourceId??def.id).join(','),...shape},shape.bounds);
      if(!visible)model.traverse(o=>o.geometry?.dispose());
    }
    this.ready=true;
  }
  addPolygon(item){this.grid.add(item,bounds(item.rings));return item;}
  async prepare(x,z,heading=0,speed=0){
    await this.initialize();if(this.disposed)return;
    const window=rideWindow(x,z,heading,speed);this.window=window;
    await Promise.all([this.urban.canonical?.prepareRide?this.urban.canonical.prepareRide(window):this.urban.canonical?.prepare(x,z),this.urban.prepareRide?.(window)]);
    const load=(entry,road)=>{
      entry.lastUsed=performance.now();if(entry.loaded)return Promise.resolve();if(entry.promise)return entry.promise;
      entry.promise=this.pack.loadJSON(entry.spec.file).then(data=>{
        if(this.disposed)return;
        if(road){entry.data=data;
          for(const r of this.urban.canonical?[]:data){
            if(r.tunnel||!r.rendered||r.bridgeProfile)continue;
            let part=0,profile=[];
            const register=()=>{if(profile.length>1){const id='ride-'+r.id+'-'+part++;this.surface.register({id,kind:r.bridge?'bridge':'road',layerId:r.layerId,profile,width:r.width,traversable:r.access!=='no',rideAllowed:r.access!=='no'&&!/^(motorway|trunk)/.test(r.roadClass)});entry.items.push(id);}profile=[];};
            for(const p of r.profile){if(p)profile.push(p);else register();}register();
          }
        }else for(const b of data){
          if(b.landmarkReplacement)continue;
          entry.items.push(this.addPolygon({id:b.id,kind:'building',source:b.sourceId??b.id,chunk:entry.spec.file,rings:b.rings,bottom:(b.minHeightMeters>0?b.foundationMeters+b.minHeightMeters:Math.min(b.foundationMeters,...b.bottomMeters.flat()))/100,top:(b.foundationMeters+b.height)/100}));
        }
        if(this.pack.buffers)delete this.pack.buffers[entry.spec.file];entry.loaded=true;
      }).finally(()=>{entry.promise=null;});return entry.promise;
    };
    await Promise.all([...this.buildings.filter(e=>inRideWindow(e.spec.bounds,window)).map(e=>load(e,false)),...this.roads.filter(e=>inRideWindow(e.spec.bounds,window)).map(e=>load(e,true))]);
    for(const [entries,road] of [[this.buildings,false],[this.roads,true]])for(const e of entries){
      if(e.loaded&&distance(e.spec.bounds,x,z)>30){for(const item of e.items)road?this.surface.unregister(item):this.grid.remove(item);e.items=[];e.data=null;e.loaded=false;}
    }
  }
  coverageIssue(x,z){
    const cx=Math.floor(x),cz=Math.floor(z),key=cx+','+cz;
    let cell=this.coverageCells.get(key);
    if(!cell){
      const overlaps=e=>{const b=e.spec.bounds;return b[0]<cx+1.025&&b[2]>cx-.025&&b[1]<cz+1.025&&b[3]>cz-.025;};
      cell={roads:(this.urban?.canonical?.entries??[]).filter(overlaps),buildings:this.buildings.filter(overlaps)};
      this.coverageCells.set(key,cell);
    }
    // Cache only spatial membership; residency flags remain live on every query.
    const road=cell.roads.find(e=>!e.geometry&&distance(e.spec.bounds,x,z)<.025);
    if(road)return {id:road.spec.file,source:'canonical-residency',bounds:road.spec.bounds};
    const building=cell.buildings.find(e=>(!e.loaded||this.urban?.buildingResident?.(e.spec.file)===false)&&distance(e.spec.bounds,x,z)<.025);
    return building?{id:building.spec.file,source:'building-visual/collision-residency',bounds:building.spec.bounds}:null;
  }
  covered(x,z){return !this.coverageIssue(x,z);}
  sample(x,z,y,id){const t=performance.now();const s=this.surface.sampleSurface(x,z,y,id);this.metrics.surfaceQueries++;this.metrics.surfaceQueryMs+=performance.now()-t;return s;}
  height(x,z,y,id){return this.sample(x,z,y,id)?.height;}
  blocked(x,z,y,r=BODY.radius,height=BODY.height){
    const t=performance.now();let result=null;
    for(const o of this.grid.near(x,z)){
      if(o.kind!=='building')continue;
      if(o.chunk&&this.urban?.buildingResident?.(o.chunk)===false)continue;
      if(o.top<=y+.0008||o.bottom>=y+height)continue;
      if(o.intersects?o.intersects(x,z,y,r,height):o.rings?circlePolygon(x,z,r,o.rings):circleBox(x,z,r,o)){result=o;break;}
    }
    this.metrics.staticObstacleQueryMs+=performance.now()-t;return result;
  }
  reject(kind,s,previous,candidate,object=null){
    this.lastBlock=kind;
    const normal=candidate?.normal??null;
    this.lastRejected={blockReason:kind,blockKind:kind,buildingId:object?.id??null,sourceId:object?.source??null,blockId:object?.id??candidate?.surfaceId??null,blockSource:object?.source??candidate?.source??(candidate?.canonical?'canonical-road-triangles':'terrain/water'),blockBounds:object?.bounds??candidate?.bounds??null,blockPosition:{x:s.x,y:candidate?.height??s.y,z:s.z},distance:object?.bounds?distance(object.bounds,s.x,s.z)*100:0,surfaceId:candidate?.surfaceId??null,layerId:candidate?.layerId??null,candidateSurface:candidate??null,previousSurfaceId:previous.surfaceId??null,previousLayerId:previous.layerId??null,normal,slopeDegrees:normal?Math.acos(Math.max(-1,Math.min(1,normal[1])))*180/Math.PI:null};
    return null;
  }
  recordBlock(){
    if(!this.lastBlock)return;
    this.blockCounts[this.lastBlock]=(this.blockCounts[this.lastBlock]??0)+1;
    this.blockEvents.push(this.lastRejected);if(this.blockEvents.length>2000)this.blockEvents.shift();
  }
  resetBlocks(){this.lastBlock=null;this.lastRejected=null;this.blockCounts={};this.blockEvents=[];}
  probe(state){
    // Diagnostic queries must not replace the last real movement rejection.
    const saved={lastBlock:this.lastBlock,lastRejected:this.lastRejected,nearestTrafficDistance:this.nearestTrafficDistance};
    try{return {surface:this.sample(state.x,state.z,state.y,state.surfaceId),valid:!!this.validate(state,state),collision:this.lastBlock};}
    finally{Object.assign(this,saved);}
  }
  residency(){
    const roads=this.urban.canonical?.residency?.()??{},visual=this.urban.rideBuildingResidency?.()??{};
    const pendingBuildingLoads=this.buildings.filter(e=>e.promise).map(e=>e.spec.file);
    return {...roads,...visual,residentBuildingChunks:this.buildings.filter(e=>e.loaded).map(e=>e.spec.file),pendingBuildingLoads,pendingRideLoads:[...(roads.pendingRoadLoads??[]),...(visual.pendingVisualLoads??[]),...pendingBuildingLoads],window:this.window};
  }
  collisionProbe(state,radius=.3){
    const found=new Set();for(const bin of this.grid.cells.values())for(const o of bin)if(distance(o.bounds,state.x,state.z)<=radius)found.add(o);
    return [...found].filter(o=>o.kind==='building'&&(!o.chunk||this.urban?.buildingResident?.(o.chunk)!==false)).map(o=>({...o,cells:undefined,intersects:undefined,section:undefined,segments:o.section?.(state.y+BODY.height/2),distance:distance(o.bounds,state.x,state.z)*100,visualResident:o.chunk?this.urban?.buildingResident?.(o.chunk)??null:true,collisionResident:true}));
  }
  surfaceProbe(s){return {position:{x:s.x,y:s.y,z:s.z},selected:this.sample(s.x,s.z,s.y,s.surfaceId),terrain:this.surface.sample?.(s.x,s.z),canonical:this.surface.getRoadTriangles?.().candidates(s.x,s.z)??[]};}
  validate(s,previous=s){
    this.lastBlock=null;
    if(![s.x,s.z,s.y,s.heading].every(Number.isFinite))return this.reject('fatal-invalid-state',s,previous,null);
    const queryStart=performance.now();
    let support=this.surface.chooseRideSurface?this.surface.chooseRideSurface(s,previous):this.sample(s.x,s.z,previous.y,previous.surfaceId);
    if(this.surface.chooseRideSurface){this.metrics.surfaceQueries++;this.metrics.surfaceQueryMs+=performance.now()-queryStart;}
    if(!support)return this.reject('dataset-end',s,previous,null);
    if(!Number.isFinite(support.height))return this.reject('fatal-invalid-state',s,previous,support);
    // Canonical bridge chunks are prefetched and pinned by prepareRide().
    // Never fabricate a support plane or turn pending residency into a wall.
    support={...support,rideAllowed:true,traversable:true};
    // The capsule is tested at its supported body height, not a neighbouring
    // deck's height. Water, road edges, steep slopes and layers never reject.
    for(const offset of [-BODY.half,0,BODY.half]){
      const x=s.x+Math.sin(s.heading)*offset,z=s.z+Math.cos(s.heading)*offset;
      const obstacle=this.blocked(x,z,support.height);
      if(obstacle)return this.reject('building',{...s,x,z},previous,support,obstacle);
    }
    return support;
  }
  cameraBlocked(x,y,z,state){
    if(this.blocked(x,z,y-.0015,.0015,.003))return 'structure';
    const ground=this.sample(x,z,state.y,state.surfaceId);
    if(ground&&y<ground.height+.001)return 'ground';
    // All overhead deck slabs block the boom, including decks above a lower rider.
    if(this.surface.intersectsDeck(x,y,z))return 'deck';
    return null;
  }
  resetMetrics(){for(const k of Object.keys(this.metrics))this.metrics[k]=0;}
  dispose(){this.disposed=true;for(const e of this.roads)for(const id of e.items)this.surface.unregister(id);this.grid.cells.clear();this.coverageCells.clear();}
}
