import * as THREE from 'three';
export function createVesselModels(simulation) {
  const group=new THREE.Group(),capacity=18,dummy=new THREE.Object3D(),p=new THREE.Vector3();
  const hullMat=new THREE.MeshStandardMaterial({color:'#657c7e',roughness:.65}),cabinMat=new THREE.MeshStandardMaterial({color:'#d6d5c6',roughness:.7}),cargoMat=new THREE.MeshStandardMaterial({color:'#9c866e',roughness:.85}),lampMat=new THREE.MeshBasicMaterial({color:'#ffe8b3'});
  for(const material of [hullMat,cabinMat,cargoMat,lampMat]){
    material.onBeforeCompile=shader=>{shader.vertexShader='attribute float vesselFade;varying float atlasVesselFade;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\natlasVesselFade=vesselFade;');shader.fragmentShader='varying float atlasVesselFade;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>atlasVesselFade)discard;');};
    material.customProgramCacheKey=()=> 'atlas-vessel-fade-v1';
  }
  // Tapered bow/stern hull, shared across all vessels. Waterline at local y=0.
  const hullGeo=new THREE.CylinderGeometry(.5,.38,1,6);hullGeo.rotateY(Math.PI/6);
  function mesh(geo,mat){geo.setAttribute('vesselFade',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage));const o=new THREE.InstancedMesh(geo,mat,capacity);o.frustumCulled=false;o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);o.count=0;group.add(o);return o;}
  const hull=mesh(hullGeo,hullMat),cabin=mesh(new THREE.BoxGeometry(1,1,1),cabinMat),cargo=mesh(new THREE.BoxGeometry(1,1,1),cargoMat),lamps=mesh(new THREE.BoxGeometry(1,1,1),lampMat);
  const wakePositions=new Float32Array(capacity*8*6*3),wakeGeometry=new THREE.BufferGeometry();wakeGeometry.setAttribute('position',new THREE.BufferAttribute(wakePositions,3).setUsage(THREE.DynamicDrawUsage));wakeGeometry.setDrawRange(0,0);
  const wakeMat=new THREE.MeshBasicMaterial({color:'#c3d6cd',transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide});const wake=new THREE.Mesh(wakeGeometry,wakeMat);wake.frustumCulled=false;group.add(wake);
  const scratch={x:0,y:0,z:0,heading:0};let visible=0,wakes=0;
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4(),bounds=new THREE.Sphere(p,.3);
  function part(o,i,pos,w,h,l,dy,dz=0){dummy.position.set(pos.x+Math.sin(pos.heading)*dz,pos.y+dy,pos.z+Math.cos(pos.heading)*dz);dummy.rotation.set(0,pos.heading,0);dummy.scale.set(w,h,l);dummy.updateMatrix();o.setMatrixAt(i,dummy.matrix);}
  return {group,setNight(n){lamps.visible=n;cabinMat.emissive.set('#ddbb79');cabinMat.emissiveIntensity=n?.14:0;},
    update(camera,tier,reduced){visible=wakes=0;let cargoCount=0,wakeOffset=0;frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      for(const ship of simulation.ships){if(!ship.active)continue;const pos=simulation.interpolate(ship),d=p.set(pos.x,pos.y,pos.z).distanceTo(camera.position);if(d>350||!frustum.intersectsSphere(bounds))continue;
        const end=Math.min(ship.s,ship.route.curve.length-ship.s),fade=Math.min(1,end/.35);if(fade<.05)continue;
        const w=ship.width/100,l=ship.length/100,h=ship.height/100;
        part(hull,visible,pos,w,h*.43,l,h*.1);part(cabin,visible,pos,w*.72,h*.62,l*(ship.type==='cargo'?.18:.55),h*.45,ship.type==='cargo'?-l*.3:0);
        for(const o of [hull,cabin,lamps])o.geometry.attributes.vesselFade.array[visible]=fade;
        if(ship.type==='cargo'){cargo.geometry.attributes.vesselFade.array[cargoCount]=fade;part(cargo,cargoCount++,pos,w*.74,h*.44,l*.5,h*.35,l*.06);}
        part(lamps,visible,pos,w*.6,.008,.013,h*.76,l*.13);visible++;
        if(tier.wake&&!reduced&&d<45){wakes++;
          for(let j=0;j<8;j++){
            const s=ship.s-ship.direction*(l*.5+j*.02),s2=s-ship.direction*.02;
            if(Math.min(s,s2)<0||Math.max(s,s2)>ship.route.curve.length)continue;
            simulation.sample(ship,s,scratch);const ax=scratch.x,ay=scratch.y+.001,az=scratch.z,anx=Math.cos(scratch.heading),anz=-Math.sin(scratch.heading);
            simulation.sample(ship,s2,scratch);const bx=scratch.x,by=scratch.y+.001,bz=scratch.z,bnx=Math.cos(scratch.heading),bnz=-Math.sin(scratch.heading),wa=w*(.28+j*.06),wb=w*(.34+j*.06);
            const v=[ax-anx*wa,ay,az-anz*wa,ax+anx*wa,ay,az+anz*wa,bx-bnx*wb,by,bz-bnz*wb,ax+anx*wa,ay,az+anz*wa,bx+bnx*wb,by,bz+bnz*wb,bx-bnx*wb,by,bz-bnz*wb];wakePositions.set(v,wakeOffset);wakeOffset+=18;
          }
        }
      }
      for(const o of [hull,cabin,lamps]){o.count=visible;o.instanceMatrix.needsUpdate=true;}cargo.count=cargoCount;cargo.instanceMatrix.needsUpdate=true;for(const o of [hull,cabin,lamps,cargo])o.geometry.attributes.vesselFade.needsUpdate=true;wakeGeometry.setDrawRange(0,wakeOffset/3);wakeGeometry.attributes.position.needsUpdate=true;
    },get stats(){return {visibleVessels:visible,wakes,maxWakeSegments:144,maxDrawCalls:5};},dispose(){group.traverse(o=>o.geometry?.dispose());for(const m of [hullMat,cabinMat,cargoMat,lampMat,wakeMat])m.dispose();}};
}
