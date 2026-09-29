import * as T from 'three';
import {clamp,damp} from './ride-motion.js';

// The Shenzhen two-link solver, with reusable scratch vectors for the moped rig.
const direction=new T.Vector3(),bend=new T.Vector3();
export function solveLimb(start,target,upper,lower,pole,joint,end){
  direction.subVectors(target,start);const length=direction.length();
  if(length<1e-8)direction.set(0,-1,0);else direction.multiplyScalar(1/length);
  const reach=clamp(length,Math.abs(upper-lower)+1e-5,upper+lower-1e-5);
  end.copy(start).addScaledVector(direction,reach);
  bend.subVectors(pole,start).addScaledVector(direction,-bend.dot(direction));
  if(bend.lengthSq()<1e-8){bend.set(1,0,0).addScaledVector(direction,-direction.x);}
  const along=(upper*upper-lower*lower+reach*reach)/(2*reach);
  joint.copy(start).addScaledVector(direction,along).addScaledVector(bend.normalize(),Math.sqrt(Math.max(0,upper*upper-along*along)));
  return end.distanceTo(target);
}
export class MopedAnimation{
  constructor(rig){this.rig=rig;this.wheelAngle=0;this.contactError=0;this.lean=0;this.lastSpeed=0;this.start=new T.Vector3();this.target=new T.Vector3();this.pole=new T.Vector3();this.joint=new T.Vector3();this.end=new T.Vector3();}
  update(dt,speed,steering,brake,travel,reduced=false){
    const r=this.rig;
    this.wheelAngle=(this.wheelAngle+travel/.23)%(Math.PI*2);
    for(const wheel of r.wheels)wheel.rotation.x=this.wheelAngle;
    r.steering.rotation.y=steering;
    const acceleration=dt>0?(speed-this.lastSpeed)/dt:0;this.lastSpeed=speed;
    this.lean=damp(this.lean,reduced?0:clamp(-acceleration*.007+(brake&&speed>.1?.018:0),-.025,.035),7,dt);
    // Torso pivots at the seat; pelvis and feet never translate with throttle.
    r.torso.rotation.x=.12+this.lean;
    for(const [i,group] of (r.hairGroups??[]).entries()){
      const sway=reduced?0:clamp(steering*speed*.04,-.09,.09);
      group.rotation.z=damp(group.rotation.z,sway*(i===0?1:-.5),8,dt);
      group.rotation.x=damp(group.rotation.x,reduced?0:clamp(speed*.004+acceleration*.004,0,.085),7,dt);
    }
    r.root.updateMatrixWorld(true);this.contactError=0;
    for(const arm of r.arms){
      this.start.set(arm.side*.175,.405,0);r.torso.localToWorld(this.start);r.root.worldToLocal(this.start);
      arm.grip.getWorldPosition(this.target);r.root.worldToLocal(this.target);
      this.pole.set(arm.side*.36,1.03,.02);
      this.contactError=Math.max(this.contactError,solveLimb(this.start,this.target,.31,.32,this.pole,this.joint,this.end));
      r.segment(arm.upper,this.start,this.joint,.069);r.segment(arm.lower,this.joint,this.end,.052);
      arm.elbow.position.copy(this.joint);arm.shoulder.position.copy(this.start);
      arm.hand.position.copy(this.end);arm.hand.rotation.y=steering;
    }
  }
}
