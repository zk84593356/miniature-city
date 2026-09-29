import {writeFile,mkdir} from 'node:fs/promises';
import {fixture} from './phase6-fixture.mjs';
const {urban}=await fixture();
const result=urban.bridges.children.map(b=>({id:b.userData.bridgeId,obstacles:b.userData.obstacles}));
await mkdir('.tools/phase4',{recursive:true});
await writeFile('.tools/phase4/bridge-obstacles.json',JSON.stringify(result)+'\n');
console.log('Exported exact canonical bridge structure obstacles');
