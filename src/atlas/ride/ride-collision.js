import {insideRing} from '../geo/projection.js';

export const BODY = Object.freeze({radius:.0044,half:.0058,height:.0175,maxSlope:26*Math.PI/180});
export class SpatialGrid {
  constructor(size=1){this.size=size;this.cells=new Map();}
  add(item,bounds){
    item.cells=[];
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
    this.lastBlock=null;this.nearestTrafficDistance=null;
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
    for(const def of this.places.definitions)for(const c of def.components){
      const geometry=c.footprint??def.footprint;
      const polys=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
      for(const rings of polys)this.addPolygon({id:def.id,kind:'landmark',rings,bottom:Math.min(...(c.terrainRange??[c.baseElevation]))/100,top:(c.baseElevation+c.height)/100});
    }
    // Actual published deck profiles and structure metadata, never a bridge-wide wall.
    for(const bridge of this.urban.bridges.children)for(const o of bridge.userData.obstacles){
      const item={...o,bottom:o.center[1]-o.size[1]/2,top:o.center[1]+o.size[1]/2};
      const r=Math.hypot(o.size[0],o.size[2])/2;this.grid.add(item,[o.center[0]-r,o.center[2]-r,o.center[0]+r,o.center[2]+r]);
    }
    this.ready=true;
  }
  addPolygon(item){this.grid.add(item,bounds(item.rings));return item;}
  async prepare(x,z){
    await this.initialize();if(this.disposed)return;
    const load=(entry,road)=>{
      entry.lastUsed=performance.now();if(entry.loaded)return Promise.resolve();if(entry.promise)return entry.promise;
      entry.promise=this.pack.loadJSON(entry.spec.file).then(data=>{
        if(this.disposed)return;
        if(road){entry.data=data;
          for(const r of data){
            if(r.tunnel||!r.rendered||r.bridgeProfile)continue;
            let part=0,profile=[];
            const register=()=>{if(profile.length>1){const id='ride-'+r.id+'-'+part++;this.surface.register({id,kind:r.bridge?'bridge':'road',layerId:r.layerId,profile,width:r.width,traversable:r.access!=='no',rideAllowed:r.access!=='no'&&!/^(motorway|trunk)/.test(r.roadClass)});entry.items.push(id);}profile=[];};
            for(const p of r.profile){if(p)profile.push(p);else register();}register();
          }
        }else for(const b of data){
          if(b.landmarkReplacement)continue;
          entry.items.push(this.addPolygon({id:b.id,kind:'building',rings:b.rings,bottom:(Math.min(b.foundationMeters,...b.bottomMeters.flat())+b.minHeightMeters)/100,top:(b.foundationMeters+b.height)/100}));
        }
        if(this.pack.buffers)delete this.pack.buffers[entry.spec.file];entry.loaded=true;
      }).finally(()=>{entry.promise=null;});return entry.promise;
    };
    await Promise.all([...this.buildings.filter(e=>distance(e.spec.bounds,x,z)<8).map(e=>load(e,false)),...this.roads.filter(e=>distance(e.spec.bounds,x,z)<8).map(e=>load(e,true))]);
    for(const [entries,road] of [[this.buildings,false],[this.roads,true]])for(const e of entries){
      if(e.loaded&&distance(e.spec.bounds,x,z)>30){for(const item of e.items)road?this.surface.unregister(item):this.grid.remove(item);e.items=[];e.data=null;e.loaded=false;}
    }
  }
  covered(x,z){return !this.buildings.some(e=>!e.loaded&&distance(e.spec.bounds,x,z)<.025);}
  sample(x,z,y,id){const t=performance.now();const s=this.surface.sampleSurface(x,z,y,id);this.metrics.surfaceQueries++;this.metrics.surfaceQueryMs+=performance.now()-t;return s;}
  height(x,z,y,id){return this.sample(x,z,y,id)?.height;}
  blocked(x,z,y,r=BODY.radius,height=BODY.height){
    const t=performance.now();let result=null;
    for(const o of this.grid.near(x,z)){
      if(o.top<=y+.0008||o.bottom>=y+height)continue;
      if(o.rings?circlePolygon(x,z,r,o.rings):circleBox(x,z,r,o)){result=o;break;}
    }
    this.metrics.staticObstacleQueryMs+=performance.now()-t;return result;
  }
  validate(s,previous=s,dynamic=true){
    this.lastBlock=null;
    const support=this.sample(s.x,s.z,previous.y,previous.surfaceId);
    if(!support?.rideAllowed){this.lastBlock=support?.kind??'outside';return null;}
    if(support.normal[1]<Math.cos(BODY.maxSlope)){this.lastBlock='slope';return null;}
    if(Number.isFinite(previous.y)&&Math.abs(support.height-previous.y)>.003){this.lastBlock='layer-transition';return null;}
    for(const offset of [-BODY.half,0,BODY.half]){
      const x=s.x+Math.sin(s.heading)*offset,z=s.z+Math.cos(s.heading)*offset;
      if(!this.covered(x,z)){this.lastBlock='loading';return null;}
      const local=this.sample(x,z,support.height,support.surfaceId);
      if(!local?.rideAllowed||Math.abs(local.height-support.height)>.008||local.normal[1]<Math.cos(BODY.maxSlope)) {this.lastBlock=local?.kind??'edge';return null;}
      // Check both sides of the footprint, including shore and deck edges.
      for(const side of [-1,1]){
        const edge=this.sample(x+Math.cos(s.heading)*BODY.radius*side,z-Math.sin(s.heading)*BODY.radius*side,local.height,local.surfaceId);
        if(!edge?.rideAllowed||Math.abs(edge.height-local.height)>.008){this.lastBlock='edge';return null;}
      }
      const obstacle=this.blocked(x,z,local.height);if(obstacle){this.lastBlock=obstacle.kind;return null;}
    }
    if(dynamic){const t=performance.now();const hit=this.dynamics?.rideQuery?.({...s,y:support.height});this.metrics.dynamicQueryMs+=performance.now()-t;this.nearestTrafficDistance=hit?.distance??null;if(hit?.blocked){this.lastBlock='traffic';return null;}}
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
  dispose(){this.disposed=true;for(const e of this.roads)for(const id of e.items)this.surface.unregister(id);this.grid.cells.clear();}
}
