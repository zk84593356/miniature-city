import * as THREE from 'three';
// Twelve untextured silhouettes at most; no flock AI, particles or extra timer.
export function createAtmosphere(){
  const array=new Float32Array(12*18),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(array,3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
  const material=new THREE.MeshBasicMaterial({color:'#697577',side:THREE.DoubleSide}),group=new THREE.Mesh(geometry,material);group.frustumCulled=false;let visible=0;
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
  return {group,update(time,camera,tier,reduced,night){let offset=0;visible=0;frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(let i=0;i<(reduced?0:tier.birds);i++){const lake=i%2===0,cx=lake?49:-29,cz=lake?-9:-4,a=time*.08+i*2.399,x=cx+Math.cos(a)*3,z=cz+Math.sin(a)*1.5,y=(lake?1.8:1.2)+Math.sin(a*.7)*.1;if(Math.hypot(camera.position.x-x,camera.position.y-y,camera.position.z-z)>65||!frustum.containsPoint(point.set(x,y,z)))continue;
      const flap=Math.sin(time*7+i)*.008,ux=Math.cos(a),uz=-Math.sin(a);
      const data=[x,y,z,x+ux*.018,y+flap,z+uz*.018,x+.004,y,z+.008,x,y,z,x-ux*.018,y+flap,z-uz*.018,x+.004,y,z+.008];array.set(data,offset);offset+=18;visible++;
    }
    material.color.set(night?'#9ba8ad':'#697577');geometry.setDrawRange(0,offset/3);geometry.attributes.position.needsUpdate=true;
  },get stats(){return {visibleBirds:visible,maxBirds:12};},dispose(){geometry.dispose();material.dispose();}};
}
