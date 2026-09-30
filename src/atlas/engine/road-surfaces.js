import * as THREE from 'three';
import {inRideWindow,nearProfile} from '../ride/ride-residency.js';
import {decode} from '../render/geography.js';

// Reference-counted by residency, not by two independent loaders: Ride and urban
// rendering request the SAME chunk, arrays and feature registry.
export function createRoadSurfaces(pack,surface,materials){
  const group=new THREE.Group(),entries=[];let index=null,disposed=false;const pinnedBridges=new Set();
  const ready=(async()=>{
    if(!pack.manifest.urban.surfaces)return;
    index=await pack.loadJSON(pack.manifest.urban.surfaces);
    surface.setRideAxes?.(index.bridges);
    surface.setBridgeConnections?.([...(index.audit?.rideConnectionPatches??[]),...(index.audit?.transitions??[])]);
    for(const spec of index.chunks)entries.push({spec,promise:null,geometry:null,meshes:[],ids:[],lastUsed:0});
    await Promise.all(entries.filter(e=>e.spec.bridgeIds?.length).map(load));
  })();
  async function load(entry){
    entry.lastUsed=performance.now();if(entry.geometry)return;if(entry.promise)return entry.promise;
    entry.promise=(async()=>{
      const [data,metadata]=await Promise.all([pack.loadAsset(entry.spec.file),pack.loadJSON(entry.spec.metadata)]);
      if(disposed)return;
      const geometry=decode(data,entry.spec);entry.geometry=geometry;
      const positions=geometry.attributes.position.array,indices=geometry.index.array;
      geometry.clearGroups();
      const groups=[[],[],[],[]];
      for(const feature of metadata.features){
        groups[Math.max(0,['express','arterial','local','minor'].indexOf(feature.group))].push(feature);
      }
      // Material batching changes ranges, never triangles. Publish the SAME
      // final index array to both GPU and CPU, preserving feature query order.
      const renderIndices=new Uint32Array(indices.length),starts=new Map();let offset=0;
      groups.forEach((features,material)=>{const start=offset;for(const f of features){starts.set(f.id,offset/3);const count=f.triangleCount*3;renderIndices.set(indices.subarray(f.triangleStart*3,f.triangleStart*3+count),offset);offset+=count;}if(offset>start)geometry.addGroup(start,offset-start,material);});
      geometry.setIndex(new THREE.BufferAttribute(renderIndices,1));
      for(const feature of metadata.features){surface.registerTriangles({...feature,triangleStart:starts.get(feature.id)},positions,renderIndices);entry.ids.push(feature.id);}
      const mesh=new THREE.Mesh(geometry,materials);group.add(mesh);entry.meshes.push(mesh);
      delete pack.buffers[entry.spec.file];delete pack.buffers[entry.spec.metadata];
    })().finally(()=>entry.promise=null);return entry.promise;
  }
  const distance=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]));
  return {group,ready,setDebug(value){if(!['localhost','127.0.0.1'].includes(location.hostname))return false;for(const m of materials)m.wireframe=!!value;return true;},get index(){return index;},entries,
    async prepare(x,z,radius=8){await ready;if(disposed)return;await Promise.all(entries.filter(e=>distance(e.spec.bounds,x,z)<radius).map(load));},
    async prepareRide(window){
      await ready;if(disposed)return;
      for(const bridge of index.bridges){
        if(nearProfile(bridge.profile,window.x,window.z,pinnedBridges.has(bridge.id)?8:window.lookahead+4))pinnedBridges.add(bridge.id);
        else pinnedBridges.delete(bridge.id);
      }
      const ends=index.bridges.filter(b=>pinnedBridges.has(b.id)).flatMap(b=>[b.profile[0],b.profile.at(-1)]);
      for(const e of entries)e.ridePinned=inRideWindow(e.spec.bounds,window)||[...e.spec.bridgeIds,...(e.spec.bridgeAccessIds??[])].some(id=>pinnedBridges.has(id))||ends.some(p=>distance(e.spec.bounds,p[0],p[2])<4);
      await Promise.all(entries.filter(e=>e.ridePinned).map(load));
    },
    releaseRide(){pinnedBridges.clear();for(const e of entries)e.ridePinned=false;},
    residency(){return {residentRoadChunks:entries.filter(e=>e.geometry&&e.ridePinned).map(e=>e.spec.file),residentBridgeChunks:entries.filter(e=>e.geometry&&e.spec.bridgeIds.some(id=>pinnedBridges.has(id))).map(e=>e.spec.file),pinnedBridges:[...pinnedBridges],pendingRoadLoads:entries.filter(e=>e.promise&&e.ridePinned).map(e=>e.spec.file)};},
    update(camera,now,target){
      if(!index||disposed)return;
      let pending=entries.filter(e=>e.promise).length;
      const view=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const sorted=entries.map(e=>({e,d:distance(e.spec.bounds,target.x,target.z)})).sort((a,b)=>a.d-b.d);
      for(const {e,d} of sorted){
        const b=e.spec.bounds,visible=d<Math.max(15,camera.position.y*12)&&view.intersectsBox(new THREE.Box3(new THREE.Vector3(b[0],0,b[1]),new THREE.Vector3(b[2],e.spec.maxHeight??4,b[3])));
        if(visible||d<10||e.ridePinned)e.lastUsed=now;
        for(const mesh of e.meshes)mesh.visible=visible||!!e.ridePinned;
        if((visible||d<10||e.ridePinned)&&!e.geometry&&!e.promise&&pending<3){pending++;load(e).catch(console.error);}
        if(e.geometry&&!e.ridePinned&&d>35&&now-e.lastUsed>30000&&!e.promise){for(const id of e.ids)surface.unregisterTriangles(id);e.ids=[];for(const mesh of e.meshes)mesh.removeFromParent();e.meshes=[];e.geometry.dispose();e.geometry=null;}
      }
    },
    dispose(){disposed=true;for(const e of entries){for(const id of e.ids)surface.unregisterTriangles(id);e.geometry?.dispose();}group.clear();}
  };
}
