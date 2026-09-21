import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const rideRoot = new URL('../public-overlay/ride/', import.meta.url);
const versionHash = createHash('sha256').update(readFileSync(new URL(import.meta.url)));
for (const name of readdirSync(rideRoot).sort()) versionHash.update(readFileSync(new URL(name, rideRoot)));
export const rideVersion = versionHash.digest('hex').slice(0, 12);
// Narrow, count-checked seams into the preserved scope-hoisted runtime.
// No edits to site/ or its byte-identical src/readable/ slices.
export const rideTransforms = [
  { id: 'R-TRAFFIC-VERSION', from: 'import("./traffic-Cw95n69J.js")', to: `import("./traffic-Cw95n69J.js?ride=${rideVersion}")`, count: 1 },
  { id: 'R-IMPORT', from: '(function(){const e=document', to: 'import {createRide} from "../ride/ride-controller.js";(function(){const e=document', count: 1 },
  { id: 'R-GROUND', from: 'boundary:b,landMaterials:s', to: 'boundary:b,landMaterials:s,rideGround:i.children.filter(m=>m.name==="city-terrain"||m.material===c||m.material?.color?.getHexString()==="a2b389")', count: 1 },
  { id: 'R-CREATE', from: 'Ot().width<700&&K.setDrawer(!1);', to: 'const ride=createRide({three:{Group:Xe,Vector3:R,Mesh:wt,Material:ct,Box:qt,Cylinder:rn,Sphere:Zn,Torus:ur},scene:S,camera:M,controller:v,canvas:T.domElement,root:K.root,geo:g,ground:E.rideGround,placement:N,buildings:I,landmarks:ln,project:ht,excluded:h6().excluded,roads:p.roads,toast:message=>K.toast(message)});Ot().width<700&&K.setDrawer(!1);', count: 1 },
  { id: 'R-UPDATE', from: 'v.update(Ve),re.updateScene', to: '(ride.active?ride.update(Ve):v.update(Ve)),re.updateScene', count: 1 },
  { id: 'R-FRAME', from: 'v.frame(),me=C.target', to: 'ride.active||v.frame(),me=C.target', count: 1 },
  { id: 'R-DISPOSE', from: '_e.dispose(),cancelAnimationFrame(Ae)', to: 'ride.dispose(),_e.dispose(),cancelAnimationFrame(Ae)', count: 1 },
];
