import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {bridgeRoutes} from './phase61-routes.mjs';
const detail=JSON.parse(await readFile('docs/wuhan-free-bridge-browser-qa.json','utf8'));
const ids=['yangtze-first','yingwuzhou','yangsigang','erqi','qingchuan','yangtze-second'],checks=[];
const routes=await bridgeRoutes();
const starts=new Set(detail.runs.map(r=>r.startSurfaceId)),features=new Map();
for(const file of await readdir('city-data/wuhan/generated'))if(/^road-surface-\d+-\d+\.json$/.test(file)){
 const chunk=JSON.parse(await readFile(`city-data/wuhan/generated/${file}`,'utf8'));
 for(const f of chunk.features)if(starts.has(f.id))features.set(f.id,f);
}
assert.deepEqual(detail.errors,[]);
for(const id of ids)for(const kmh of [25,60])for(const direction of ['A→B','B→A']){
 const matches=detail.runs.filter(r=>r.bridgeId===id&&r.kmh===kmh&&r.direction===direction);assert.equal(matches.length,1);
 const r=matches[0],s=r.ride.state;
 assert.equal(r.result,'PASS');assert.equal(r.ride.recoveryCount,0);assert.deepEqual(r.ride.blockCounts,{});
 const start=features.get(r.startSurfaceId);
 assert.ok(['road','junction'].includes(start?.kind),'start must be a real canonical road or junction');
 assert.equal(start.layerId,'ground-0');
 assert.equal(r.layers[0],'ground-0');assert.ok(r.surfaces.includes('bridge-'+id));
 const route=routes.find(route=>route.bridgeId===id),endpoint=direction==='A→B'?route.path.at(-1):route.path[0];
 const origin=direction==='A→B'?route.path[0]:route.path.at(-1),bounds=start.bounds;
 assert.ok(origin[0]>=bounds[0]-.001&&origin[0]<=bounds[2]+.001&&origin[2]>=bounds[1]-.001&&origin[2]<=bounds[3]+.001,'source ground road contains the route start');
 const endpointDistanceMeters=Math.hypot(s.x-endpoint[0],s.z-endpoint[2])*100;
 // Overlapping OSM ways can supply the same ground endpoint. Check its actual
 // position and canonical ground support, rather than requiring one way ID.
 assert.equal(s.kind,'road');assert.equal(s.layerId,'ground-0');assert.equal(s.canonical,true);
 assert.ok(endpointDistanceMeters<=2.5,'must reach the route ground endpoint');assert.ok(r.maxSpeed>=kmh-.3);
 assert.ok(!r.layers.some(l=>/water|rail/.test(l)),'continuous upper road support');
 checks.push({bridge:id,kmh,direction,result:'PASS',startRoadId:r.startRoadId,endRoadId:r.endRoadId,endSurfaceId:s.surfaceId,endpointDistanceMeters,maxSpeed:r.maxSpeed,recoveryCount:0,blockCounts:{}});
}
assert.equal(detail.runs.length,24);
await writeFile('docs/wuhan-free-bridge-summary.json',JSON.stringify({result:'PASS',policy:'Buildings only; all 24 ground-to-ground browser cases maintain the upper canonical surface.',checks},null,2)+'\n');console.log('PASS 24 free-exploration browser bridge cases');
