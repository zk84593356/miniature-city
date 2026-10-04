import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as T from 'three';
import {createLandmark} from '../../src/atlas/render/landmark-models.js';
import {landmarkCollision} from '../../src/atlas/ride/landmark-collision.js';
const definitions=JSON.parse(await readFile('city-data/wuhan/generated/landmarks.json','utf8')),checks=[];
for(const d of definitions){const model=createLandmark(d),shape=landmarkCollision(model);for(const c of d.components){assert.ok(shape.intersects(c.position[0],c.position[2],c.baseElevation/100+(d.model==='calla'?.065:.005),.0044,.0175),d.id+' body');}checks.push({id:d.id,components:d.components.length,result:'PASS'});model.traverse(o=>o.geometry?.dispose());}
const tower=definitions.find(d=>d.id==='guishan-tower'),model=createLandmark(tower),shape=landmarkCollision(model),c=tower.components[0];
// The source footprint radius is ~19.5 m, but the visible pedestal is <=15 m.
assert.equal(shape.intersects(c.position[0]+.175,c.position[2],c.baseElevation/100+.01,.0044,.0175),false,'empty space inside source footprint must remain passable');
assert.ok(shape.intersects(c.position[0],c.position[2],c.baseElevation/100+.01,.0044,.0175));
const raised=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(.1,.03,.1),new T.MeshBasicMaterial());mesh.geometry.translate(0,.06,0);raised.add(mesh);const arch=landmarkCollision(raised);
assert.equal(arch.intersects(0,0,0,.0044,.0175),false);assert.ok(arch.intersects(0,0,.05,.0044,.0175));
const overlapping=new T.Mesh(mesh.geometry.clone(),mesh.material);overlapping.geometry.translate(.02,0,0);raised.add(overlapping);assert.ok(landmarkCollision(raised).intersects(.015,0,.05,.0044,.0175),'overlapping visible solids do not cancel into a hole');
await writeFile('docs/wuhan-free-landmark-collision-qa.json',JSON.stringify({result:'PASS',checks,sourceFootprintEmptySpacePass:true,raisedVisibleBodyPass:true,overlappingSolidsBlock:true},null,2)+'\n');console.log('PASS actual landmark body sections, empty footprint margins, elevated openings and overlapping solids');
