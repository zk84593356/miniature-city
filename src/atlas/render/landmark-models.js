import * as THREE from 'three';

export const landmarkPalette={traditionalRoof:'#bb8735',traditionalWall:'#dbd1b9',column:'#994d3a',stone:'#c2bba7',historicWhite:'#e6e1cf',glassTower:'#7b9b9e',metal:'#b6b9b2',stationRoof:'#e3e3d7',museumRoof:'#666f68',campusRoof:'#497d70',concrete:'#b8b5a5',dark:'#425c5a',gold:'#c2a455'};
const materials=Object.fromEntries(Object.entries(landmarkPalette).map(([key,color])=>[key,new THREE.MeshStandardMaterial({color,roughness:key==='glassTower'?.34:.8,metalness:key==='glassTower'?.22:.08,side:THREE.DoubleSide})]));
export const landmarkMaterials=materials;
const up=new THREE.Vector3(0,1,0);

// Every repeated column, eave, mullion and roof strip is baked into one buffer
// per palette material per landmark. No runtime CSG, remote textures or GLBs.
function builder(transform,buckets){
  function add(key,g,matrix=new THREE.Matrix4()){
    g.applyMatrix4(matrix);g.applyMatrix4(transform);
    const b=buckets[key]??= {p:[],n:[],i:[]},offset=b.p.length/3;
    for(const v of g.attributes.position.array)b.p.push(v);
    for(const v of g.attributes.normal.array)b.n.push(v);
    for(const v of g.index?.array??Array.from({length:g.attributes.position.count},(_,i)=>i))b.i.push(offset+v);
    g.dispose();
  }
  const box=(key,x,y,z,w,h,d,angle=0)=>add(key,new THREE.BoxGeometry(w,h,d),new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(up,angle),new THREE.Vector3(1,1,1)));
  const cylinder=(key,x,y,z,rt,rb,h,n=16)=>add(key,new THREE.CylinderGeometry(rt,rb,h,n),new THREE.Matrix4().makeTranslation(x,y,z));
  function beam(key,a,b,width){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);add(key,new THREE.CylinderGeometry(width/2,width/2,delta.length(),6),new THREE.Matrix4().compose(start.add(end).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()),new THREE.Vector3(1,1,1)));}
  function surface(key,rows){
    const points=rows.flat(),p=points.flat(),indices=[],cols=rows[0].length;
    for(let j=1;j<rows.length;j++)for(let i=1;i<cols;i++){const a=(j-1)*cols+i-1,b=a+1,c=j*cols+i-1,d=c+1;indices.push(a,c,b,b,c,d);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();add(key,g);
  }
  function roof(key,w,d,y,h,cx=0,cz=0,clip=.24){
    const outline=[[-1+clip,-1],[1-clip,-1],[1,-1+clip],[1,1-clip],[1-clip,1],[-1+clip,1],[-1,1-clip],[-1,-1+clip],[-1+clip,-1]];
    const contour=[];
    for(let i=1;i<outline.length;i++)for(let j=0;j<4;j++){const t=j/4,a=outline[i-1],b=outline[i];contour.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,Math.pow(Math.abs(t-.5)*2,3)]);}
    contour.push(contour[0]);
    const rings=[[.44,.04,h,0],[.62,.62,h*.42,0],[.88,.88,0,0],[1,1,h*.12,h*.3]];
    const rows=rings.map(([sx,sz,dy,lift])=>contour.map(([x,z,corner])=>[cx+x*w*.5*sx,y+dy+corner*lift,cz+z*d*.5*sz]));
    surface(key,rows);surface(key,[rows[0],rows[0].map(()=>[cx,y+h,cz])]);
    surface('dark',[rows.at(-1),rows.at(-1).map(([x,yy,z])=>[x,yy-.28,z])]);
    beam(key,[cx-w*.22,y+h,cz],[cx+w*.22,y+h,cz],.7);
  }
  function columns(w,d,base,h,count=5,key='column'){
    for(let i=0;i<count;i++)for(const z of [-d/2,d/2])cylinder(key,-w/2+w*i/(count-1),base+h/2,z,.45,.55,h,8);
    for(let i=1;i<count-1;i++)for(const x of [-w/2,w/2])cylinder(key,x,base+h/2,-d/2+d*i/(count-1),.45,.55,h,8);
  }
  return {add,box,cylinder,beam,surface,roof,columns};
}
function traditional(b,c,kind){
  const h=c.height,w=c.width*.92,d=c.depth*.92;
  b.box('stone',0,.9,0,w,1.8,d);
  if(kind==='yellow-crane'){
    for(let level=0;level<5;level++){
      const base=2+level*8.55,scale=1-level*.075,cw=w*scale,cd=d*scale;
      b.box('traditionalWall',0,base+2.6,0,cw*.55,5.2,cd*.55);
      b.columns(cw*.71,cd*.71,base,5.7,5);
      b.box('stone',0,base+.15,0,cw*.86,.3,cd*.86);
      for(const z of [-cd*.43,cd*.43]){b.box('column',0,base+1.1,z,cw*.86,.26,.3);for(let i=0;i<14;i++)b.box('column',(-.42+i*.84/13)*cw,base+.65,z,.18,1.2,.2);}
      b.roof('traditionalRoof',cw,cd,base+5.6,level===4?7.6:4.3);
      if(level<4)b.roof('traditionalRoof',cw*.78,cd*.78,base+7.6,2.1);
    }
    b.cylinder('gold',0,h-.65,0,.25,.4,1.3,8);
  }else{
    const levels=kind==='xingyin'?3:2;
    const step=(h-3)/levels;
    for(let i=0;i<levels;i++){
      const scale=1-i*.14,base=1.8+i*step;
      b.box('traditionalWall',0,base+step*.31,0,w*scale*.72,step*.62,d*scale*.7);
      b.columns(w*scale*.78,d*scale*.76,base,step*.64,kind==='qingchuan'?5:3);
      b.roof(kind==='xingyin'?'campusRoof':'museumRoof',w*scale,d*scale,base+step*.62,step*.37);
    }
  }
}
function customs(b,c){
  const w=c.width*.94,d=c.depth*.94,h=c.height;
  b.box('stone',0,1,0,w,2,d);b.box('historicWhite',0,11,0,w*.93,20,d*.9);
  for(const y of [5.5,11.5,17.5])for(let i=0;i<7;i++)for(const z of [-d*.452,d*.452])b.box('dark',(i-3)*w*.12,y,z,w*.056,3,.15);
  b.columns(w*.78,d*.83,2,18,7,'historicWhite');
  for(const y of [6,13,21])b.box('stone',0,y,0,w,1,d);
  const outline=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
  b.surface('museumRoof',[[1,21],[.7,24]].map(([s,y])=>outline.map(([x,z])=>[x*w*.49*s,y,z*d*.49*s])));
  b.box('museumRoof',0,24,0,w*.7,.4,d*.7);
  const z=-d*.17;
  b.box('historicWhite',0,31,z,w*.28,20,d*.29);
  for(const y of [25,37,41])b.box('stone',0,y,z,w*.32,.7,d*.33);
  // Four geometric clock faces, with hands; no photo planes.
  for(let i=0;i<4;i++){
    const angle=i*Math.PI/2,normal=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
    const center=new THREE.Vector3(0,35,z).addScaledVector(normal,(i%2?w*.14:d*.145)+.1);
    b.add('dark',new THREE.CylinderGeometry(2.05,2.05,.15,24),new THREE.Matrix4().compose(center,new THREE.Quaternion().setFromUnitVectors(up,normal),new THREE.Vector3(1,1,1)));
    const tangent=new THREE.Vector3(normal.z,0,-normal.x);const front=center.clone().addScaledVector(normal,.1);
    b.beam('gold',front.toArray(),front.clone().add(new THREE.Vector3(0,1.45,0)).toArray(),.17);b.beam('gold',front.toArray(),front.clone().addScaledVector(tangent,1.2).toArray(),.17);
  }
  b.box('stone',0,41.5,z,w*.34,1,d*.35);
  b.cylinder('museumRoof',0,43.5,z,1.1,Math.min(w,d)*.18,3,4);
  b.cylinder('gold',0,h-.7,z,.2,.3,1.4,8);
}
function tower(b,c,kind){
  const h=c.height,w=c.width*.88,d=c.depth*.88;
  b.box('stone',0,1.5,0,w,3,d);
  const sections=kind==='greenland'?28:24,levels=18,rows=[];
  for(let j=0;j<=levels;j++){
    const t=j/levels,shrink=kind==='greenland'?1-.47*Math.pow(t,2):1-.38*Math.pow(t,3),row=[];
    for(let i=0;i<=sections;i++){
      const a=i/sections*Math.PI*2,tri=kind==='greenland'?1+.15*Math.cos(a*3):1,turn=kind==='wuhan-center'?.2*Math.sin(t*Math.PI):0;
      const yy=h*t-(kind==='wuhan-center'?Math.pow(t,9)*h*.055*(1+Math.cos(a)):0);
      row.push([Math.cos(a+turn)*w*.5*shrink*tri,Math.max(3,yy),Math.sin(a+turn)*d*.5*shrink*tri]);
    }rows.push(row);
  }
  b.surface('glassTower',rows);
  b.surface('metal',[rows.at(-1),rows.at(-1).map(([x,y,z])=>[x*.07,y,z*.07])]);
  for(let i=0;i<sections;i+=2)for(let j=1;j<rows.length;j++)b.beam('metal',rows[j-1][i],rows[j][i],.5);
  // Sparse facade bands suggest storeys without individual window geometry.
  for(let j=1;j<rows.length-1;j+=2)for(let i=1;i<=sections;i++)b.beam('metal',rows[j][i-1],rows[j][i],.28);
}
function television(b,c){
  const h=c.height;
  b.cylinder('concrete',0,2,0,12,15,4,16);
  b.cylinder('historicWhite',0,h*.35,0,4,8,h*.7,16);
  b.cylinder('stone',0,h*.665,0,16,7,6,24);
  b.cylinder('glassTower',0,h*.69,0,16,16,7,32);
  b.cylinder('historicWhite',0,h*.715,0,11,17,5,24);
  b.cylinder('historicWhite',0,h*.775,0,3,4,h*.13,12);
  b.cylinder('metal',0,h*.905,0,.45,2,h*.19,10);
  for(let i=0;i<5;i++)b.cylinder(i%2?'historicWhite':'column',0,h*(.83+i*.03),0,1.9-i*.2,1.9-i*.2,3,10);
}
function campus(b,c){
  const w=c.width*.94,d=c.depth*.94,h=c.height;
  b.box('stone',0,1,0,w,2,d);b.box('traditionalWall',0,h*.29,0,w*.91,h*.54,d*.87);
  if(c.name==='老图书馆'){
    b.roof('campusRoof',w,d,h*.5,3);
    b.cylinder('traditionalWall',0,h*.7,0,Math.min(w,d)*.21,Math.min(w,d)*.23,h*.34,8);
    b.roof('campusRoof',w*.56,d*.56,h*.79,h*.11);
    b.roof('campusRoof',w*.48,d*.48,h*.88,h*.12);
  }else b.roof('campusRoof',w,d,h*.56,h*.44);
  for(const z of [-d*.438,d*.438])for(let i=0;i<9;i++)b.box('dark',(i-4)*w*.09,h*.32,z,w*.035,h*.21,.2);
  // A short entrance stair remains inside the footprint; ground is unmodified.
  for(let i=0;i<6;i++)b.box('stone',0,.2+i*.16,d*(.39-i*.008),w*.25,.4+i*.32,d*.025);
}
function museum(b,c){
  const w=c.width*.94,d=c.depth*.94,h=c.height;
  b.box('stone',0,1,0,w,2,d);b.box('traditionalWall',0,h*.3,0,w*.86,h*.56,d*.82);
  if(w>70){
    b.roof('museumRoof',w,d,h*.56,h*.18);
    b.box('traditionalWall',0,h*.77,0,w*.62,h*.18,d*.55);
    b.roof('museumRoof',w*.73,d*.72,h*.84,h*.16);
    for(let i=0;i<11;i++)b.box('column',(i-5)*w*.072,h*.31,d*.415,1.3,h*.42,1.4);
  }else b.roof('museumRoof',w,d,h*.55,h*.45);
}
function station(b,c){
  const w=c.width*.96,d=c.depth*.94,h=c.height;
  b.box('stone',0,1,0,w,2,d);b.box('glassTower',0,h*.24,0,w*.91,h*.44,d*.87);
  // Nine parallel crane-wing roof bays follow the source station's long axis.
  for(let bay=0;bay<9;bay++){
    const x0=-w*.5+bay*w/9,rows=[];
    for(let j=0;j<=18;j++){
      const z=(j/18-.5)*d,t=j/18;
      rows.push(Array.from({length:5},(_,i)=>{const u=i/4;return [x0+u*w/9,h*(.52+.36*Math.pow(Math.abs(t-.5)*2,1.6)+.12*Math.sin(u*Math.PI)),z];}));
    }b.surface('stationRoof',rows);
    for(let j=1;j<rows.length;j++)b.beam('metal',rows[j-1][2],rows[j][2],.8);
  }
  for(let i=0;i<22;i++)for(const z of [-d*.435,d*.435])b.box('metal',(i/21-.5)*w*.91,h*.23,z,.7,h*.45,.8);
}
function calla(b,c){
  const w=c.width,d=c.depth,h=c.height;
  // Five leaf laboratories and a flared, asymmetric calla corolla.
  for(let leaf=0;leaf<5;leaf++){
    const a=leaf*Math.PI*2/5,center=[Math.cos(a)*w*.29,Math.sin(a)*d*.29];
    const rows=[];
    for(let j=0;j<=10;j++){const t=j/10;rows.push(Array.from({length:15},(_,i)=>{const angle=i/14*Math.PI*2;return [center[0]+Math.cos(angle)*w*.18*Math.sin(t*Math.PI),3+Math.sin(t*Math.PI/2)*17,center[1]+Math.sin(angle)*d*.15*Math.sin(t*Math.PI)];}));}
    b.surface('historicWhite',rows);
  }
  const radius=Math.min(w,d)*.19,rows=[];
  for(let j=0;j<=20;j++){
    const t=j/20;rows.push(Array.from({length:49},(_,i)=>{const a=i/48*Math.PI*2,r=radius*(.36+.87*Math.pow(t,2.7)),y=5+t*(h*.85-5)+Math.pow(t,7)*h*.12*Math.sin(a);return [r*Math.cos(a),y,r*Math.sin(a)];}));
  }
  b.surface('historicWhite',rows);
  const lip=rows.at(-1);b.surface('glassTower',[lip,lip.map(([x,y,z])=>[x*.25,h*.70,z*.25])]);
  for(let i=0;i<48;i+=4)for(let j=1;j<rows.length;j++)b.beam('metal',rows[j-1][i],rows[j][i],.55);
  b.cylinder('gold',0,h*.85,0,2.4,3,h*.3,12);
}
function theatre(b,c){
  const w=c.width*.94,d=c.depth*.94,h=c.height;
  b.box('stone',0,1,0,w,2,d);b.box('glassTower',0,h*.29,0,w*.87,h*.54,d*.78);
  b.box('historicWhite',-w*.16,h*.38,0,w*.35,h*.7,d*.55);
  // Staggered rising ribbon roofs evoke the theatre's projecting qin keys.
  for(let band=0;band<9;band++){
    const rows=[];
    for(let j=0;j<=14;j++){const t=j/14;rows.push([0,1].map(u=>[(band/9-.5+u/9)*w,h*(.65+.3*Math.pow(2*t-1,2)+.05*Math.sin(band)),(t-.5)*d]));}
    b.surface('metal',rows);
    for(let j=1;j<rows.length;j++)b.beam('historicWhite',rows[j-1][0],rows[j][0],1.2);
  }
  for(let i=0;i<14;i++)b.box('historicWhite',(i/13-.5)*w*.9,h*.32,-d*.4,1.6,h*.6,1.6);
}

