import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createTraffic} from '../../src/atlas/simulation/traffic.js';
const n=JSON.parse(await readFile('city-data/wuhan/generated/traffic-network.json'));
const sim=createTraffic(n);sim.setCount(1200);const found=[];
function overlaps(a,b){
  const dx=b.p.x-a.p.x,dz=b.p.z-a.p.z;if(Math.abs(a.p.y-b.p.y)>.025||Math.hypot(dx,dz)>(a.v.length+b.v.length)/2+.03)return false;
  const ax=Math.sin(a.p.heading),az=Math.cos(a.p.heading),bx=Math.sin(b.p.heading),bz=Math.cos(b.p.heading),al=a.v.length/2,bl=b.v.length/2,aw=(a.v.type===2?.025:a.v.type===3?.024:.019)/2,bw=(b.v.type===2?.025:b.v.type===3?.024:.019)/2;
  for(const [x,z] of [[ax,az],[az,-ax],[bx,bz],[bz,-bx]])if(Math.abs(dx*x+dz*z)>=al*Math.abs(ax*x+az*z)+aw*Math.abs(az*x-ax*z)+bl*Math.abs(bx*x+bz*z)+bw*Math.abs(bz*x-bx*z))return false;
  return true;
}
for(let tick=0;tick<1200;tick++){
  sim.update(.05);if(tick%5)continue;const grid=new Map();
  for(const v of sim.vehicles){if(!v.active)continue;const p=sim.sample(v);if(p.hidden)continue;const a={v,p:{...p}},x=Math.floor(p.x/.3),z=Math.floor(p.z/.3);
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const b of grid.get(`${x+i},${z+j}`)??[])if(overlaps(a,b)&&found.length<12)found.push({tick,a:v.id,b:b.v.id,lanes:[p.lane,b.p.lane]});
    const key=`${x},${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(a);
  }
}
assert.deepEqual(found,[],'oriented vehicle footprints overlap across lanes');
const result={result:'PASS',simulationSeconds:60,sampledHz:4,capacity:1200,overlaps:found,checks:['independent oriented rectangle SAT','same-lane and cross-lane vehicle pairs','layer-height separation','hidden tunnels excluded from visible collision']};
await writeFile('docs/wuhan-phase4-traffic-collision-qa.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
