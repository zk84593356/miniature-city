// Browser QA driver only: find a short clear route around live traffic. Every
// returned waypoint is reached with ordinary steering, never a position write.
export function planDetour(api,run){
 const s=run.current,step=.01,limit=26,cache=new Map(),nodes=new Map();
 let goalIndex=run.cursor;while(goalIndex<run.points.length-1&&Math.hypot(run.points[goalIndex][0]-s.x,run.points[goalIndex][2]-s.z)<.18)goalIndex++;
 const goal=run.points[goalIndex],key=(x,z)=>x+','+z;
 const heuristic=(x,z)=>Math.hypot(s.x+x*step-goal[0],s.z+z*step-goal[2])/step;
 const clear=(x,z,heading)=>{
   const k=key(x,z)+','+Math.round(heading*4);if(cache.has(k))return cache.get(k);
   const px=s.x+x*step,pz=s.z+z*step,h=api.sampleSurface(px,pz,s.y,s.surfaceId);
   const valid=h?.rideAllowed&&Math.abs(h.height-s.y)<.05&&api.rideProbe({...s,x:px,z:pz,y:h.height,surfaceId:h.surfaceId,heading}).valid;
   const result=valid?[px,h.height,pz]:null;cache.set(k,result);return result;
 };
 const start={x:0,z:0,g:0,f:heuristic(0,0),p:[s.x,s.y,s.z]},open=[start];nodes.set('0,0',start);
 let found=null;
 for(let visit=0;open.length&&visit<2200;visit++){
   open.sort((a,b)=>b.f-a.f);const n=open.pop();if(n.closed)continue;n.closed=true;
   if(heuristic(n.x,n.z)<1.3){found=n;break;}
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
     const x=n.x+dx,z=n.z+dz,k=key(x,z);if(Math.abs(x)>limit||Math.abs(z)>limit||nodes.get(k)?.closed)continue;
     const heading=Math.atan2(dx,dz),p=clear(x,z,heading);if(!p)continue;
     // A diagonal must also have room at its two orthogonal corner samples.
     if(dx&&dz&&(!clear(n.x+dx,n.z,heading)||!clear(n.x,n.z+dz,heading)))continue;
     const g=n.g+Math.hypot(dx,dz);if(g>=(nodes.get(k)?.g??Infinity))continue;
     const next={x,z,p,g,f:g+heuristic(x,z),parent:n};nodes.set(k,next);open.push(next);
   }
 }
 if(!found)return null;
 const points=[];for(let n=found;n.parent;n=n.parent)points.push(n.p);points.reverse();
 return {points,goalIndex};
}
