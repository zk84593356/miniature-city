import * as THREE from 'three';
import { createLandmark, disposeLandmarkMaterials } from './render/landmark-models.js';

export function createPlaces({pack,scene,surface,projection,camera,geography,urban,onFocus}){
  const group=new THREE.Group();group.name='wuhan-landmarks';scene.add(group);
  const labels=[],definitions=[],places=[],presets=[],routes=[],errors=[];
  const ray=new THREE.Raycaster(),screen=new THREE.Vector3(),direction=new THREE.Vector3();
  let ready=false,disposed=false,selected=null,lastLabels=0,route=null,stop=0,clearance={},groundCells={};
  const root=document.querySelector('#labels'),card=document.querySelector('#place-card'),journeys=document.querySelector('#journeys');
  const pickMeshes=[],collision=[];
  const stats={loaded:0,triangles:0,drawCalls:0,geometryBytes:0};
  const occlusionCamera=new THREE.Vector3(Infinity,Infinity,Infinity);let occlusionVersion=0,occlusionBuildings=-1;
  const blockerBox=new THREE.Box3(),boxHit=new THREE.Vector3();
  function blocked(raycaster,distance,placeId){
    const candidates=[];
    for(const root of [geography.stableTerrain,group,urban.group])root.traverse(o=>{
      if(!o.isMesh||!o.visible||o.userData.placeId===placeId)return;
      if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      blockerBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if(blockerBox.containsPoint(raycaster.ray.origin)||(raycaster.ray.intersectBox(blockerBox,boxHit)&&boxHit.distanceTo(raycaster.ray.origin)<distance))candidates.push(o);
    });
    const far=raycaster.far;raycaster.far=distance;
    const hit=raycaster.intersectObjects(candidates,false).length>0;raycaster.far=far;return hit;
  }
  function select(id,focus=true){
    const place=places.find(p=>p.id===id);if(!place)return;
    selected=id;
    document.querySelector('#place-type').textContent=place.kind==='bridge'?'跨江桥梁':place.kind==='nature'?'山水与城市':'武汉地标';
    document.querySelector('#place-name').textContent=place.nameZh;
    document.querySelector('#place-en').textContent=place.nameEn;
    document.querySelector('#place-description').textContent=place.description;
    document.querySelector('#place-district').textContent=place.district;
    const source=document.querySelector('#place-source');source.href=place.source;source.hidden=!/^https:\/\//.test(place.source);
    card.hidden=false;card.dataset.placeId=id;
    if(focus)onFocus(place.cameraPreset);
  }
  function close(){card.hidden=true;selected=null;}
  function addLabel(place,legacy=false){
    const element=document.createElement(legacy?'span':'button');element.className='label '+(legacy?place.kind:place.kind+' place-label');
    element.textContent=legacy?place.name:place.nameZh;
    if(!legacy){element.dataset.placeId=place.id;element.setAttribute('aria-label','浏览'+place.nameZh);element.addEventListener('click',()=>select(place.id));}
    root.append(element);
    const [x,z]=projection.forward(legacy?place.position:place.position);
    labels.push({place,legacy,element,position:new THREE.Vector3(...(legacy?[x,(surface.sample(x,z)?.height??.2)+.18,z]:place.anchor)),occluded:false,distance:Infinity});
  }
  pack.manifest.places.forEach(p=>addLabel(p,true));
  const closeButton=document.querySelector('#place-close');closeButton.addEventListener('click',close);
  document.querySelector('#place-refocus').addEventListener('click',()=>selected&&select(selected));
  document.querySelector('#journey-toggle').addEventListener('click',()=>{journeys.hidden=!journeys.hidden;});
  document.querySelector('#journey-close').addEventListener('click',()=>{journeys.hidden=true;});
  function moveRoute(delta){if(!route)return;stop=THREE.MathUtils.clamp(stop+delta,0,route.stops.length-1);onFocus(route.stops[stop]);const p=places.find(p=>p.cameraPreset===route.stops[stop]);if(p)select(p.id,false);else close();document.querySelector('#route-progress').textContent=`${route.name} · ${stop+1} / ${route.stops.length}`;document.querySelector('#route-prev').disabled=stop===0;document.querySelector('#route-next').disabled=stop===route.stops.length-1;}
  document.querySelector('#route-prev').addEventListener('click',()=>moveRoute(-1));document.querySelector('#route-next').addEventListener('click',()=>moveRoute(1));
  const readyPromise=(async()=>{
    if(!pack.manifest.landmarks){ready=true;return;}
    const [defs,poi,cameras,grid]=await Promise.all([pack.loadJSON(pack.manifest.landmarks.definitions),pack.loadJSON(pack.manifest.landmarks.places),pack.loadJSON(pack.manifest.landmarks.cameras),pack.loadJSON(pack.manifest.landmarks.clearance)]);
    if(disposed)return;
    definitions.push(...defs);places.push(...poi);presets.push(...cameras.presets);routes.push(...cameras.routes);
    clearance=grid.cells;
    groundCells=grid.groundCells;
    for(const def of defs){
      const model=createLandmark(def);group.add(model);model.traverse(o=>{if(o.isMesh){stats.triangles+=o.geometry.index.count/3;stats.drawCalls++;for(const a of [...Object.values(o.geometry.attributes),o.geometry.index])stats.geometryBytes+=a.array.byteLength;}});
      // Selection bounds remain separate from model meshes and future collision polygons.
      const box=model.userData.bounds.clone(),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const pick=new THREE.Mesh(new THREE.BoxGeometry(...size.toArray()),new THREE.MeshBasicMaterial({visible:false}));pick.position.copy(center);pick.userData.placeId=def.id;pick.updateMatrixWorld();pickMeshes.push(pick);
      collision.push({id:def.id,footprint:def.footprint,baseElevation:def.baseElevation,maxHeight:def.maxHeight,bounds:def.collisionBounds,pickBounds:[...box.min.toArray(),...box.max.toArray()]});
      const p=places.find(p=>p.id===def.id);if(p){const anchor=new THREE.Vector3(...p.anchor);anchor.y=Math.max(anchor.y,box.max.y+.08);p.anchor=anchor.toArray();}
    }
    group.updateMatrixWorld(true);stats.loaded=defs.length;
    places.forEach(p=>addLabel(p));
    for(const r of routes){const b=document.createElement('button');b.textContent=r.name;b.dataset.route=r.id;b.addEventListener('click',()=>{route=r;stop=0;moveRoute(0);});document.querySelector('#route-options').append(b);}
    ready=true;
  })().catch(error=>{errors.push(error.message);console.error(error);document.querySelector('#probe').hidden=false;document.querySelector('#probe').textContent='地点数据加载失败，请刷新重试';});
  function pick(raycaster){
    const hits=raycaster.intersectObjects(pickMeshes,false);
    for(const hit of hits){
      if(blocked(raycaster,hit.distance-.05,hit.object.userData.placeId))continue;
      select(hit.object.userData.placeId);return hit.object.userData.placeId;
    }
    // Bridge/nature points use a small world-space selection sphere, never a huge city-wide proxy.
    for(const p of places.filter(p=>p.kind!=='landmark')){const anchor=new THREE.Vector3(...p.anchor);const radius=p.kind==='bridge'?.3:.22;const hit=raycaster.ray.intersectSphere(new THREE.Sphere(anchor,radius),new THREE.Vector3());if(hit&&!blocked(raycaster,hit.distanceTo(raycaster.ray.origin)-.03,p.id)){select(p.id);return p.id;}}
    return null;
  }
  function update(now,visible,target){
    if(disposed||now-lastLabels<100)return;lastLabels=now;
    const ui=[...document.querySelectorAll('.brand,#regions,.tools,footer,#place-card,#data-panel,#journeys')].filter(e=>!e.hidden).map(e=>e.getBoundingClientRect());
    const occupied=[];const sorted=[...labels].sort((a,b)=>(b.place.id===selected?200:b.place.priority??(b.place.kind==='town'?90:30))-(a.place.id===selected?200:a.place.priority??(a.place.kind==='town'?90:30)));
    // Round-robin occlusion is budgeted and stays in the one existing main loop.
    const candidates=labels.filter(l=>!l.legacy&&l.place.kind==='landmark'&&l.position.distanceTo(camera.position)<70);
    if(camera.position.distanceToSquared(occlusionCamera)>.0001||urban.stats.loadedBuildingChunks!==occlusionBuildings){occlusionVersion++;occlusionCamera.copy(camera.position);occlusionBuildings=urban.stats.loadedBuildingChunks;}
    const pending=candidates.filter(l=>l.occlusionVersion!==occlusionVersion);
    for(let n=0;n<Math.min(2,pending.length);n++){
      const l=pending[n];l.occlusionVersion=occlusionVersion;direction.subVectors(l.position,camera.position);const distance=direction.length();ray.set(camera.position,direction.normalize());ray.far=Math.max(0,distance-.12);
      l.occluded=blocked(ray,ray.far,l.place.id);ray.far=Infinity;
    }
    for(const l of sorted){
      l.distance=l.position.distanceTo(camera.position);screen.copy(l.position).project(camera);
      const x=(screen.x+1)*innerWidth/2,y=(1-screen.y)*innerHeight/2;
      const max=l.legacy?(l.place.kind==='town'?900:l.place.kind==='hill'?160:550):l.place.maxLabelDistance;
      let show=visible&&screen.z>-1&&screen.z<1&&l.distance<max&&!l.occluded&&x>45&&x<innerWidth-45&&y>35&&y<innerHeight-35;
      const width=l.element.textContent.length*(l.place.kind==='town'?26:14)+18,height=24;
      const rect={left:x-width/2,right:x+width/2,top:y-height/2,bottom:y+height/2};
      const overlaps=r=>rect.left<r.right+6&&rect.right>r.left-6&&rect.top<r.bottom+5&&rect.bottom>r.top-5;
      if(ui.some(overlaps)||occupied.some(overlaps))show=false;
      l.element.hidden=!show;l.element.setAttribute('aria-hidden',String(!show));
      if(show){occupied.push(rect);l.element.style.left=`${x}px`;l.element.style.top=`${y}px`;}
    }
  }
  function cameraFloor(x,z){const key=`${Math.floor(x)},${Math.floor(z)}`;return Math.max(ready?(groundCells[key]??0):(surface.sample(x,z)?.height??0),clearance[key]??0)+.15;}
  return {group,places,presets,routes,definitions,collision,stats,errors,readyPromise,cameraFloor,get ready(){return ready;},get selected(){return selected;},select,close,pick,update,
    getLabels:()=>labels.map(l=>({id:l.place.id??l.place.name,visible:!l.element.hidden,occluded:l.occluded,anchor:l.position.toArray(),rect:l.element.getBoundingClientRect().toJSON()})),
    dispose(){disposed=true;group.traverse(o=>o.geometry?.dispose());pickMeshes.forEach(o=>{o.geometry.dispose();o.material.dispose();});disposeLandmarkMaterials();labels.forEach(l=>l.element.remove());scene.remove(group);},
  };
}
