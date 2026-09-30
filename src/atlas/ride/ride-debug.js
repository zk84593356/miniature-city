import * as T from 'three';
import {BODY} from './ride-collision.js';

// Local QA overlay only. It uses the actual collision polygons and CPU arrays.
export function createRideDebug(scene,adapter,pack){
  const group=new T.Group();scene.add(group);let enabled=false,last=0;
  const clear=()=>{for(const child of [...group.children]){child.geometry.dispose();child.material.dispose();child.removeFromParent();}};
  function lines(points,color,closed=false){
    if(points.length<2)return;
    const g=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(...p)));
    const material=new T.LineBasicMaterial({color,transparent:true,opacity:.8,depthTest:false});
    group.add(new (closed?T.LineLoop:T.Line)(g,material));
  }
  function update(s,now=performance.now()){
    if(!enabled||!s||now-last<250)return;last=now;clear();
    const local=(a,b,y)=>[s.x+Math.sin(s.heading)*a+Math.cos(s.heading)*b,y,s.z+Math.cos(s.heading)*a-Math.sin(s.heading)*b];
    lines([[-1,-1],[-1,1],[1,1],[1,-1]].map(([a,b])=>local(a*BODY.half,b*BODY.radius,s.y+.003)),0xffffff,true);
    for(const o of adapter.collisionProbe(s)){
      const color=o.kind==='building'?0xff9955:o.kind==='traffic'?0xff5555:0xbb66ff;
      if(o.rings)for(const ring of o.rings)for(const y of [o.bottom,o.top])lines(ring.map(p=>[p[0],y,p[1]]),color,true);
      else if(o.center&&o.size){const mesh=new T.Mesh(new T.BoxGeometry(...o.size),new T.MeshBasicMaterial({color,transparent:true,opacity:.25,depthWrite:false}));mesh.position.fromArray(o.center);mesh.rotation.y=o.rotationY??0;group.add(mesh);}
    }
    for(const f of adapter.surface.getRoadTriangles().features.values()){
      const b=f.bounds;if(b&&(s.x<b[0]-.3||s.x>b[2]+.3||s.z<b[1]-.3||s.z>b[3]+.3))continue;
      for(let i=f.triangleStart*3;i<(f.triangleStart+f.triangleCount)*3;i+=3){const p=[0,1,2].map(j=>Array.from(f.positions.subarray(f.indices[i+j]*3,f.indices[i+j]*3+3)));if(p.some(q=>Math.hypot(q[0]-s.x,q[2]-s.z)<.3))lines(p,0x22bbbb,true);}
    }
    for(const water of pack.waters??[])for(const ring of water.rings)for(let i=1;i<ring.length;i++)if(Math.hypot(ring[i][0]-s.x,ring[i][1]-s.z)<.35)lines([ring[i-1],ring[i]].map(q=>[q[0],s.y+.004,q[1]]),0x2299ff);
    const p=adapter.lastRejected?.blockPosition;if(p){const mesh=new T.Mesh(new T.SphereGeometry(.006,8,6),new T.MeshBasicMaterial({color:0xff0000,depthTest:false}));mesh.position.set(p.x,p.y,p.z);group.add(mesh);}
  }
  return {set(value){enabled=!!value;group.visible=enabled;last=0;if(!enabled)clear();return enabled;},update,dispose(){clear();group.removeFromParent();}};
}
