import { clamp, damp } from './ride-motion.js';

// Two-link IK in a common coordinate system. Clamp unreachable targets instead
// of stretching limbs or throwing during a render frame. Pole selects knee/elbow side.
export function solveLimb(start, target, upper, lower, pole, joint, end) {
  const direction = target.clone().sub(start);
  const length = direction.length();
  if (length < 1e-8) direction.set(0, -1, 0); else direction.multiplyScalar(1 / length);
  const reach = clamp(length, Math.abs(upper - lower) + 1e-5, upper + lower - 1e-5);
  end.copy(start).addScaledVector(direction, reach);
  const bend = pole.clone().sub(start);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) {
    bend.set(Math.abs(direction.x) < .8 ? 1 : 0, Math.abs(direction.x) < .8 ? 0 : 1, 0);
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  joint.copy(start).addScaledVector(direction, along)
    .addScaledVector(bend.normalize(), Math.sqrt(Math.max(0, upper * upper - along * along)));
  return end.distanceTo(target);
}

export class RideAnimation {
  constructor(T, rig) {
    this.rig = rig; this.phase = 0; this.wheelAngle = 0; this.tuck = 0; this.lean = 0;
    this.start = new T.Vector3(); this.target = new T.Vector3(); this.pole = new T.Vector3();
    this.joint = new T.Vector3(); this.end = new T.Vector3(); this.crank = new T.Vector3();
    this.contactError = 0;
  }
  update(dt, speed, steering, brake, travel = speed * dt) {
    const r = this.rig;
    // Signed distance is supplied AFTER collision rejection, including slope distance.
    this.wheelAngle += travel / .355;
    this.phase += travel / 1.02;
    for (const wheel of r.wheels) wheel.rotation.x = this.wheelAngle;
    r.fork.rotation.y = steering;
    const pace = clamp(Math.abs(speed) / 9, 0, 1);
    this.tuck = damp(this.tuck, pace * pace * .1 + (brake ? pace * .045 : 0), 6, dt);
    this.lean = damp(this.lean, clamp(-steering * speed * .018, -.045, .045), 6, dt);
    r.rider.rotation.set(this.tuck, 0, this.lean);
    r.body.updateMatrixWorld(true);
    this.contactError = 0;
    for (const arm of r.arms) {
      this.start.set(arm.side * .13, 1.48, .03);
      // Grip -> world -> rider: hands follow both steering and torso tuck.
      arm.grip.getWorldPosition(this.target); r.rider.worldToLocal(this.target);
      this.pole.set(arm.side * .4, 1.18, .16);
      this.contactError = Math.max(this.contactError,
        solveLimb(this.start, this.target, .31, .31, this.pole, this.joint, this.end));
      r.segment(arm.upper, this.start, this.joint, 2.1);
      r.segment(arm.lower, this.joint, this.end, 1.5);
      arm.hand.position.copy(this.end);
    }
    for (const leg of r.legs) {
      const phase = this.phase + (leg.side > 0 ? Math.PI : 0), x = leg.side * .16;
      this.crank.set(leg.side * .10, .37, -.05);
      this.target.set(x, .37 - Math.sin(phase) * .16, -.05 + Math.cos(phase) * .16);
      leg.pedal.position.copy(this.target);
      r.segment(leg.crank, this.crank, this.target, .8);
      this.target.y += .065;
      this.start.set(leg.side * .13, 1.01, -.22);
      this.pole.set(leg.side * .19, .76, .6);
      this.contactError = Math.max(this.contactError,
        solveLimb(this.start, this.target, .44, .43, this.pole, this.joint, this.end));
      r.segment(leg.upper, this.start, this.joint, 2.8);
      r.segment(leg.lower, this.joint, this.end, 2.2);
      leg.shoe.position.copy(this.end);
    }
  }
}

const bodyBones = ['torso', 'neck', 'head', ...['L', 'R'].flatMap(side =>
  ['arm', 'forearm', 'hand', 'thigh', 'shin', 'shoe'].map(part => `${part}_${side}`))];