export function createLandmark(definition){
  const buckets={};
  for(const c of definition.components){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...c.position),new THREE.Quaternion().setFromAxisAngle(up,c.rotation),new THREE.Vector3(.01,.01,.01));
    const b=builder(matrix,buckets),kind=definition.model;
    // Footprint-scale skirt contacts the published DSM without moving terrain.
    const skirt=Math.min(12,Math.max(0,c.baseElevation-c.terrainRange[0]));
    if(skirt>.1)b.box('stone',0,-skirt/2,0,c.width*.72,skirt,c.depth*.72);
    if(['yellow-crane','qingchuan','xingyin'].includes(kind))traditional(b,c,kind);
    else if(kind==='customs')customs(b,c);
    else if(['greenland','wuhan-center'].includes(kind))tower(b,c,kind);
    else if(kind==='tv-tower')television(b,c);
    else if(kind==='university')campus(b,c);
    else if(kind==='museum')museum(b,c);
    else if(kind==='station')station(b,c);
    else if(kind==='calla')calla(b,c);
    else if(kind==='theatre')theatre(b,c);
  }
  const group=new THREE.Group();group.name=definition.id;
  for(const [key,b] of Object.entries(buckets)){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setIndex(b.i);g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,materials[key]);mesh.userData.placeId=definition.id;group.add(mesh);
  }
  group.updateMatrixWorld(true);group.userData={placeId:definition.id,bounds:new THREE.Box3().setFromObject(group),definition};
  return group;
}
export function disposeLandmarkMaterials(){Object.values(materials).forEach(m=>m.dispose());}
