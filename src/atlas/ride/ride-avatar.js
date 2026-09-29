import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SCALE} from './ride-motion.js';
import {MopedAnimation,solveLimb} from './ride-animation.js';

// Original, unbranded, adult-proportioned seated rider. All dimensions are metres.
export class WuhanRideAvatar{
  constructor(){
    this.root=new T.Group();this.root.name='wuhan-pink-moped';this.root.scale.setScalar(SCALE);
    const material=(color,roughness=.65)=>new T.MeshStandardMaterial({color,roughness,metalness:.02});
    const pink=material('#e9a2b3',.38),edge=material('#f7c7cf',.45),seat=material('#ba7d89'),dark=material('#343638'),rubber=material('#202326',.94),metal=material('#b5c0c1',.32),white=material('#f6eee5'),hoodie=material('#efbccb'),seam=material('#d49aaa'),skin=material('#e5b49d'),hair=material('#493129'),hairLight=material('#614437'),eye=material('#392c2a'),lip=material('#c87978');
    this.lamp=material('#fff5dd');this.lamp.emissive.set('#fff0ce');this.lamp.emissiveIntensity=.8;
    this.tail=material('#e94e60');this.tail.emissive.set('#f62846');this.tail.emissiveIntensity=.65;
    const sphere=new T.SphereGeometry(1,16,12),cylinder=new T.CylinderGeometry(1,1,1,12),up=new T.Vector3(0,1,0),delta=new T.Vector3();
    const fixed=new Map();
    const mesh=(parent,g,m,pos=[0,0,0],scale=[1,1,1],dynamic=false)=>{
      const o=new T.Mesh(g,m);o.position.fromArray(pos);o.scale.fromArray(scale);parent.add(o);
      if(!dynamic){if(!fixed.has(parent))fixed.set(parent,[]);fixed.get(parent).push(o);}return o;
    };
    const ell=(p,s,v,m,d=false)=>mesh(p,sphere,m,v,s,d);
    const box=(p,s,v,m,r=.03)=>{
      const g=new T.BoxGeometry(...s,3,3,3),a=g.attributes.position,pt=new T.Vector3(),inner=new T.Vector3();r=Math.min(r,...s.map(x=>x/3));
      for(let i=0;i<a.count;i++){pt.fromBufferAttribute(a,i);inner.set(...pt.toArray().map((v,j)=>T.MathUtils.clamp(v,-s[j]/2+r,s[j]/2-r)));pt.sub(inner).normalize().multiplyScalar(r).add(inner);a.setXYZ(i,...pt.toArray());}g.computeVertexNormals();return mesh(p,g,m,v);
    };
    this.segment=(o,a,b,r)=>{delta.subVectors(b,a);o.position.copy(a).addScaledVector(delta,.5);o.scale.set(r,delta.length(),r);o.quaternion.setFromUnitVectors(up,delta.normalize());};
    const rod=(p,a,b,r,m)=>{const o=mesh(p,cylinder,m);this.segment(o,new T.Vector3(...a),new T.Vector3(...b),r);return o;};
    const ring=(p,r,t,m,pos=[0,0,0],axis='x')=>{const o=mesh(p,new T.TorusGeometry(r,t,8,32),m,pos);if(axis==='x')o.rotation.y=Math.PI/2;return o;};
    const body=this.root;
    box(body,[.46,.14,1.04],[0,.26,0],dark,.06);
    box(body,[.48,.07,.76],[0,.345,.02],pink,.04);
    box(body,[.37,.025,.55],[0,.386,.065],rubber,.018);
    // Rounded rear shell, long saddle and step-through front apron.
    ell(body,[.265,.235,.47],[0,.56,-.38],pink);
    box(body,[.43,.15,.79],[0,.785,-.29],seat,.05);
    box(body,[.44,.035,.70],[0,.705,-.31],edge,.02);
    // Piping follows the saddle and skirt; fixed detail shares material batches.
    for(const side of [-1,1]){
      rod(body,[side*.195,.820,-.61],[side*.195,.825,-.01],.0035,edge);
      rod(body,[side*.23,.42,-.43],[side*.23,.43,.28],.004,edge);
      for(let i=0;i<5;i++)box(body,[.008,.003,.32],[side*(.07+i*.017),.400,.075],dark,.001);
      rod(body,[side*.14,.29,-.38],[side*.22,.19,-.33],.010,metal);
      box(body,[.05,.010,.11],[side*.22,.185,-.33],dark,.002);
      box(body,[.011,.02,.10],[side*.204,.56,.44],this.lamp,.003);
    }
    const apron=ell(body,[.245,.38,.14],[0,.65,.43],pink);apron.rotation.x=-.16;
    const inner=ell(body,[.205,.34,.09],[0,.66,.32],dark);inner.rotation.x=-.16;
    box(body,[.32,.065,.30],[0,.405,.36],pink,.025);
    for(const side of [-1,1]){
      rod(body,[side*.18,.55,-.63],[side*.18,.78,-.69],.014,metal);
      rod(body,[side*.18,.78,-.69],[side*.18,.91,-.63],.017,dark);
      rod(body,[side*.15,.28,-.58],[side*.19,.61,-.51],.027,dark);
      for(let i=0;i<7;i++)ring(body,.031,.007,metal,[side*.185,.37+i*.027,-.555+i*.006],'z').rotation.x=Math.PI/2;
      box(body,[.015,.045,.27],[side*.253,.57,-.36],metal,.01);
    }
    rod(body,[-.18,.91,-.63],[.18,.91,-.63],.017,dark);
    box(body,[.25,.065,.035],[0,.625,-.852],this.tail,.014);
    box(body,[.19,.16,.025],[0,.42,-.83],pink,.012);
    box(body,[.14,.065,.25],[-.19,.28,-.47],dark,.026);
    this.steering=new T.Group();this.steering.position.set(0,.23,.43);body.add(this.steering);
    for(const side of [-1,1])rod(this.steering,[side*.072,0,.15],[side*.072,.57,.02],.025,metal);
    const fender=ell(this.steering,[.115,.095,.25],[0,.21,.155],pink);
    fender.name='front-fender';
    rod(this.steering,[0,.54,.02],[0,.81,-.15],.044,dark);
    ell(this.steering,[.22,.092,.10],[0,.83,-.14],pink);
    this.grips=[];
    for(const side of [-1,1]){
      rod(this.steering,[0,.83,-.14],[side*.33,.82,-.24],.023,dark);
      rod(this.steering,[side*.23,.79,-.19],[side*.33,.79,-.16],.007,metal);
      rod(this.steering,[side*.22,.85,-.14],[side*.29,1.09,-.09],.009,dark);
      ell(this.steering,[.067,.079,.016],[side*.29,1.12,-.09],pink);
      ell(this.steering,[.059,.071,.008],[side*.29,1.12,-.106],dark);
      ell(this.steering,[.054,.065,.005],[side*.29,1.12,-.114],metal);
      const grip=new T.Group();grip.position.set(side*.285,.82,-.255);this.steering.add(grip);this.grips.push(grip);
    }
    // Circular headlamp, mounted on the apron, without an extra scene light.
    ring(body,.105,.017,metal,[0,.90,.555],'z');ell(body,[.093,.093,.022],[0,.90,.556],dark);
    ring(body,.082,.008,this.lamp,[0,.90,.578],'z');box(body,[.143,.019,.011],[0,.90,.579],this.lamp,.003);
    this.wheels=[];
    for(const [parent,pos] of [[body,[0,.23,-.58]],[this.steering,[0,0,.15]]]){
      const wheel=new T.Group();wheel.position.fromArray(pos);parent.add(wheel);this.wheels.push(wheel);
      ring(wheel,.174,.056,rubber);ring(wheel,.139,.012,metal);
      rod(wheel,[-.07,0,0],[.07,0,0],.052,dark);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;rod(wheel,[0,0,0],[0,Math.sin(a)*.137,Math.cos(a)*.137],.011,metal);}
      ring(wheel,.098,.009,metal,[-.058,0,0]);
      const disc=mesh(wheel,new T.CylinderGeometry(.102,.102,.005,20),metal,[-.055,0,0]);disc.rotation.z=Math.PI/2;
      for(let i=0;i<10;i++){const a=i*Math.PI/5;ell(wheel,[.003,.006,.006],[-.059,Math.sin(a)*.077,Math.cos(a)*.077],dark);}
      for(let i=0;i<20;i++){const a=i*Math.PI/10;const tread=box(wheel,[.062,.006,.023],[0,Math.cos(a)*.228,Math.sin(a)*.228],dark,.001);tread.rotation.x=a;}
    }
    // Adult seated proportions: head height 23 cm, shoulders 36 cm, not a chibi rig.
    ell(body,[.18,.095,.17],[0,.885,-.245],white);
    this.torso=new T.Group();this.torso.position.set(0,.89,-.22);body.add(this.torso);
    ell(this.torso,[.165,.205,.112],[0,.21,0],hoodie);
    ell(this.torso,[.187,.08,.115],[0,.385,0],hoodie);
    box(this.torso,[.28,.042,.21],[0,.036,0],seam,.014);
    box(this.torso,[.08,.32,.018],[0,.23,.108],white,.008);
    for(const side of [-1,1]){
      const lapel=box(this.torso,[.032,.31,.019],[side*.052,.235,.119],edge,.007);lapel.rotation.z=side*.07;
      rod(this.torso,[side*.085,.39,.125],[side*.065,.24,.133],.004,white);
      ell(this.torso,[.088,.095,.060],[side*.065,.37,-.11],edge);
    }
    rod(this.torso,[0,.40,0],[0,.49,.012],.041,skin);
    ell(this.torso,[.094,.119,.086],[0,.57,.015],skin);
    ell(this.torso,[.071,.063,.066],[0,.51,.034],skin);
    // Thin swept crown and separated shoulder-length locks leave the nape open.
    ell(this.torso,[.096,.057,.079],[0,.645,-.006],hair);
    for(let i=0;i<5;i++){
      const lock=ell(this.torso,[.025,.075-Math.abs(i-2)*.006,.026],[(i-2)*.028,.578,-.055-Math.abs(i-2)*.004],i%2?hairLight:hair);lock.rotation.z=(i-2)*.09;
    }
    this.hairGroups=[];
    const pony=new T.Group();pony.position.set(0,.627,-.077);this.torso.add(pony);this.hairGroups.push(pony);
    ring(pony,.026,.006,pink,[0,-.006,-.013],'z');
    for(let i=0;i<3;i++){const lock=ell(pony,[.020,.071+i*.008,.022],[(i-1)*.025,-.065-i*.011,-.029],i===1?hairLight:hair);lock.rotation.z=(i-1)*.20;lock.rotation.x=.22;}
    for(const side of [-1,1]){
      ell(this.torso,[.015,.026,.018],[side*.093,.566,.009],skin);
      ell(this.torso,[.022,.011,.009],[side*.038,.585,.092],white);
      ell(this.torso,[.010,.011,.005],[side*.039,.585,.100],eye);
      ell(this.torso,[.003,.004,.002],[side*.036,.589,.104],white);
      rod(this.torso,[side*.020,.609,.091],[side*.057,.610,.089],.004,hair);
      const sideHair=new T.Group();sideHair.position.set(side*.077,.607,-.025);this.torso.add(sideHair);this.hairGroups.push(sideHair);
      for(let j=0;j<3;j++){
        const lock=ell(sideHair,[.016,.084+j*.01,.018],[side*j*.011,-.06-j*.024,-j*.020],j%2?hairLight:hair);lock.rotation.z=side*(.09+j*.08);
      }
      for(let j=0;j<3;j++){const fringe=ell(this.torso,[.012,.035-j*.005,.012],[side*(.015+j*.024),.631+j*.004,.084-j*.004],j===1?hairLight:hair);fringe.rotation.z=-side*(.20+j*.12);}
    }
    ell(this.torso,[.014,.024,.018],[0,.561,.098],skin);
    ell(this.torso,[.026,.005,.007],[0,.527,.095],lip);
    for(let i=0;i<2;i++){const clip=box(this.torso,[.012,.038,.009],[.086+i*.008,.624-i*.025,.050],pink,.003);clip.rotation.z=-.35;}
    const pack=new T.Group();pack.position.set(0,.19,-.153);this.torso.add(pack);
    box(pack,[.255,.28,.115],[0,0,0],pink,.035);box(pack,[.21,.145,.038],[0,-.029,-.072],edge,.018);
    box(pack,[.25,.05,.12],[0,.117,-.004],edge,.018);
    for(const side of [-1,1]){
      box(pack,[.025,.095,.014],[side*.072,.092,-.072],white,.004);
      box(pack,[.03,.022,.017],[side*.072,.055,-.084],metal,.003);
      rod(this.torso,[side*.125,.36,-.135],[side*.145,.414,.036],.012,edge);
      rod(this.torso,[side*.145,.414,.036],[side*.133,.09,.097],.012,edge);
    }
    rod(pack,[-.043,.14,0],[-.043,.18,0],.009,edge);rod(pack,[-.043,.18,0],[.043,.18,0],.009,edge);rod(pack,[.043,.18,0],[.043,.14,0],.009,edge);
    this.arms=[-1,1].map((side,i)=>({side,grip:this.grips[i],upper:mesh(body,cylinder,hoodie,[0,0,0],[1,1,1],true),lower:mesh(body,cylinder,hoodie,[0,0,0],[1,1,1],true),elbow:ell(body,[.062,.062,.062],[0,0,0],hoodie,true),shoulder:ell(body,[.07,.07,.07],[0,0,0],hoodie,true),hand:ell(body,[.044,.032,.038],[0,0,0],skin,true)}));
    this.feet=[];
    for(const side of [-1,1]){
      const start=new T.Vector3(side*.13,.88,-.23),target=new T.Vector3(side*.17,.456,.12),joint=new T.Vector3(),end=new T.Vector3();
      solveLimb(start,target,.42,.40,new T.Vector3(side*.19,.66,.48),joint,end);
      rod(body,start.toArray(),joint.toArray(),.086,white);ell(body,[.07,.065,.065],joint.toArray(),white);rod(body,joint.toArray(),end.toArray(),.053,white);
      const shoe=new T.Group();shoe.position.copy(target);body.add(shoe);this.feet.push(shoe);
      box(shoe,[.115,.032,.247],[0,-.041,.031],edge,.012);box(shoe,[.108,.071,.22],[0,-.004,.031],white,.024);
      for(let i=0;i<3;i++)box(shoe,[.062,.007,.013],[0,.033,.025+i*.020],seam,.002);
    }
    // Batch fixed details by parent/material; moving wheels, steering and IK stay independent.
    const originals=new Set();
    for(const [parent,items] of fixed){const groups=new Map();for(const o of items){o.updateMatrix();if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrix));originals.add(o.geometry);parent.remove(o);}
      for(const [m,gs] of groups){const merged=mergeGeometries(gs);parent.add(new T.Mesh(merged,m));gs.forEach(g=>g.dispose());}}
    // Shared primitives still used by animated limbs/hands are kept alive.
    for(const g of originals)if(g!==sphere&&g!==cylinder)g.dispose();
    const shadow=new T.Mesh(new T.CircleGeometry(1,32),new T.MeshBasicMaterial({color:'#463b39',transparent:true,opacity:.13,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(.30,.77,1);shadow.position.y=.002;body.add(shadow);
    this.animation=new MopedAnimation(this);this.animate(0,0,0,false,0);
  }
  animate(dt,speed,steering,brake,travel,reduced=false){this.animation.update(dt,speed,steering,brake,travel,reduced);this.tail.emissiveIntensity=brake?2:.65;}
  resources(){let triangles=0,drawCalls=0;const geometries=new Set(),materials=new Set();this.root.traverse(o=>{if(o.geometry){geometries.add(o.geometry.id);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;drawCalls++;}if(o.material)materials.add(o.material.id);});return {geometries:[...geometries],materials:[...materials],triangles,drawCalls};}
  dispose(){const g=new Set(),m=new Set();this.root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});g.forEach(v=>v.dispose());m.forEach(v=>v.dispose());this.root.removeFromParent();}
}