// Optional licensed posed-rider adapter. Works on a fresh GLTFLoader scene (never
// Object3D.clone a skinned scene). No third-party model or loader ships by default.
export class PosedRideAnimation {
  constructor(T, scene) {
    this.T = T; this.scene = scene; this.phase = 0; this.wheelAngle = 0;
    this.tuck = 0; this.lean = 0; this.contactError = 0;
    const required = name => {
      const node = scene.getObjectByName(name);
      if (!node) throw new Error(`Rider rig missing ${name}`);
      return node;
    };
    this.body = required('RiderBody'); this.bike = required('FittedBicycle');
    this.fork = required('front-steering-assembly');
    this.wheels = ['rear-wheel', 'front-wheel'].map(required);
    this.pedals = ['pedal-L', 'pedal-R'].map(required);
    this.cranks = ['crank-L', 'crank-R'].map(required);
    this.bones = bodyBones.map(required);
    if (this.bones.some(node => !node.isBone)) throw new Error('Rider requires deform bones');
    this.skins = []; scene.traverse(node => { if (node.isSkinnedMesh) this.skins.push(node); });
    if (!this.skins.length) throw new Error('Rider requires a skinned mesh');
    scene.updateMatrixWorld(true);
    this.rest = new Map(this.bones.map(node => [node.name, this.pose(this.body, node)]));
    this.localRest = this.bones.map(node => ({ node, position: node.position.clone(), quaternion: node.quaternion.clone() }));
    this.forkRest = this.fork.quaternion.clone();
    this.wheelRest = this.wheels.map(node => node.quaternion.clone());
    const rear = this.point(this.bike, this.wheels[0]), front = this.point(this.bike, this.wheels[1]);
    this.modelScale = 1.16 / Math.abs(front.z - rear.z);
    if (!Number.isFinite(this.modelScale) || this.modelScale <= 0) throw new Error('Invalid rider wheelbase');
    this.pedalRest = this.pedals.map(node => this.pose(this.bike, node));
    this.center = this.pedalRest[0].position.clone().add(this.pedalRest[1].position).multiplyScalar(.5);
    this.center.x = 0;
    this.radius = Math.hypot(this.pedalRest[0].position.y - this.center.y, this.pedalRest[0].position.z - this.center.z);
    this.phase = Math.atan2(this.center.y - this.pedalRest[0].position.y, this.pedalRest[0].position.z - this.center.z);
    this.crankRest = this.cranks.map(node => {
      if (!node.geometry) throw new Error('Rider crank must be a mesh');
      node.geometry.computeBoundingBox();
      return { ...this.pose(this.bike, node), length: node.geometry.boundingBox.max.y - node.geometry.boundingBox.min.y };
    });
    this.grips = [-1, 1].map(side => required(`handlebar-grip:${side}`));
    this.gripRest = this.grips.map(node => this.pose(this.body, node));
    this.soleOffsets = ['L', 'R'].map((side, i) => this.rest.get(`shoe_${side}`).position.clone().sub(this.point(this.body, this.pedals[i])));
    this.joint = new T.Vector3(); this.end = new T.Vector3();
    this.axis = new T.Vector3(1, 0, 0); this.up = new T.Vector3(0, 1, 0);
    this.steerAxis = new T.Vector3(0, .97, -.22).normalize();
  }
  pose(space, node) {
    const matrix = space.matrixWorld.clone().invert().multiply(node.matrixWorld);
    const position = node.position.clone(), quaternion = node.quaternion.clone(), scale = node.scale.clone();
    matrix.decompose(position, quaternion, scale);
    return { position, quaternion, scale, matrix };
  }
  point(space, node) { return space.worldToLocal(node.getWorldPosition(new this.T.Vector3())); }
  setPose(space, node, position, quaternion, scale) {
    const matrix = node.matrix.clone().compose(position, quaternion, scale);
    node.parent.matrixWorld.clone().invert().multiply(space.matrixWorld).multiply(matrix)
      .decompose(node.position, node.quaternion, node.scale);
    node.updateMatrixWorld(true);
  }
  limb(names, target, orientation) {
    const [a, b, c] = names.map(name => this.rest.get(name));
    const first = this.scene.getObjectByName(names[0]);
    const start = this.point(this.body, first);
    this.contactError = Math.max(this.contactError,
      solveLimb(start, target, a.position.distanceTo(b.position), b.position.distanceTo(c.position), b.position, this.joint, this.end));
    const points = [start, this.joint, this.end], rest = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const q = i === 2 ? orientation : first.quaternion.clone().setFromUnitVectors(
        rest[i + 1].position.clone().sub(rest[i].position).normalize(), points[i + 1].clone().sub(points[i]).normalize()
      ).multiply(rest[i].quaternion);
      this.setPose(this.body, this.scene.getObjectByName(names[i]), points[i], q, rest[i].scale);
    }
  }
  update(dt, speed, steering, brake, travel = speed * dt) {
    this.phase += travel / 1.02; this.wheelAngle += travel / .355;
    for (const { node, position, quaternion } of this.localRest) { node.position.copy(position); node.quaternion.copy(quaternion); }
    this.fork.quaternion.copy(this.forkRest).multiply(this.forkRest.clone().setFromAxisAngle(this.steerAxis, steering));
    this.wheels.forEach((node, i) => node.quaternion.copy(this.wheelRest[i]).multiply(this.forkRest.clone().setFromAxisAngle(this.axis, this.wheelAngle)));
    this.scene.updateMatrixWorld(true);
    this.pedals.forEach((node, i) => {
      const phase = this.phase + i * Math.PI, rest = this.pedalRest[i];
      const point = this.center.clone(); point.x = rest.position.x;
      point.y -= Math.sin(phase) * this.radius; point.z += Math.cos(phase) * this.radius;
      this.setPose(this.bike, node, point, rest.quaternion, rest.scale);
      const anchor = this.center.clone(); anchor.x = (i ? 1 : -1) * Math.abs(rest.position.x) * .55;
      const delta = point.clone().sub(anchor), crank = this.crankRest[i];
      const scale = crank.scale.clone(); scale.y = delta.length() / Math.max(1e-6, crank.length);
      this.setPose(this.bike, this.cranks[i], anchor.add(point).multiplyScalar(.5),
        crank.quaternion.clone().setFromUnitVectors(this.up, delta.normalize()), scale);
    });
    const pace = clamp(Math.abs(speed) / 9, 0, 1), torso = this.rest.get('torso');
    this.tuck = damp(this.tuck, pace * pace * .1 + (brake ? pace * .045 : 0), 6, dt);
    this.lean = damp(this.lean, clamp(-steering * speed * .018, -.045, .045), 6, dt);
    const q = torso.quaternion.clone().setFromAxisAngle(this.axis, this.tuck)
      .multiply(torso.quaternion.clone().setFromAxisAngle(new this.T.Vector3(0, 0, 1), this.lean)).multiply(torso.quaternion);
    this.setPose(this.body, this.scene.getObjectByName('torso'), torso.position, q, torso.scale);
    this.contactError = 0;
    for (const [i, side] of ['L', 'R'].entries()) {
      const grip = this.pose(this.body, this.grips[i]);
      const delta = grip.matrix.multiply(this.gripRest[i].matrix.clone().invert());
      const hand = this.rest.get(`hand_${side}`);
      const rotation = hand.quaternion.clone().setFromRotationMatrix(delta).multiply(hand.quaternion);
      this.limb([`arm_${side}`, `forearm_${side}`, `hand_${side}`], hand.position.clone().applyMatrix4(delta), rotation);
      const shoe = this.rest.get(`shoe_${side}`);
      this.limb([`thigh_${side}`, `shin_${side}`, `shoe_${side}`], this.point(this.body, this.pedals[i]).add(this.soleOffsets[i]), shoe.quaternion);
    }
    for (const skin of this.skins) skin.skeleton.update();
  }
}
