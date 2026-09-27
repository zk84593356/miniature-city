import {preparePath,samplePath} from './path.js';
import {waterHeight} from '../geo/projection.js';
export function createVessels(data,waters,types) {
  const routes=data.routes.map(r=>({...r,curve:preparePath(r.path.map(([x,z])=>[x,0,z])),water:waters.find(w=>w.id===r.waterBodyId)}));
  const ships=Array.from({length:18},(_,i)=>{
    const ri=i%6===4?1:i%6===5?2:0,route=routes[ri],type=ri===2||i===10?'ferry':ri===0&&i%4===0?'cargo':i%3===0?'ferry':'small';
    return {id:i,route,type,...types[type],direction:i%2?1:-1,s:route.curve.length*((i*.61803398875+.11)%1),previous:0,speed:(2+(i%5)*.55)/100,pose:{x:0,y:0,z:0,heading:0},scratch:{x:0,y:0,z:0,heading:0},active:true};
  });
  let count=18,ticks=0,accumulator=0;
  function pose(ship,s,out){samplePath(ship.route.curve,s,out);const angle=out.heading+(ship.direction<0?Math.PI:0);out.x-=Math.cos(angle)*.06;out.z+=Math.sin(angle)*.06;out.y=waterHeight(ship.route.water,out.x,out.z);out.heading=angle;return out;}
  for(const ship of ships){ship.previous=ship.s;pose(ship,ship.s,ship.pose);}
  return {ships,setCount(n){count=n;for(const ship of ships)ship.active=ship.id<count;},sample:pose,
    update(dt){accumulator+=Math.min(dt,.15);while(accumulator>=.05){accumulator-=.05;ticks++;
      for(const ship of ships){ship.active=ship.id<count;if(!ship.active)continue;ship.previous=ship.s;
        const next=ship.s+ship.direction*ship.speed*.05;pose(ship,next,ship.scratch);
        const blocked=ships.some(o=>o!==ship&&o.active&&Math.hypot(ship.scratch.x-o.pose.x,ship.scratch.z-o.pose.z)<(ship.length+o.length)/200+.12&&((o.pose.x-ship.pose.x)*Math.sin(ship.pose.heading)+(o.pose.z-ship.pose.z)*Math.cos(ship.pose.heading)>0));
        if(!blocked)ship.s=next;
        if(ship.s>ship.route.curve.length||ship.s<0){ship.s=ship.direction>0?0:ship.route.curve.length;ship.previous=ship.s;}
      }
      for(const ship of ships)if(ship.active)pose(ship,ship.s,ship.pose);
    }},
    interpolate(ship){return pose(ship,ship.previous+(ship.s-ship.previous)*Math.min(1,accumulator/.05),ship.scratch);},
    get stats(){return {vessels:ships.filter(s=>s.active).length,vesselTicks:ticks,routes:routes.length,routeCounts:routes.map(r=>({id:r.id,count:ships.filter(s=>s.active&&s.route===r).length})),estimated:true};},
  };
}
