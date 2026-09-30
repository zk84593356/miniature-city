import * as THREE from 'three';
import {inRideWindow} from '../ride/ride-residency.js';
import { decode } from './geography.js';
import { createBridge } from './bridges.js';
import {createVegetation} from './vegetation.js';
import {createRoadSurfaces} from '../engine/road-surfaces.js';

export function createUrban(pack,surface) {
  const group=new THREE.Group(),buildings=new THREE.Group(),roads=new THREE.Group(),bridges=new THREE.Group();
  group.add(roads,buildings,bridges);
  const vegetation=createVegetation(pack);group.add(vegetation.group);
  const material=new THREE.MeshStandardMaterial({color:'#d7d4c8',roughness:.88,metalness:.03,side:THREE.DoubleSide});
  const roadMaterials=['#aaa99a','#b8b6a6','#c6c3b0','#ccc8b5'].map(color=>new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));
  const canonical=pack.manifest.urban?.surfaces?createRoadSurfaces(pack,surface,roadMaterials):null;
  if(canonical)group.add(canonical.group);
  const entries=(pack.manifest.urban?.buildingChunks??[]).map(spec=>({spec,mesh:null,pending:false,level:1,lastSeen:0}));
  const buildingByFile=new Map(entries.map(e=>[e.spec.file,e]));
  const roadEntries=(canonical?[]:pack.manifest.urban?.roadMeshes??[]).map(spec=>({spec,mesh:null,pending:false,lastSeen:0}));
  let disposed=false,active=0,activeRoads=0,activeTopology=0,lastUpdate=0,ready=false;
  let topologyEntries=[];
  const errors=[];
  const stats={roadsReady:false,bridgesReady:false,loadedBuildingChunks:0,totalBuildingChunks:entries.length,buildingTriangles:0,buildingCount:0};
  const report=error=>{if(error.name!=='AbortError'){errors.push(error.message);console.error(error);}};
  async function load() {
    if(!pack.manifest.urban){ready=true;return;}
    // The main frame loop is already painting terrain before these requests begin.
    const definitions=await pack.loadJSON(pack.manifest.urban.bridges);
    await canonical?.ready;
    if(disposed)return;
    for(const bridge of definitions){const revised=canonical?.index.bridges.find(b=>b.id==='bridge-'+bridge.id);bridges.add(createBridge({...bridge,...(revised?{profile:revised.profile,foundationProfile:revised.foundationProfile,accessProfiles:revised.accessProfiles,canonicalSurface:true}:{})},surface));}
    stats.bridgesReady=true;stats.surfacesReady=!!canonical;ready=true;
    const index=await pack.loadJSON(pack.manifest.urban.roads);
    topologyEntries=(canonical?[]:index.chunks??[]).map(spec=>({spec,loaded:false,pending:false,ids:[],lastSeen:0}));
    delete pack.buffers[pack.manifest.urban.roads];
  }
  async function loadTopology(entry) {
    entry.pending=true;activeTopology++;
    try {
      const network=await pack.loadJSON(entry.spec.file);if(disposed)return;
      for(const road of network) {
        if(road.tunnel||!road.rendered||road.bridgeProfile)continue;
        let segment=[],part=0;
        const register=()=>{if(segment.length>1){const id=road.id+'-'+part++;surface.register({id,kind:road.bridge?'bridge':'road',layerId:road.layerId,profile:segment,width:road.width,traversable:road.access!=='no',rideAllowed:road.access!=='no'&&!['motorway','trunk'].includes(road.roadClass),source:road.sourceId});entry.ids.push(id);}segment=[];};
        for(const p of road.profile){if(p)segment.push(p);else register();}register();
      }
      delete pack.buffers[entry.spec.file];entry.loaded=true;stats.surfacesReady=true;
    } catch(error){report(error);} finally {entry.pending=false;activeTopology--;}
  }
  load().catch(report);
  async function loadBuilding(entry,level){
    if(entry.promise){await entry.promise;if(entry.level===level)return;}
    if(entry.mesh&&entry.level===level)return;
    entry.pending=true;active++;
    const spec=entry.spec.levels[level];
    entry.promise=pack.loadAsset(spec.file).then(buffer=>{
      if(disposed)return;
      const geometry=decode(buffer,spec);
      if(entry.mesh){entry.mesh.geometry.dispose();entry.mesh.geometry=geometry;}
      else{entry.mesh=new THREE.Mesh(geometry,material);buildings.add(entry.mesh);}
      entry.level=level;entry.lastSeen=performance.now();delete pack.buffers[spec.file];
    }).finally(()=>{entry.pending=false;entry.promise=null;active--;});
    return entry.promise;
  }
  function update(camera,now,target) {
    if(!ready||disposed||now-lastUpdate<300)return;lastUpdate=now;
    vegetation.update(camera,now,target);canonical?.update(camera,now,target);if(canonical)stats.roadsReady=canonical.entries.some(e=>e.geometry);
    const view=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const roadQueue=roadEntries.map(entry=>{const [x0,z0,x1,z1]=entry.spec.bounds;const box=new THREE.Box3(new THREE.Vector3(x0,0,z0),new THREE.Vector3(x1,6,z1));return {entry,d:box.distanceToPoint(camera.position),visible:view.intersectsBox(box)};}).sort((a,b)=>a.d-b.d);
    for(const {entry,d,visible} of roadQueue){
      if(visible||entry.ridePinned)entry.lastSeen=now;
      if(entry.mesh)entry.mesh.visible=visible||!!entry.ridePinned;
      if(!visible||d>700||entry.mesh||entry.pending||activeRoads>=3)continue;
      entry.pending=true;activeRoads++;
      pack.loadAsset(entry.spec.file).then(buffer=>{if(disposed)return;entry.mesh=new THREE.Mesh(decode(buffer,entry.spec),roadMaterials[['express','arterial','local','minor'].indexOf(entry.spec.group)]);roads.add(entry.mesh);delete pack.buffers[entry.spec.file];stats.roadsReady=true;}).catch(report).finally(()=>{entry.pending=false;activeRoads--;});
    }
    stats.roadTriangles=canonical?canonical.entries.filter(e=>e.meshes.some(m=>m.visible)).reduce((n,e)=>n+(e.geometry?.index.count??0)/3,0):roadEntries.filter(e=>e.mesh?.visible).reduce((n,e)=>n+e.mesh.geometry.index.count/3,0);
    const sorted=entries.map(entry=>{
      const [x0,z0,x1,z1]=entry.spec.bounds;
      const box=new THREE.Box3(new THREE.Vector3(x0,0,z0),new THREE.Vector3(x1,6,z1));
      return {entry,d:box.distanceToPoint(camera.position),visible:view.intersectsBox(box)};
    }).sort((a,b)=>a.d-b.d);
    for(const {entry,d,visible} of sorted) {
      if(visible||entry.ridePinned)entry.lastSeen=now;
      if(entry.mesh)entry.mesh.visible=visible||!!entry.ridePinned;
      // Whole-city views retain real outlines; no random far-field proxies.
      if(!stats.roadsReady||!visible||d>700||entry.pending||active>=2)continue;
      const level=entry.ridePinned||d<55?0:1;
      if(entry.mesh&&entry.level===level)continue;
      loadBuilding(entry,level).catch(report);
    }
    // Bound GPU residency after exploration while keeping a long reuse window.
    for(const entry of roadEntries)if(entry.mesh&&!entry.ridePinned&&now-entry.lastSeen>30000&&!entry.pending){roads.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh=null;}
    for(const entry of entries)if(entry.mesh&&!entry.ridePinned&&now-entry.lastSeen>30000&&!entry.pending){buildings.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh=null;}
    const nearby=topologyEntries.map(entry=>{
      const match=/road-network-(\d+)-(\d+)/.exec(entry.spec.file);
      const b=entry.spec.bounds??[(Number(match[1])-50)*20,(Number(match[2])-50)*20,(Number(match[1])-49)*20,(Number(match[2])-49)*20];
      return {entry,d:Math.hypot(Math.max(b[0]-target.x,0,target.x-b[2]),Math.max(b[1]-target.z,0,target.z-b[3]))};
    }).sort((a,b)=>a.d-b.d);
    for(const {entry,d} of nearby){
      if(d<45){entry.lastSeen=now;if(!entry.loaded&&!entry.pending&&activeTopology<2)loadTopology(entry);}
      else if(entry.loaded&&now-entry.lastSeen>30000){entry.ids.forEach(id=>surface.unregister(id));entry.ids=[];entry.loaded=false;}
    }
    stats.loadedSurfaceChunks=canonical?canonical.entries.filter(e=>e.geometry).length:topologyEntries.filter(e=>e.loaded).length;
    stats.loadedBuildingChunks=entries.filter(e=>e.mesh).length;
    stats.buildingCount=entries.filter(e=>e.mesh?.visible).reduce((n,e)=>n+e.spec.count,0);
    stats.buildingTriangles=entries.filter(e=>e.mesh?.visible).reduce((n,e)=>n+e.mesh.geometry.index.count/3,0);
  }
  return {group,update,
    async prepareRide(window){
      for(const e of entries)e.ridePinned=inRideWindow(e.spec.bounds,window);
      await Promise.all(entries.filter(e=>e.ridePinned).map(e=>{e.lastSeen=performance.now();return loadBuilding(e,0);}));
    },
    releaseRide(){for(const e of entries)e.ridePinned=false;canonical?.releaseRide();},
    buildingResident(file){return !!buildingByFile.get(file)?.mesh;},
    rideBuildingResidency(){return {visualBuildingChunks:entries.filter(e=>e.mesh&&e.ridePinned).map(e=>e.spec.file),pendingVisualLoads:entries.filter(e=>e.pending&&e.ridePinned).map(e=>e.spec.file)};},
    bridges,canonical,vegetation,buildingMaterial:material,stats,errors,get ready(){return ready;},
    dispose(){disposed=true;vegetation.dispose();canonical?.dispose();group.traverse(o=>{o.geometry?.dispose();});material.dispose();roadMaterials.forEach(m=>m.dispose());bridges.traverse(o=>o.material?.dispose());},
  };
}
