import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const git=process.env.GIT_PATH??'git',pack='city-data/wuhan/generated',root=path.resolve('.tools/phase6/lf-checkout');
assert.ok(root.startsWith(path.resolve('.tools')+path.sep));
execFileSync(git,['diff','--exit-code','--quiet','--',pack]);
const files=execFileSync(git,['ls-files','--cached','-z','--',pack,'.gitattributes']);
assert.ok(files.includes(Buffer.from(pack+'/manifest.json')),'stage the complete City Pack before verification');
await mkdir(root,{recursive:true});
const checkout=spawnSync(git,['-c','core.autocrlf=false','checkout-index','--force','-z','--stdin','--prefix='+root.replaceAll('\\','/')+'/'],{input:files});
assert.equal(checkout.status,0,checkout.stderr.toString());
const result=execFileSync(process.execPath,['tools/wuhan/verify-pack-bytes.mjs',path.join(root,pack)],{encoding:'utf8'});
const report=JSON.parse(result);report.method='Actual git checkout-index of staged files with .gitattributes and core.autocrlf=false';
const source=JSON.parse(await readFile(pack+'/manifest.json','utf8'));
assert.equal(report.datasetId,source.datasetId);
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=JSON.parse(execFileSync(git,['show','41ed955b25192612cbd8c4912ce6eade9a226c2c:'+pack+'/manifest.json'],{maxBuffer:16*1024*1024}));
report.phase5AssetsPreserved=0;
for(const [name,spec] of Object.entries(base.dataFiles)){
 if(name==='vessel-routes.json')continue;
 const bytes=await readFile(path.join(root,pack,name));assert.equal(hash(bytes),spec.sha256,'immutable Phase 1–5 asset: '+name);report.phase5AssetsPreserved++;
}
const before=JSON.parse(execFileSync(git,['show','41ed955b25192612cbd8c4912ce6eade9a226c2c:'+pack+'/vessel-routes.json'],{maxBuffer:16*1024*1024})),after=JSON.parse(await readFile(path.join(root,pack,'vessel-routes.json')));delete before.obstacles;delete after.obstacles;assert.deepEqual(after,before,'vessel routes unchanged except structure metadata');
report.vesselRoutesUnchanged=true;
await writeFile('docs/wuhan-phase6-checkout-qa.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
