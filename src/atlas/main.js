import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadPack } from './engine/load-pack.js';
import { createProjection } from './geo/projection.js';
import { createGeography } from './render/geography.js';
import { createUrban } from './render/urban.js';
import { createPlaces } from './places.js';
import { createTerrainSurface } from './adapters/terrain-surface.js';
import {createDynamics} from './simulation/dynamics.js';
import {createNightLighting} from './render/night-lighting.js';
import {landmarkMaterials} from './render/landmark-models.js';
import {createRide} from './ride/ride-controller.js';
import {createCityMusic} from './audio/city-music.js';

const $ = selector => document.querySelector(selector);
const abort = new AbortController();
let disposeScene = () => {};
$('#retry').addEventListener('click', () => location.reload());
window.addEventListener('pagehide', () => { abort.abort(); disposeScene(); }, { once: true });

async function start() {
  const pack = await loadPack(new URL('../cities/wuhan/manifest.json', import.meta.url), {
    signal: abort.signal,
    progress: n => { $('#loading-progress').style.width = `${n * 100}%`; },
  });
  if (abort.signal.aborted) return;
  $('#loading-detail').textContent = '正在构建三维地形…';
  const projection = createProjection(pack.manifest.projection);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f1f5f0');
  scene.fog = new THREE.Fog('#f1f5f0', 420, 1150);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .03, 2300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.id = 'city-canvas';
  renderer.domElement.setAttribute('aria-label', '可拖动旋转、缩放的武汉三维地形');
  $('#scene').append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.minDistance = .65;
  controls.maxDistance = 850;
  controls.maxPolarAngle = Math.PI * .47;
  controls.minPolarAngle = .1;
  controls.target.set(0, .25, 0);
  const ambient = new THREE.HemisphereLight('#ffffff', '#9aa487', 2.2);
  const sun = new THREE.DirectionalLight('#fff5df', 2.5);
  sun.position.set(-120, 180, 90);
  scene.add(ambient, sun);
  const geography = createGeography(pack);
  scene.add(geography.group);
  scene.updateMatrixWorld(true);
  const surface = createTerrainSurface(geography.stableTerrain, pack.waters, projection, pack.manifest.bounds.context);
  const urban=createUrban(pack,surface); scene.add(urban.group);
  const dynamics=createDynamics(pack,geography,scene,surface);
  const lighting=createNightLighting({scene,sun,ambient,renderer,geography,urban,landmarkMaterials});
  const initMs=performance.now();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let flight = null, disposed = false, frame = 0, labelsVisible = true, currentRegion = 'confluence';
  let lightMode = 'day';
  const onMotionChange=event=>{if(event.matches&&flight)fly(currentRegion,true);};
  reducedMotion.addEventListener('change',onMotionChange);
  const frameTimes = [];
  const places=createPlaces({pack,scene,surface,projection,camera,geography,urban,onFocus:id=>fly(id)});
  const music=createCityMusic();
  const ride=createRide({pack,surface,urban,places,dynamics,scene,camera,controls,projection,reducedMotion,root:$('#app'),canvas:renderer.domElement,cancelFlight:()=>{flight=null;}});

  function fly(id, immediate = false) {
    let region = [...places.presets,...pack.manifest.regions,...(pack.manifest.urban?.qaViews??[]).map(r=>({...r,caption:r.name,distance:40,bearing:165})),{id:'bridge-sequence',name:'桥梁序列',caption:'两江上的桥梁结构',center:[114.29,30.56],distance:110,bearing:220,elevation:.16}].find(r => r.id === id);
    if(!region&&id.startsWith('bridge-')){
      const bridge=urban.bridges.children.find(o=>'bridge-'+o.userData.bridgeId===id);
      if(bridge){const wet=bridge.userData.waterProfile;const a=wet[0],b=wet.at(-1);if(a&&b)region={id,name:bridge.userData.name,caption:'桥面、结构与两岸引道',center:projection.inverse((a[0]+b[0])/2,(a[2]+b[2])/2),distance:Math.max(16,Math.hypot(b[0]-a[0],b[2]-a[2])*1.35),bearing:165,elevation:.4};}
    }
    if (!region) return;
    ride.exit();
    currentRegion = id;
    const [x, z] = projection.forward(region.center);
    const target = new THREE.Vector3(x, region.targetHeight ?? surface.sample(x, z)?.height ?? .25, z);
    const theta = (region.bearing - 180) * Math.PI / 180;
    const distance = region.distance * (innerWidth < 700 ? 1.35 : 1);
    const offset = new THREE.Vector3(Math.sin(theta) * .74, region.elevation ?? .67, Math.cos(theta) * .74).normalize().multiplyScalar(distance);
    const destination = target.clone().add(offset);
    destination.y=Math.max(destination.y,places.cameraFloor(destination.x,destination.z));
    if (immediate || reducedMotion.matches) {
      flight = null;
      camera.position.copy(destination);
      controls.target.copy(target);
      controls.update();
    } else {
      let cruise=Math.max(camera.position.y,destination.y);
      const steps=Math.max(24,Math.ceil(camera.position.distanceTo(destination)/.25));
      for(let i=0;i<=steps;i++){const p=camera.position.clone().lerp(destination,i/steps);cruise=Math.max(cruise,places.cameraFloor(p.x,p.z)+.35);}
      flight = { start: performance.now(), from: camera.position.clone(), to: destination, fromTarget: controls.target.clone(), target,cruise:cruise+.25 };
    }
    $('#view-title').textContent = region.name;
    $('#view-caption').textContent = region.caption;
    document.querySelectorAll('[data-region]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.region === id)));
  }
  for (const [i, region] of pack.manifest.regions.entries()) {
    const button = document.createElement('button');
    button.dataset.region = region.id;
    const number = document.createElement('span');
    number.textContent = String(i + 1).padStart(2, '0');
    button.append(number, region.name);
    button.addEventListener('click', () => fly(region.id));
    $('#regions').append(button);
  }
  controls.addEventListener('start', () => { flight = null; });
  $('#reset').addEventListener('click', () => fly('confluence'));
  $('#labels-toggle').addEventListener('click', event => {
    labelsVisible = !labelsVisible;
    $('#labels').hidden = !labelsVisible;
    event.currentTarget.setAttribute('aria-pressed', String(labelsVisible));
  });
  $('#mesh-toggle').addEventListener('click', event => {
    geography.landMaterial.wireframe = !geography.landMaterial.wireframe;
    event.currentTarget.setAttribute('aria-pressed', String(geography.landMaterial.wireframe));
  });
  function setInfo(open) { $('#data-panel').hidden = !open; $('#info-toggle').setAttribute('aria-expanded', String(open)); }
  $('#info-toggle').addEventListener('click', () => setInfo($('#data-panel').hidden));
  $('#info-close').addEventListener('click', () => { setInfo(false); $('#info-toggle').focus(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') {setInfo(false);places.close();$('#journeys').hidden=true;} });
  $('#data-stats').textContent = `${pack.quality.waterBodies} 片连通水域 · ${pack.quality.waterHoles} 个水域孔洞 · ${(pack.manifest.terrain.triangles / 10000).toFixed(1)} 万个地形三角面`;
  $('#full-attribution').textContent = pack.manifest.attribution;
  function setLight(value){
    if(!['day','sunset','night'].includes(value))return;
    lightMode=value;lighting.set(value);dynamics.setMode(value);
    document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.light===value)));
  }
  document.querySelectorAll('[data-light]').forEach(button=>button.addEventListener('click',()=>setLight(button.dataset.light)));
  $('#dynamic-toggle').addEventListener('change',event=>dynamics.setPaused(!event.target.checked));
  const raycaster = new THREE.Raycaster();
  let pointerStart = null;
  renderer.domElement.addEventListener('pointerdown', event => { pointerStart = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 4) return;
    raycaster.setFromCamera(new THREE.Vector2(event.clientX / innerWidth * 2 - 1, 1 - event.clientY / innerHeight * 2), camera);
    if(places.pick(raycaster))return;
    const hit = raycaster.intersectObjects([geography.terrain, geography.water], true)[0];
    if (!hit) return;
    const [lon, lat] = projection.inverse(hit.point.x, hit.point.z);
    $('#probe').textContent = `${lon.toFixed(4)}° E · ${lat.toFixed(4)}° N　${hit.object === geography.water ? '估计水位' : '地表高程'} ${(hit.point.y * 100).toFixed(1)} m`;
    $('#probe').hidden = false;
  });
  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  window.addEventListener('resize', resize);
  fly('confluence', true);
  let previous = performance.now();
  const sampleAfter = performance.now() + 2000;
  function render(now) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    if (document.hidden) { previous = now; return; }
    if (now >= sampleAfter) frameTimes.push(now - previous);
    if (frameTimes.length > 180) frameTimes.shift();
    const dt=Math.min(.15,(now-previous)/1000);previous = now;
    if (!ride.active&&flight) {
      const t = Math.min(1, (now - flight.start) / 1600);
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      const traverse=THREE.MathUtils.smoothstep(t,.2,.8);
      camera.position.lerpVectors(flight.from,flight.to,traverse);
      camera.position.y=t<.2?THREE.MathUtils.lerp(flight.from.y,flight.cruise,THREE.MathUtils.smoothstep(t,0,.2)):t>.8?THREE.MathUtils.lerp(flight.cruise,flight.to.y,THREE.MathUtils.smoothstep(t,.8,1)):flight.cruise;
      controls.target.lerpVectors(flight.fromTarget, flight.target, eased);
      if (t === 1) flight = null;
    }
    // Keep panning inside the dataset, without allowing the camera under ground.
    if(!ride.active){
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -265, 300);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -290, 280);
    controls.target.y = Math.max(.2, controls.target.y);
    controls.update();
    if(camera.position.y<8)camera.position.y=Math.max(camera.position.y,places.cameraFloor(camera.position.x,camera.position.z));
    }
    geography.update(camera,now);
    urban.update(camera,now,controls.target);
    lighting.update();
    dynamics.update(dt,camera);
    ride.update(dt);
    renderer.render(scene, camera);
    if(!ride.active)places.update(now,labelsVisible,controls.target);
    $('#north').style.transform = `rotate(${-controls.getAzimuthalAngle() * 180 / Math.PI}deg)`;
  }
  disposeScene = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    reducedMotion.removeEventListener('change',onMotionChange);
    void music.dispose(); ride.dispose(); controls.dispose(); dynamics.dispose(); places.dispose(); urban.dispose(); geography.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
  // Explicit diagnostics for browser verification and future surface adapters.
  function terrainTriangles() {
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let triangles=0;
    geography.terrain.traverse(object=>{if(object.isMesh&&object.visible&&frustum.intersectsObject(object))triangles+=object.geometry.index.count/3;});
    return triangles;
  }
  window.__wuhan = {
    getMusicState:()=>music.getState(),
    roadDebug:value=>urban.canonical?.setDebug(value),
    vegetationDebug:()=>['localhost','127.0.0.1'].includes(location.hostname)?urban.vegetation.entries.flatMap(e=>e.items??[]):[],
    roadDebugProbe:(x,z)=>['localhost','127.0.0.1'].includes(location.hostname)?surface.getRoadTriangles().candidates(x,z):null,
    getRideState:()=>ride.snapshot(),rideEnter:()=>ride.enter(),rideEnterAt:target=>ride.enter(target),rideExit:()=>ride.exit(),rideDebugSpawn:id=>ride.debugSpawn(id),
    rideDebugView:view=>ride.debugView(view),
    ridePrepare:async(x,z,heading,speed)=>ride.adapter.prepare(x,z,heading,speed),
    rideCollisionDebug:value=>ride.collisionDebug(value),
    rideResidency:()=>ride.adapter.residency(),
    rideSurfaceProbe:()=>ride.state?ride.adapter.surfaceProbe(ride.state):null,
    rideCollisionProbe:()=>ride.state?ride.adapter.collisionProbe(ride.state):[],
    rideBlockEvents:()=>ride.adapter.blockEvents,
    rideDebugAt:async state=>{ride.exit();await ride.adapter.prepare(state.x,state.z);const hit=ride.adapter.validate(state,state);if(!hit)return false;ride.activate({...state,...hit,y:hit.height,speed:0,steering:0});return true;},
    rideStep:(seconds,input,compact=false)=>{for(let t=0;t<seconds-1e-8;t+=1/60){const dt=Math.min(1/60,seconds-t);dynamics.update(dt,camera);ride.update(dt,input);}return compact?{state:{...ride.state},collision:ride.adapter.lastBlock,recoveryCount:ride.recoveryCount,travelMeters:ride.travel}:ride.snapshot();},
    rideProbe:state=>ride.adapter.probe(state),
    setLight,setDynamicPaused:value=>{dynamics.setPaused(value);$('#dynamic-toggle').checked=!value;},setQuality:value=>{dynamics.setQuality(value);urban.vegetation.setQuality(value);lighting.uniforms.detail.value=value==='low'?.35:1;},getDynamics:()=>dynamics.snapshot(),
    resetFrameStats:()=>{frameTimes.length=0;},
    projectWorld:(position)=>{const p=new THREE.Vector3(...position).project(camera);return [(p.x+1)*innerWidth/2,(1-p.y)*innerHeight/2,p.z];},
    ready: true, fly, selectPlace:(id)=>places.select(id), getPlaces:()=>places.places, getLandmarks:()=>places.collision, getLabels:()=>places.getLabels(), cameraFloor:(x,z)=>places.cameraFloor(x,z), sampleWorld:(x,z)=>surface.sample(x,z), sampleSurface: (x,z,y,id)=>surface.sampleSurface(x,z,y,id), getBridges:()=>urban.bridges.children.map(o=>o.userData), sample: (lon, lat) => surface.sample(...projection.forward([lon, lat])),
    getState: () => ({ runtimePhase:6,vegetation:{...urban.vegetation.stats},dynamics:dynamics.state, phase:pack.manifest.phase,placesReady:places.ready,selectedPlace:places.selected,landmarks:{...places.stats},placeErrors:[...places.errors],initialLoadMs:initMs,urbanReady:urban.ready,urban:{...urban.stats},urbanErrors:[...urban.errors],mainLoopCount:disposed?0:1,terrainTriangles:terrainTriangles(),estimatedGeometryBytes:(()=>{let bytes=0;const seen=new Set();scene.traverse(o=>{if(o.geometry){for(const a of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean)){if(!seen.has(a.array.buffer)){seen.add(a.array.buffer);bytes+=a.array.buffer.byteLength;}}}});return bytes;})(),datasetId: pack.manifest.datasetId, region: currentRegion, flying: Boolean(flight), camera: camera.position.toArray(), target: controls.target.toArray(), light: lightMode, wireframe: geography.landMaterial.wireframe, labelsVisible, rendererCount: document.querySelectorAll('canvas').length, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, frameSamples: frameTimes.length, p95FrameMs: [...frameTimes].sort((a, b) => a - b)[Math.floor(frameTimes.length * .95)] ?? 0, disposed }),
    dispose: disposeScene,
  };
  frame = requestAnimationFrame(render);
  $('#loading').hidden = true;
}

start().catch(error => {
  if (error.name === 'AbortError') return;
  disposeScene();
  $('#loading-detail').textContent = error.message;
  $('#retry').hidden = false;
  console.error(error);
});
