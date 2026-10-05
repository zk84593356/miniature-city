import { SCALE, RIDE_MOTION, clamp, damp } from './ride-motion.js';
export const RIDE_CAMERA = Object.freeze({ distance: 6.4, height: 3.1, lead: 4.8, fov: 57, followRate: 5, swingRate: 3.4, pitchDefault: -10*Math.PI/180, pitchMin: -25*Math.PI/180, pitchMax: 70*Math.PI/180, anchorHeight: 2 });

export class RideCamera {
  constructor(T, camera, controller, collision) {
    Object.assign(this, { camera, controller, collision });
    this.target = new T.Vector3(); this.desired = new T.Vector3(); this.anchor = new T.Vector3();
    this.safe = new T.Vector3(); this.candidate = new T.Vector3();
    this.direction = new T.Vector3();
    this.pitch = this.renderPitch = RIDE_CAMERA.pitchDefault;
    this.offset = 0; this.heading = 0; this.dragging = false;
    this.swing = 0; this.pace = 0; this.height = 0;
  }
  save() {
    const c = this.camera, controls = this.controller.controls;
    this.saved = { position: c.position.clone(), quaternion: c.quaternion.clone(), target: controls.target.clone(), near: c.near, far: c.far, zoom: c.zoom, fov: c.fov, view: c.view ? { ...c.view } : null, enabled: controls.enabled };
    this.controller.cancel();
    // Drain pending orbit inertia while the saved view is intact. Otherwise a
    // drag immediately before entering would resume unexpectedly after Escape.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    controls.enabled = false;
    c.near = .0005; c.fov = RIDE_CAMERA.fov; c.zoom=1; c.clearViewOffset(); c.updateProjectionMatrix();
    this.offset = 0; this.swing = 0; this.pace = 0; this.dragging = false; this.initialized = false;
    this.pitch = this.renderPitch = RIDE_CAMERA.pitchDefault;
  }
  drag(dx, dy = 0) { this.offset = clamp(this.offset - dx * .006, -1.15, 1.15); this.pitch = clamp(this.pitch - dy * .005, RIDE_CAMERA.pitchMin, RIDE_CAMERA.pitchMax); }
  reset() { this.offset = 0; this.pitch = RIDE_CAMERA.pitchDefault; }
  update(state, dt, snap = false, supportY = state.y) {
    snap ||= !this.initialized; this.initialized = true;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .08);
    const reduced = this.controller.reduced;
    if (!this.dragging) this.offset = damp(this.offset, 0, 1.8, dt);
    const difference = Math.atan2(Math.sin(state.heading - this.heading), Math.cos(state.heading - this.heading));
    this.heading = snap ? state.heading : this.heading + difference * (1 - Math.exp(-RIDE_CAMERA.followRate * dt));
    this.swing = snap || reduced ? 0 : damp(this.swing, clamp(state.steering * state.speed * .075, -.14, .14), RIDE_CAMERA.swingRate, dt);
    this.pace = reduced?0:damp(this.pace, clamp(Math.abs(state.speed) / RIDE_MOTION.maxSpeed, 0, 1), 2, dt);
    this.height = snap ? supportY : damp(this.height, supportY, 10, dt);
    this.renderPitch = snap ? this.pitch : damp(this.renderPitch, this.pitch, 10, dt);
    const y = Math.max(state.y, supportY, this.height), portrait = this.camera.aspect < .85;
    const angle = this.heading + this.offset + this.swing + (reduced ? 0 : .10);
    let distance = (this.inspection?3.2:RIDE_CAMERA.distance + this.pace * 1.1 + (portrait ? .8 : 0)) * SCALE;
    this.anchor.set(state.x, y + (this.inspection?1.05:RIDE_CAMERA.anchorHeight) * SCALE, state.z);
    this.direction.set(Math.sin(angle)*Math.cos(this.renderPitch), Math.sin(this.renderPitch), Math.cos(angle)*Math.cos(this.renderPitch));
    // A low-angle orbit shortens its boom near the floor instead of lifting the
    // rider's pivot toward the roof or pushing the camera underground.
    const boomPitch=this.renderPitch>0?this.renderPitch*.72:this.renderPitch;
    if(boomPitch>0)distance=Math.min(distance,(this.anchor.y-y-.005)/Math.sin(boomPitch));
    this.desired.set(state.x-Math.sin(angle)*Math.cos(boomPitch)*distance,this.anchor.y-Math.sin(boomPitch)*distance,state.z-Math.cos(angle)*Math.cos(boomPitch)*distance);
    // Ease into an over-shoulder view as the boom approaches the scooter. This
    // keeps the lens out of the rear shell and the rider beside the sightline.
    const shoulder=.35*SCALE*clamp((this.renderPitch-.15)/.65,0,1);
    this.desired.x+=Math.cos(angle)*shoulder;this.desired.z-=Math.sin(angle)*shoulder;
    const lead = (this.inspection?0:RIDE_CAMERA.lead + this.pace * 3.2) * SCALE;
    // Follow the road's pitch without snapping to an overhead bridge layer.
    const road = this.collision.height(state.x+Math.sin(this.heading)*lead, state.z+Math.cos(this.heading)*lead, state.y,state.surfaceId);
    // Occlusion starts at the rider, NEVER at the distant road look-ahead target.
    this.obstruction = null;
    this.constrain(this.desired, state);
    const c = this.camera;
    this.candidate.copy(c.position).lerp(this.desired, snap||reduced ? 1 : 1 - Math.exp(-RIDE_CAMERA.followRate * dt));
    // Validate AFTER damping as well: a moving/rotating boom may cut a corner.
    this.constrain(this.candidate, state); c.position.copy(this.candidate);
    this.distance = c.position.distanceTo(this.anchor)/SCALE;
    this.target.copy(c.position).addScaledVector(this.direction,distance+lead);
    if (Number.isFinite(road)) this.target.y += clamp(road - state.y, -.015, .015)*Math.max(0,1-Math.abs(this.renderPitch-RIDE_CAMERA.pitchDefault)/.35);
    this.controller.controls.target.lerp(this.target, snap ? 1 : 1 - Math.exp(-7 * dt));
    const fov = RIDE_CAMERA.fov + this.pace * 3 + (portrait ? 6 : 0);
    if (Math.abs(c.fov - fov) > .001) { c.fov = fov; c.updateProjectionMatrix(); }
    c.lookAt(this.controller.controls.target);
  }
  constrain(point, state) {
    const started=performance.now();
    const floor = this.collision.height(point.x, point.z, state.y,state.surfaceId);
    if (Number.isFinite(floor)) point.y = Math.max(point.y, floor + .005);
    const steps = Math.max(1, Math.ceil(this.anchor.distanceTo(point) / .0025));
    this.safe.copy(this.anchor);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = this.anchor.x + (point.x - this.anchor.x) * t;
      const y = this.anchor.y + (point.y - this.anchor.y) * t;
      const z = this.anchor.z + (point.z - this.anchor.z) * t;
      const kind=this.collision.cameraBlocked(x,y,z,state);
      if (kind) {
        this.obstruction = {kind,x,y,z,anchorY:this.anchor.y};
        point.copy(this.safe); break;
      }
      this.safe.set(x, y, z);
    }
    this.collision.metrics.cameraCollisionMs+=performance.now()-started;
  }
  restore() {
    const s = this.saved, c = this.camera;
    c.position.copy(s.position); c.quaternion.copy(s.quaternion);
    c.near = s.near; c.far = s.far; c.zoom = s.zoom; c.fov = s.fov; c.view = s.view; c.updateProjectionMatrix();
    this.controller.controls.target.copy(s.target);
    this.controller.controls.enabled = s.enabled;
    this.dragging = false;
  }
}
