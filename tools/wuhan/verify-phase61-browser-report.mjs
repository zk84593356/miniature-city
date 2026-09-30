import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const ids=['yangtze-first','yingwuzhou','yangsigang','erqi','qingchuan','yangtze-second'];
const reports=await Promise.all(ids.map(async id=>JSON.parse(await readFile(`docs/wuhan-phase61-browser-${id}.json`,'utf8'))));
const runs=reports.flatMap(r=>r.runs),errors=reports.flatMap(r=>r.errors);
const index=JSON.parse(await readFile('city-data/wuhan/generated/road-surfaces.json','utf8'));
const metadata=await Promise.all(index.chunks.map(async c=>JSON.parse(await readFile('city-data/wuhan/generated/'+c.metadata,'utf8'))));
const features=new Map(metadata.flatMap(m=>m.features).map(f=>[f.id,f]));
const checks=[];
for(const id of ids)for(const kmh of [25,60])for(const direction of ['A→B','B→A']){
 const matches=runs.filter(r=>r.bridgeId===id&&r.kmh===kmh&&r.direction===direction);
 assert.equal(matches.length,1,`${id} ${kmh} ${direction}: exactly one complete case`);
 const r=matches[0],state=r.ride?.state,counts=r.ride?.blockCounts??{};
 const endRoad=state?.surfaceId===r.endRoadId||state?.roadIds?.includes(r.endRoadId);
 const start=features.get(r.startSurfaceId);
 checks.push({bridgeId:id,kmh,direction,result:r.result,startRoadId:r.startRoadId,endRoadId:r.endRoadId,startSurfaceId:r.startSurfaceId,endSurfaceId:state?.surfaceId,startIsGroundRoad:start?.rideAllowed&&['road','junction'].includes(start.kind),endIsGroundRoad:state?.kind==='road'&&endRoad,mainDeckVisited:r.surfaces?.includes('bridge-'+id),maxSpeed:r.maxSpeed,blockCounts:counts,recoveryCount:r.ride?.recoveryCount,surfaceMissingCount:counts['surface-missing']??0,loadingBlockCount:counts.loading??0,wrongLayerCount:counts['layer-transition']??0,waterTransitionCount:counts.water??0,surfaceSequence:r.surfaces,layerSequence:r.layers});
}
const failed=checks.filter(c=>c.result!=='PASS'||!c.startIsGroundRoad||!c.endIsGroundRoad||!c.mainDeckVisited||c.maxSpeed<c.kmh-.3||c.recoveryCount||Object.keys(c.blockCounts).some(k=>k!=='traffic'));
const report={result:failed.length||errors.length?'FAIL':'PASS',method:'24 actual browser RideController cases; ordinary road spawn only, then throttle/steer/brake with live traffic and full collisions. Slow cornering and reversing to avoid traffic are permitted. No runtime position writes, recovery, explicit mid-route loading or disabled collision.',cases:checks,failed,errors,detailReports:ids.map(id=>`wuhan-phase61-browser-${id}.json`)};
await writeFile('docs/wuhan-phase61-bridge-browser-qa.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.result,'PASS',JSON.stringify(failed));console.log('PASS 24 ground-to-ground browser ride cases');
