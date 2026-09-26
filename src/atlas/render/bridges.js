import * as THREE from 'three';

// Shared station sampler: visual deck, cable anchors and surface registry all
// consume the published XYZ profile, never a separate visual height offset.
export function stationPoint(bridge, distance) {
  const s=bridge.stationsMeters,p=bridge.profile;
  let i=1;while(i<s.length-1&&s[i]<distance)i++;
  const t=THREE.MathUtils.clamp((distance-s[i-1])/(s[i]-s[i-1]),0,1);
  return new THREE.Vector3().fromArray(p[i-1]).lerp(new THREE.Vector3().fromArray(p[i]),t);
}

function batch() {
  const positions=[],normals=[],indices=[];
  return {
    add(geometry,matrix) {
      geometry.applyMatrix4(matrix);
      const start=positions.length/3;
      positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
      const index=geometry.index?.array??Array.from({length:geometry.attributes.position.count},(_,i)=>i);
      for(const i of index)indices.push(start+i);
      geometry.dispose();
    },
    mesh(color) {
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);g.computeBoundingSphere();
      return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.12}));
    },
  };
}

export function createBridge(bridge, surface) {
  const structure=batch(),deck=batch(),piers=batch(),cables=batch();
  const group=new THREE.Group();group.name=bridge.id;
  const obstacles=[];
  function beam(target,a,b,width,depth=width) {
    const delta=b.clone().sub(a),matrix=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),new THREE.Vector3(width,delta.length(),depth));
    target.add(new THREE.BoxGeometry(1,1,1),matrix);
  }
  const length=bridge.stationsMeters.at(-1),[start,end]=bridge.waterRange,w=bridge.widthMeters/100;
  const at=s=>stationPoint(bridge,s);
  const tangent=at(end).sub(at(start)).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
  function side(s,offset,dy=0){return at(s).addScaledVector(normal,offset).add(new THREE.Vector3(0,dy,0));}
  function strip(offset=0,target=deck,profile=bridge.profile) {
    for(let i=1;i<profile.length;i++) {
      const a=new THREE.Vector3().fromArray(profile[i-1]),b=new THREE.Vector3().fromArray(profile[i]);
      a.y+=offset-.012;b.y+=offset-.012;
      // Box cross-section orientation follows the line, while its top shares deck XYZ.
      const d=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(.5);
      const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),d.clone().normalize());
      target.add(new THREE.BoxGeometry(w,.024,d.length()+.002),new THREE.Matrix4().compose(mid,rotation,new THREE.Vector3(1,1,1)));
    }
  }
  strip();
  surface.register({id:'bridge-'+bridge.id,kind:'bridge',layerId:bridge.layerId,profile:bridge.profile,width:bridge.widthMeters,traversable:true,rideAllowed:true,source:bridge.source});
  if(bridge.lowerDeckOffsetMeters) {
    const offset=-bridge.lowerDeckOffsetMeters/100;strip(0,deck,bridge.lowerProfile);
    surface.register({id:bridge.lowerLayerId,kind:'bridge',layerId:bridge.lowerLayerId,profile:bridge.lowerProfile,width:bridge.widthMeters,traversable:bridge.lowerDeckKind==='road',rideAllowed:bridge.lowerDeckKind==='road',source:bridge.source});
    if(bridge.lowerDeckKind==='rail') for(const dx of [-.045,-.03,.03,.045])for(let i=1;i<bridge.profile.length;i++) {
      const a=new THREE.Vector3().fromArray(bridge.profile[i-1]).addScaledVector(normal,dx);const b=new THREE.Vector3().fromArray(bridge.profile[i]).addScaledVector(normal,dx);a.y=bridge.lowerProfile[i-1][1];b.y=bridge.lowerProfile[i][1];beam(structure,a,b,.005);
    }
  }
  function pier(s,width=.12,dy=0) {
    const p=at(s),water=surface.sample(p.x,p.z),bottom=(water?.height??p.y-.4)-(water?.kind==='water'?.1:0);
    const a=p.clone();a.y=bottom;const b=p.clone();b.y+=dy;
    beam(piers,a,b,width,w*.8);
    obstacles.push({id:`${bridge.id}-pier-${s}`,kind:'pier',center:[p.x,(a.y+b.y)/2,p.z],size:[width,b.y-a.y,w*.8],rotationY:Math.atan2(tangent.x,tangent.z),source:'estimated structural layout',estimated:true});
  }
  if(bridge.structure==='steel-truss') {
    const count=bridge.spans*6,depth=bridge.lowerDeckOffsetMeters/100;
    for(let i=0;i<=bridge.spans;i++)pier(start+(end-start)*i/bridge.spans,.12,-depth);
    for(const offset of [-w*.48,w*.48])for(let i=0;i<count;i++) {
      const a=start+(end-start)*i/count,b=start+(end-start)*(i+1)/count;
      beam(structure,side(a,offset),side(b,offset),.012);
      beam(structure,side(a,offset,-depth),side(b,offset,-depth),.012);
      beam(structure,side(a,offset,-depth),side(b,offset),.009);
      beam(structure,side(a,offset),side(a,offset,-depth),.009);
    }
    for(const s of [start,end])for(const offset of [-w*.65,w*.65]) {
      const p=side(s,offset,.055);structure.add(new THREE.BoxGeometry(.12,.24,.15),new THREE.Matrix4().makeTranslation(p));
      structure.add(new THREE.ConeGeometry(.105,.05,4),new THREE.Matrix4().compose(p.clone().add(new THREE.Vector3(0,.145,0)),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4),new THREE.Vector3(1,1,1)));
    }
  } else if(bridge.structure==='arch') {
    const rise=bridge.archRiseMeters/100;
    for(const offset of [-w*.45,w*.45])for(let i=0;i<36;i++) {
      const t=i/36,u=(i+1)/36,a=start+(end-start)*t,b=start+(end-start)*u;
      beam(structure,side(a,offset,4*rise*t*(1-t)),side(b,offset,4*rise*u*(1-u)),.025);
      if(i%2===0)beam(cables,side(a,offset),side(a,offset,4*rise*t*(1-t)),.006);
    }
    pier(start);pier(end);
  } else {
    const n=bridge.towerCount;
    const span=Math.min(bridge.mainSpanMeters,(length-120)/(n-1));
    const middle=THREE.MathUtils.clamp((start+end)/2,60+span*(n-1)/2,length-60-span*(n-1)/2);
    const towers=Array.from({length:n},(_,i)=>middle+(i-(n-1)/2)*span);
    const height=bridge.towerHeightAboveDeckMeters/100;
    for(const s of towers) {
      pier(s,.17);
      for(const offset of [-w*.58,w*.58]) {
        const base=side(s,offset),top=side(s,offset*.8,height);
        beam(structure,base,top,.045,.055);
        obstacles.push({id:`${bridge.id}-tower-${s}-${offset}`,kind:'tower',center:base.clone().add(top).multiplyScalar(.5).toArray(),size:[.055,height,.055],estimated:true});
      }
      for(const h of [.2,.82])beam(structure,side(s,-w*.58,height*h),side(s,w*.58,height*h),.045);
    }
    if(bridge.structure==='suspension') {
      const anchors=[Math.max(0,towers[0]-span*.35),...towers,Math.min(length,towers.at(-1)+span*.35)].filter((s,i,all)=>!i||s-all[i-1]>1);
      for(let section=1;section<anchors.length;section++) {
        const a=anchors[section-1],b=anchors[section];
        const ha=section===1?.06:height,hb=section===anchors.length-1?.06:height;
        for(const offset of [-w*.53,w*.53])for(let i=0;i<40;i++) {
          const t=i/40,u=(i+1)/40;
          const sag=section===1||section===anchors.length-1?.10:height*.75;
          const h=v=>ha*(1-v)+hb*v-4*sag*v*(1-v);
          const sa=a+(b-a)*t,sb=a+(b-a)*u;
          beam(cables,side(sa,offset,h(t)),side(sb,offset,h(u)),.009);
          if(i%2===0&&h(t)>.01)beam(cables,side(sa,offset),side(sa,offset,h(t)),.0035);
        }
      }
    } else for(let index=0;index<n;index++) {
      const s=towers[index],left=index?(towers[index-1]+s)/2:start,right=index<n-1?(s+towers[index+1])/2:end;
      for(const offset of [-w*.48,w*.48])for(const direction of [-1,1])for(let i=1;i<=14;i++) {
        const station=s+(direction<0?left-s:right-s)*i/14;
        beam(cables,side(s,offset*.65,height*(.62+.38*i/14)),side(station,offset),.004);
      }
    }
  }
  // Approach supports stop at stable terrain; no giant circular bridge obstacle.
  for(let s=80;s<length;s+=150)if(s<start||s>end)pier(s,.065);
  for(const [builder,color] of [[deck,'#a5a69b'],[piers,'#c1baaa'],[structure,bridge.color],[cables,bridge.color]])group.add(builder.mesh(color));
  group.userData={name:bridge.name,bridgeId:bridge.id,obstacles,profile:bridge.profile,waterProfile:bridge.profile.filter((p,i)=>bridge.stationsMeters[i]>=start-.001&&bridge.stationsMeters[i]<=end+.001),towerCount:bridge.towerCount};
  return group;
}
