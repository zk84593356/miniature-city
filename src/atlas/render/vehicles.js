import * as THREE from 'three';
export function createVehicles(traffic) {
  const group=new THREE.Group(),capacity=400;
  const bodyMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.65});
  const glassMat=new THREE.MeshStandardMaterial({color:'#485a5b',roughness:.35});
  const frontMat=new THREE.MeshBasicMaterial({color:'#fff1cf'}),backMat=new THREE.MeshBasicMaterial({color:'#bf4231'});
  const make=(geo,mat)=>{const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;group.add(mesh);return mesh;};
  const body=make(new THREE.BoxGeometry(1,1,1),bodyMat),glass=make(new THREE.BoxGeometry(1,1,1),glassMat),front=make(new THREE.BoxGeometry(1,1,1),frontMat),back=make(new THREE.BoxGeometry(1,1,1),backMat);
  const positions=new Float32Array(1200*3),colors=new Float32Array(1200*3),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setDrawRange(0,0);
  const pointMat=new THREE.PointsMaterial({size:1.65,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.8,depthWrite:false});const points=new THREE.Points(geo,pointMat);points.frustumCulled=false;group.add(points);
  const dummy=new THREE.Object3D(),vp=new THREE.Vector3(),frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  const palette=['#d8d6c9','#9eaaa8','#626f71','#a09079','#eeeeDF','#7d8c89','#b1a295'].map(c=>new THREE.Color(c));let visible=0,near=0,far=0,night=false;
  const nightColors=[new THREE.Color('#a55240'),new THREE.Color('#ead9ae')];
  function part(mesh,index,p,w,h,l,dy,dz=0){dummy.position.set(p.x+Math.sin(p.heading)*dz,p.y+dy,p.z+Math.cos(p.heading)*dz);dummy.rotation.set(0,p.heading,0);dummy.scale.set(w,h,l);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);}
  return {group,setNight(value){night=value;front.visible=back.visible=value;pointMat.opacity=value?.95:.7;},
    update(camera,tier){near=far=0;frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      for(const v of traffic.vehicles){if(!v.active)continue;const p=traffic.sample(v);if(p.hidden||v.age<.5)continue;vp.set(p.x,p.y,p.z);const d=vp.distanceTo(camera.position);if(d>360||!frustum.containsPoint(vp))continue;
        if(d<38&&near<tier.near){const w=v.type===2?.025:v.type===3?.024:.019,h=v.type===2?.03:v.type===1?.018:.014;part(body,near,p,w,h,v.length,h/2+.003);body.setColorAt(near,palette[v.id%palette.length]);part(glass,near,p,w*.87,h*.6,v.length*.48,h+.004);part(front,near,p,w*.8,.004,.003,.012,v.length/2);part(back,near,p,w*.8,.004,.003,.012,-v.length/2);near++;}
        else if(d<220){positions[far*3]=p.x;positions[far*3+1]=p.y+.015;positions[far*3+2]=p.z;const c=night?nightColors[v.id%2]:palette[v.id%palette.length];c.toArray(colors,far*3);far++;}
      }
      for(const mesh of [body,glass,front,back]){mesh.count=near;mesh.instanceMatrix.needsUpdate=true;}if(body.instanceColor)body.instanceColor.needsUpdate=true;geo.setDrawRange(0,far);geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;visible=near+far;
    },get stats(){return {visibleVehicles:visible,nearVehicles:near,farVehicles:far,maxDrawCalls:5};},dispose(){group.traverse(o=>{o.geometry?.dispose();});for(const mat of [bodyMat,glassMat,frontMat,backMat,pointMat])mat.dispose();}};
}
