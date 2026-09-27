import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createBridge} from '../../src/atlas/render/bridges.js';
import {waterAt,waterHeight} from '../../src/atlas/geo/projection.js';
const root='city-data/wuhan/generated/';
const waters=JSON.parse(await readFile(root+'water.json'));
const bridges=JSON.parse(await readFile(root+'bridges.json'));
const result=bridges.map(b=>{
  const group=createBridge(b,{register(){},sample(x,z){const w=waterAt(x,z,waters);return w?{kind:'water',height:waterHeight(w,x,z)}:null;}});
  const obstacles=group.userData.obstacles;
  group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  return {id:b.id,obstacles};
});
await mkdir('.tools/phase4',{recursive:true});
await writeFile('.tools/phase4/bridge-obstacles.json',JSON.stringify(result)+'\n');
console.log('Exported obstacles from the unchanged Phase 2 bridge constructor');
