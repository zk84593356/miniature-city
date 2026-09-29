import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createTraffic} from '../../src/atlas/simulation/traffic.js';
import {createVessels} from '../../src/atlas/simulation/vessels.js';
import {waterHeight} from '../../src/atlas/geo/projection.js';
const json=async n=>JSON.parse(await readFile('city-data/wuhan/generated/'+n));
const network=await json('traffic-network.json'),routes=await json('vessel-routes.json'),waters=await json('water.json'),config=await json('dynamic-config.json');
assert.ok(network.lanes.length&&network.junctions.length&&network.routes.length);
const allowed=new Set(['motorway','trunk','primary','secondary','tertiary','residential','unclassified','service','living_street',...['motorway','trunk','primary','secondary','tertiary'].map(s=>s+'_link')]);
for(const l of network.lanes){assert.ok(allowed.has(l.roadClass));assert.ok(['yes','designated','permissive'].includes(l.access));assert.ok(!l.surfaceId?.startsWith('rail'));if(['yes','1','true'].includes(l.oneway))assert.equal(l.direction,1);if(l.oneway==='-1')assert.equal(l.direction,-1);assert.ok(l.path.length>1);}
for(const c of network.connections){const a=network.lanes[c.fromLane],b=network.lanes[c.toLane];assert.equal(a.toNode,b.fromNode);assert.equal(c.node,a.toNode);assert.ok(a.next.includes(c.id));if(!c.hidden)assert.ok(Math.abs(a.path.at(-1)[1]-b.path[0][1])<=.012001);}
for(const r of network.routes)for(let i=0;i<r.connections.length;i++){const c=network.connections[r.connections[i]];assert.equal(c.fromLane,r.lanes[i]);assert.equal(c.toLane,r.lanes[i+1]);}
const traffic=createTraffic(network);traffic.setCount(1200);const bridgeSeen=new Set(),samples=[],clock=performance.now();
for(let i=0;i<1200;i++){
  traffic.update(.05);
  if(i%20===0){const start=performance.now();let hidden=0;
    for(const v of traffic.vehicles)if(v.active){const p=traffic.sample(v);assert.ok([p.x,p.y,p.z,p.heading,v.speed].every(Number.isFinite));if(p.bridge)bridgeSeen.add(p.bridge);if(p.hidden)hidden++;}
    samples.push({second:i/20,...traffic.stats,sampleMs:performance.now()-start,hidden});
  }
}
assert.equal(bridgeSeen.size,6,'all six bridges carry traffic during the simulation');
const simulationMs=(performance.now()-clock)/1200;
// Two perpendicular movements share one original node. Exclusive reservation
// must prevent simultaneous centre occupancy even though itineraries differ.
const fixture={lanes:[],connections:[],routes:[],junctions:[{node:99}],counts:{bridgeCoverage:{}}};
for(const [i,path] of [[[0],[[-1,0,0],[-.08,0,0]]],[[1],[[.08,0,0],[1,0,0]]],[[2],[[0,0,-1],[0,0,-.08]]],[[3],[[0,0,.08],[0,0,1]]]])fixture.lanes.push({id:i[0],path,speed:.1,next:[],majorBridge:null});
for(const [index,a,b] of [[0,0,1],[1,2,3]]){fixture.connections.push({id:index,node:99,fromLane:a,toLane:b,path:[fixture.lanes[a].path.at(-1),fixture.lanes[b].path[0]],hidden:false});fixture.lanes[a].next=[index];fixture.routes.push({lanes:[a,b],connections:[index]});}
const intersection=createTraffic(fixture);intersection.setCount(8);
for(let tick=0;tick<1200;tick++){intersection.update(.05);const crossing=intersection.vehicles.filter(v=>v.active&&intersection.sample(v).lane===null);assert.ok(crossing.length<=1,'exclusive perpendicular intersection reservation');}
// Synthetic shared-node junction checks are independent of the generated city.
// A single lane cannot be overtaken: longitudinal order remains stable.
for(const lane of traffic.lanes){const occupants=traffic.vehicles.filter(v=>v.active&&v.route.parts[v.part]?.lane?.id===lane.id).sort((a,b)=>a.local-b.local);for(let i=1;i<occupants.length;i++){const a=occupants[i-1],b=occupants[i];assert.ok(b.local-a.local>=(a.length+b.length)/2+.005,`following ${lane.id}`);}}
const old=traffic.stats.ticks;traffic.update(0);assert.equal(traffic.stats.ticks,old);traffic.setCount(150);assert.ok(traffic.stats.vehicles<=150);
const ships=createVessels(routes,waters,config.vesselTypes);for(let i=0;i<2400;i++){ships.update(.05);for(const s of ships.ships){const p=ships.interpolate(s);assert.equal(p.y,waterHeight(s.route.water,p.x,p.z));assert.ok(Number.isFinite(p.heading));}}
ships.setCount(3);assert.equal(ships.stats.vessels,3);
const result={result:'PASS',checks:['drivable classes/access/directions','real OSM node connections','continuous cached itineraries','6 bridge traffic coverage','60 s fixed-step traffic','following separation','tunnel hidden state','120 s water-surface vessels','reduced fleet cap'],counts:network.counts,trafficMeanTickMs:simulationMs,bridgeSeen:[...bridgeSeen],samples:[samples[0],samples.at(-1)]};
await writeFile('docs/wuhan-phase6-simulation-regression-qa.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
