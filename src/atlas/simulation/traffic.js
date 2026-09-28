import {preparePath,samplePath} from './path.js';

const STEP=.05,MAX=1200;
export function createTraffic(network) {
  const lanes=network.lanes.map(l=>({...l,curve:preparePath(l.path),occupants:[]}));
  const connections=network.connections.map(c=>({...c,curve:preparePath(c.path)}));
  const routes=network.routes.map(r=>{
    const parts=[],starts=[];let length=0;
    for(let i=0;i<r.lanes.length;i++){
      const lane=lanes[r.lanes[i]];starts.push(length);parts.push({lane,curve:lane.curve,hidden:lane.tunnel});length+=lane.curve.length;
      if(i<r.connections.length){const c=connections[r.connections[i]];starts.push(length);parts.push({connection:c,curve:c.curve,hidden:c.hidden});length+=c.curve.length;}
    }
    return {parts,starts,length};
  });
  let seed=407,accumulator=0,ticks=0,target=1020;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const vehicles=Array.from({length:MAX},(_,id)=>({id,active:false,type:id%23===0?2:id%17===0?3:id%5===0?1:0,length:id%23===0?.105:id%17===0?.075:id%5===0?.05:.045,route:null,s:0,previous:0,speed:0,part:0,local:0,pose:{x:0,y:0,z:0,heading:0},renderPose:{x:0,y:0,z:0,heading:0},age:0}));
  for(const v of vehicles)v.candidate={x:0,y:0,z:0,heading:0};
  const bridgeSeeds=Object.keys(network.counts.bridgeCoverage).map(id=>{
    let best=null;
    for(const route of routes)for(let i=0;i<route.parts.length;i++){const part=route.parts[i];if(part.lane?.majorBridge===id&&(!best||part.curve.length>best.length))best={route,index:i,length:part.curve.length};}
    return best;
  });
  const reservations=new Map(),grid=new Map();
  let rider=null;
  const riderBody={length:.022,width:.010};
  function locate(v,s,out) {
    const r=v.route;let lo=0,hi=r.parts.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(r.starts[mid]<=s)lo=mid;else hi=mid-1;}
    const part=r.parts[lo];samplePath(part.curve,s-r.starts[lo],out);out.hidden=part.hidden;out.lane=part.lane?.id??null;out.bridge=part.lane?.majorBridge??null;
    return lo;
  }
  function key(x,z){return `${Math.floor(x/.3)},${Math.floor(z/.3)}`;}
  function insert(v){const k=key(v.pose.x,v.pose.z);let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(v);}
  function near(p,fn){const x=Math.floor(p.x/.3),z=Math.floor(p.z/.3);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const list=grid.get(`${x+i},${z+j}`);if(list)for(const v of list)if(fn(v))return true;}return false;}
  function overlaps(a,p,b,q){
    const dx=q.x-p.x,dz=q.z-p.z;
    if(p.hidden||q.hidden||Math.abs(p.y-q.y)>.035||Math.hypot(dx,dz)>(a.length+b.length)/2+.04)return false;
    if(a===riderBody||b===riderBody){const ah=a===riderBody?.0175:a.type>=2?.034:.016,bh=b===riderBody?.0175:b.type>=2?.034:.016;if(p.y+ah<=q.y||q.y+bh<=p.y)return false;}
    const ax=Math.sin(p.heading),az=Math.cos(p.heading),bx=Math.sin(q.heading),bz=Math.cos(q.heading);
    const al=a.length/2+.0005,bl=b.length/2+.0005,aw=(a.width??(a.type===2?.025:a.type===3?.024:.019))/2+.0005,bw=(b.width??(b.type===2?.025:b.type===3?.024:.019))/2+.0005;
    const dot=ax*bx+az*bz,cross=ax*bz-az*bx;
    if(Math.abs(dx*ax+dz*az)>=al+bl*Math.abs(dot)+bw*Math.abs(cross))return false;
    if(Math.abs(dx*az-dz*ax)>=aw+bl*Math.abs(cross)+bw*Math.abs(dot))return false;
    if(Math.abs(dx*bx+dz*bz)>=bl+al*Math.abs(dot)+aw*Math.abs(cross))return false;
    return Math.abs(dx*bz-dz*bx)<bw+al*Math.abs(cross)+aw*Math.abs(dot);
  }
  function spawn(v,initial=false) {
    for(let attempt=0;attempt<12;attempt++){
      v.route=routes[Math.floor(random()*routes.length)];v.s=initial?random()*Math.max(0,v.route.length-.2):Math.min(.2,v.route.length*.1);v.previous=v.s;
      if(initial&&v.id<60){const b=bridgeSeeds[v.id%bridgeSeeds.length];if(b){v.route=b.route;v.s=b.route.starts[b.index]+b.length*(.1+random()*.8);v.previous=v.s;}}
      if(v.type>=2&&!v.route.parts.every(p=>!p.lane||p.lane.allowedVehicleTypes?.includes(v.type===2?'bus':'truck'))){v.type=0;v.length=.045;}
      v.part=locate(v,v.s,v.pose);
      if(v.pose.hidden||!v.route.parts[v.part].lane)continue;
      if(rider&&overlaps(v,v.pose,riderBody,rider))continue;
      if(near(v.pose,o=>Math.abs(v.pose.y-o.pose.y)<.03&&Math.hypot(v.pose.x-o.pose.x,v.pose.z-o.pose.z)<(v.length+o.length)/2+.055))continue;
      v.active=true;v.speed=0;v.age=initial?3:0;insert(v);return true;
    }
    return false;
  }
  for(let i=0;i<target;i++)spawn(vehicles[i],true);
  function tick() {
    ticks++;reservations.clear();grid.clear();for(const l of lanes)l.occupants.length=0;
    for(const v of vehicles)if(v.active){if(v.id>=target){v.active=false;continue;}v.previous=v.s;v.part=locate(v,v.s,v.pose);v.local=v.s-v.route.starts[v.part];const part=v.route.parts[v.part];if(part.lane)part.lane.occupants.push(v);else reservations.set(part.connection.node,v.id);insert(v);}
    // Reserve until the tail clears the exit, not merely until its centre arrives.
    for(const v of vehicles)if(v.active&&v.local<v.length/2+.025){const prev=v.route.parts[v.part-1];if(prev?.connection)reservations.set(prev.connection.node,v.id);}
    for(const l of lanes)if(l.occupants.length>1)l.occupants.sort((a,b)=>a.local-b.local);
    for(const v of vehicles){
      if(!v.active){if(v.id<target&&ticks%8===v.id%8)spawn(v,true);continue;}
      const part=v.route.parts[v.part];let gap=Infinity,desired=part.lane?.speed??.06;
      if(part.lane){
        const list=part.lane.occupants,index=list.indexOf(v),leader=list[index+1];
        if(leader)gap=leader.local-v.local-(v.length+leader.length)/2-.025;
        const remaining=part.curve.length-v.local,next=v.route.parts[v.part+1];
        if(next?.connection&&remaining<.65){
          const node=next.connection.node,owner=reservations.get(node),after=v.route.parts[v.part+2]?.lane;
          const front=after?.occupants[0],space=!front||front.local>v.length+.07;
          if((owner===undefined||owner===v.id)&&space)reservations.set(node,v.id);
          else gap=Math.min(gap,remaining-v.length/2-.035);
        }
      }
      // Additional world-space guard for coincident OSM ways and short lane-end
      // connectors: follows geometry without introducing any graph connection.
      near(v.pose,o=>{
        if(o===v||Math.abs(o.pose.y-v.pose.y)>.035||o.pose.hidden||v.pose.hidden)return false;
        const dx=o.pose.x-v.pose.x,dz=o.pose.z-v.pose.z,forward=dx*Math.sin(v.pose.heading)+dz*Math.cos(v.pose.heading),side=Math.abs(dx*Math.cos(v.pose.heading)-dz*Math.sin(v.pose.heading));
        if(forward>0&&side<.024)gap=Math.min(gap,forward-(o.length+v.length)/2-.02);return false;
      });
      desired=Math.min(desired,Math.sqrt(Math.max(0,2*.035*gap)));
      v.speed=Math.max(0,Math.min(desired,v.speed+.018*STEP));
      v.advance=Math.min(v.speed*STEP,Math.max(0,gap));v.age+=STEP;
    }
    // A route can merge beside another OSM way without sharing its lane identity.
    // Test oriented vehicle footprints against both current and candidate poses
    // before applying any movement. This guard never invents a graph connection.
    for(const v of vehicles)if(v.active)locate(v,v.s+(v.advance??0),v.candidate);
    for(const v of vehicles)if(v.active&&rider&&overlaps(v,v.candidate,riderBody,rider)){v.advance=0;v.speed=0;}
    for(const v of vehicles)if(v.active&&v.advance>0&&near(v.candidate,o=>o!==v&&(overlaps(v,v.candidate,o,o.pose)||overlaps(v,v.candidate,o,o.candidate)))){v.advance=0;v.speed=0;}
    for(const v of vehicles)if(v.active){v.s+=v.advance??0;if(v.s>=v.route.length-v.length/2){v.active=false;v.speed=0;}}
    // Publish accepted poses at the same 20 Hz. Ride only visits adjacent cells;
    // testing the interpolation endpoint as well prevents render-time overlap.
    grid.clear();for(const v of vehicles)if(v.active){locate(v,v.s,v.pose);insert(v);}
  }
  return {vehicles,lanes,routes,setCount(n){target=Math.max(0,Math.min(MAX,Math.floor(n)));for(const v of vehicles)if(v.id>=target)v.active=false;},
    setRider(value){rider=value?{x:value.x,y:value.y,z:value.z,heading:value.heading}:null;},
    rideQuery(p){let blocked=false,distance=Infinity,candidates=0;near(p,v=>{if(!v.active||v.pose.hidden||Math.abs(p.y-v.pose.y)>.035)return false;candidates++;distance=Math.min(distance,Math.hypot(v.pose.x-p.x,v.pose.z-p.z));locate(v,v.previous,v.renderPose);if(overlaps(riderBody,p,v,v.pose)||overlaps(riderBody,p,v,v.renderPose))blocked=true;return false;});return {blocked,distance:Number.isFinite(distance)?distance:null,candidates};},
    update(dt){accumulator+=Math.min(.15,dt);let count=0;while(accumulator>=STEP&&count++<3){tick();accumulator-=STEP;}},
    sample(v){locate(v,v.previous+(v.s-v.previous)*Math.min(1,accumulator/STEP),v.renderPose);return v.renderPose;},
    get stats(){const active=vehicles.filter(v=>v.active);return {capacity:MAX,vehicles:active.length,target,ticks,simulationHz:20,laneCount:lanes.length,junctionCount:network.junctions.length,cachedRoutes:routes.length,hiddenTunnelVehicles:active.filter(v=>v.pose.hidden).length,bridgeVehicles:Object.fromEntries(Object.keys(network.counts.bridgeCoverage).map(id=>[id,active.filter(v=>v.pose.bridge===id).length]))};},
  };
}
