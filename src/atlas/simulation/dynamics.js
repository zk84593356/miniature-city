import {createAtmosphere} from './atmosphere.js';
import {createTraffic} from './traffic.js';
import {createVehicles} from '../render/vehicles.js';
import {createVessels} from './vessels.js';
import {createVesselModels} from '../render/vessel-models.js';
import {installDynamicWater} from '../render/dynamic-water.js';
export function createDynamics(pack,geography,scene,surface) {
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let reduced=motion.matches,paused=false,focused=true,quality=innerWidth<700?'low':'high',mode='day',ready=false,disposed=false,time=0;
  let config,traffic,vehicles,vessels,ships,water;const errors=[],cpu=[],trafficCpu=[],vesselCpu=[];
  const atmosphere=createAtmosphere();scene.add(atmosphere.group);
  const onMotion=e=>{reduced=e.matches;applyCounts();};const onBlur=()=>{focused=false;};const onFocus=()=>{focused=true;};
  motion.addEventListener('change',onMotion);window.addEventListener('blur',onBlur);window.addEventListener('focus',onFocus);
  async function load(){
    if(!pack.manifest.dynamics)return;
    config=await pack.loadJSON(pack.manifest.dynamics.config);
    const [network,routes,style]=await Promise.all([config.traffic,config.vessels,config.waterStyle].map(n=>pack.loadJSON(n)));
    if(disposed)return;traffic=createTraffic(network,{heightAt:(p,lane,v)=>{
      const id=lane.majorBridge?'bridge-'+lane.majorBridge:lane.surfaceId;
      const hit=surface?.getRoadTriangles().heightFor(id,p.x,p.z,v.surfaceTriangle);v.surfaceTriangle=hit?.triangle;return hit?.height;
    }});vehicles=createVehicles(traffic);vessels=createVessels(routes,pack.waters,config.vesselTypes);ships=createVesselModels(vessels);water=installDynamicWater(geography,style);scene.add(vehicles.group,ships.group);ready=true;applyCounts();vehicles.setNight(mode==='night');ships.setNight(mode==='night');
    for(const n of [pack.manifest.dynamics.config,config.traffic,config.vessels,config.waterStyle])delete pack.buffers[n];
  }
  load().catch(e=>{if(e.name!=='AbortError'){errors.push(e.message);console.error(e);}});
  function applyCounts(){if(!ready)return;traffic.setCount(reduced?150:config.tiers[quality].vehicles*config.density[mode]);vessels.setCount(reduced?3:config.tiers[quality].vessels);}
  function record(a,t){a.push(t);if(a.length>240)a.shift();}
  const mean=a=>a.reduce((s,n)=>s+n,0)/Math.max(1,a.length);
  return {setPaused(value){paused=Boolean(value);},setQuality(value){if(!['high','medium','low'].includes(value))throw new Error('Invalid dynamic quality');quality=value;applyCounts();},setMode(value){mode=value;applyCounts();vehicles?.setNight(value==='night');ships?.setNight(value==='night');},
    rideObstacles:(state,radius)=>traffic?.rideObstacles(state,radius)??[],rideQuery:state=>traffic?.rideQuery(state),setRider:state=>traffic?.setRider(state),
    update(dt,camera){if(!ready||disposed)return;const start=performance.now(),stopped=paused||reduced||!focused||document.hidden;const step=stopped?0:dt;
      let t=performance.now();if(step)traffic.update(step);record(trafficCpu,performance.now()-t);t=performance.now();if(step)vessels.update(step);record(vesselCpu,performance.now()-t);
      time+=step;water.update(time,reduced,mode==='night');vehicles.update(camera,config.tiers[quality]);ships.update(camera,config.tiers[quality],reduced);atmosphere.update(time,camera,config.tiers[quality],reduced,mode==='night');record(cpu,performance.now()-start);
    },get state(){return {ready,errors:[...errors],paused,reducedMotion:reduced,focused,qualityLevel:quality,mode,time,demonstration:true,...traffic?.stats,...vehicles?.stats,...vessels?.stats,...ships?.stats,...atmosphere.stats,trafficSimulationMs:mean(trafficCpu),vesselSimulationMs:mean(vesselCpu),dynamicUpdateMs:mean(cpu)};},
    snapshot(){return {vehicles:traffic?.vehicles.filter(v=>v.active).map(v=>({id:v.id,s:v.s,route:v.route.parts.filter(p=>p.lane).map(p=>p.lane.id),...traffic.sample(v)})),vessels:vessels?.ships.filter(s=>s.active).map(s=>({id:s.id,route:s.route.id,...vessels.interpolate(s)}))};},
    dispose(){disposed=true;motion.removeEventListener('change',onMotion);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);scene.remove(atmosphere.group);atmosphere.dispose();if(vehicles){scene.remove(vehicles.group,ships.group);vehicles.dispose();ships.dispose();}},
  };
}
