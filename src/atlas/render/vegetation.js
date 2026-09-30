import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function createVegetation(pack){
  const group=new T.Group(),entries=[],material=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
  let disposed=false,quality=matchMedia('(max-width: 700px)').matches?'low':'high',index=null;
  const stats={trees:0,shrubs:0,flowers:0,visibleTrees:0,visibleInstances:0,drawCalls:0,triangles:0};
  function colored(g,color,scale,position){g.scale(...scale);g.translate(...position);const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(a,3));return g;}
  function treeShape(variant,low){
    const trunk=colored(new T.CylinderGeometry(.025,.036,.62,low?4:6).toNonIndexed(),'#786957',[1,1,1],[0,.31,0]);
    const crown=variant===2?new T.ConeGeometry(.28,.83,low?4:7).toNonIndexed():new T.IcosahedronGeometry(1,low?0:1);
    const gs=[trunk,colored(crown,['#7d9478','#93a087','#6f8975'][variant],variant===2?[1,1,1]:[.30,variant===1?.48:.33,.29],[0,.71,0])];
    const g=mergeGeometries(gs);gs.forEach(g=>g.dispose());return g;
  }
  const geometries=[0,1,2].map(v=>[treeShape(v,false),treeShape(v,true)]);
  geometries.push([colored(new T.IcosahedronGeometry(1,1),'#91a184',[.60,.5,.50],[0,.48,0]),colored(new T.IcosahedronGeometry(1,0),'#91a184',[.60,.5,.50],[0,.48,0])]);
  const flowerParts=[];for(let i=0;i<5;i++){const a=i*Math.PI*2/5;flowerParts.push(colored(new T.IcosahedronGeometry(1,0),['#dfbabc','#eee4d4','#d9d1a7'][i%3],[.24,.14,.24],[Math.sin(a)*.35,.6,Math.cos(a)*.35]));}
  const flower=mergeGeometries(flowerParts);flowerParts.forEach(g=>g.dispose());geometries.push([flower,flower]);
  const ready=(async()=>{if(!pack.manifest.vegetation)return;index=await pack.loadJSON(pack.manifest.vegetation);if(disposed)return;Object.assign(stats,{trees:index.counts.tree,shrubs:index.counts.shrub,flowers:index.counts.flower});for(const spec of index.chunks)entries.push({spec,items:null,promise:null,meshes:[],lastSeen:0,level:-1});})();
  const distance=(b,x,z)=>Math.hypot(Math.max(b[0]-x,0,x-b[2]),Math.max(b[1]-z,0,z-b[3]));
  async function load(e){
    if(e.items)return;if(e.promise)return e.promise;
    e.promise=pack.loadJSON(e.spec.file).then(items=>{if(disposed)return;e.items=items;delete pack.buffers[e.spec.file];
    }).finally(()=>e.promise=null);return e.promise;
  }
  function clearMeshes(e){for(const mesh of e.meshes){mesh.removeFromParent();mesh.dispose();}e.meshes=[];}
  function render(e,level){
    if(e.level===level)return;clearMeshes(e);e.level=level;const groups=[[],[],[],[],[]],low=quality==='low';
    e.items.forEach((item,i)=>{if(level&&i%(low?5:3))return;if(low&&item.kind==='flower')return;groups[item.kind==='tree'?item.variant:item.kind==='shrub'?3:4].push(item);});
    for(const [kind,items] of groups.entries())if(items.length){const mesh=new T.InstancedMesh(geometries[kind][level],material,items.length),o=new T.Object3D();
      items.forEach((item,i)=>{o.position.fromArray(item.position);o.scale.setScalar(item.heightMeters/100);o.rotation.y=(i*2.399963);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});mesh.computeBoundingSphere();mesh.userData.kind=kind;group.add(mesh);e.meshes.push(mesh);}
  }
  return {group,ready,stats,entries,
    setQuality(value){quality=value;for(const e of entries)e.level=-1;},
    async prepare(x,z){await ready;await Promise.all(entries.filter(e=>distance(e.spec.bounds,x,z)<8).map(load));},
    update(camera,now,target){if(!index||disposed)return;
      stats.visibleTrees=stats.visibleInstances=stats.drawCalls=stats.triangles=0;
      const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let active=entries.filter(e=>e.promise).length;
      for(const e of entries){const b=e.spec.bounds,d=distance(b,camera.position.x,camera.position.z),near=distance(b,target.x,target.z)<10;
        const visible=d<(quality==='low'?75:130)&&frustum.intersectsBox(new T.Box3(new T.Vector3(b[0],0,b[1]),new T.Vector3(b[2],4,b[3])));
        if(visible||near)e.lastSeen=now;
        if((visible||near)&&!e.items&&!e.promise&&active<2){active++;load(e).catch(console.error);}
        if(e.items&&visible)render(e,d<(quality==='low'?8:15)?0:1);
        for(const mesh of e.meshes){mesh.visible=visible;if(visible){stats.drawCalls++;stats.visibleInstances+=mesh.count;stats.triangles+=mesh.count*(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;if(mesh.userData.kind<3)stats.visibleTrees+=mesh.count;}}
        if(e.items&&!e.promise&&now-e.lastSeen>30000){clearMeshes(e);e.items=null;e.level=-1;}
      }
    },
    dispose(){disposed=true;for(const e of entries)clearMeshes(e);for(const g of new Set(geometries.flat()))g.dispose();material.dispose();}
  };
}
