import { SCALE, clamp, damp } from './ride-motion.js';
export const RIDE_CAMERA = Object.freeze({ distance: 6.4, height: 3.1, lead: 4.8, fov: 57, followRate: 5, swingRate: 3.4 });

export class RideCamera {
  constructor(T, camera, controller, collision) {
    Object.assign(this, { camera, controller, collision });
    this.target = new T.Vector3(); this.desired = new T.Vector3(); this.anchor = new T.Vector3();
    this.safe = new T.Vector3(); this.candidate = new T.Vector3();
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
    c.near = .002; c.fov = RIDE_CAMERA.fov; c.clearViewOffset(); c.updateProjectionMatrix();
    this.offset = 0; this.swing = 0; this.pace = 0; this.dragging = false; this.initialized = false;
  }
  drag(dx) { this.offset = clamp(this.offset - dx * .006, -1.15, 1.15); }
  update(state, dt, snap = false, supportY = state.y) {
    snap ||= !this.initialized; this.initialized = true;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .08);
    const reduced = this.controller.reduced;
    if (!this.dragging) this.offset = damp(this.offset, 0, 1.8, dt);
    const difference = Math.atan2(Math.sin(state.heading - this.heading), Math.cos(state.heading - this.heading));
    this.heading = snap ? state.heading : this.heading + difference * (1 - Math.exp(-RIDE_CAMERA.followRate * dt));
    this.swing = snap || reduced ? 0 : damp(this.swing, clamp(state.steering * state.speed * .075, -.14, .14), RIDE_CAMERA.swingRate, dt);
    this.pace = damp(this.pace, reduced ? 0 : clamp(Math.abs(state.speed) / 9, 0, 1), 2, dt);
    this.height = snap ? supportY : damp(this.height, supportY, 10, dt);
    const y = Math.max(state.y, supportY, this.height), portrait = this.camera.aspect < .85;
    const angle = this.heading + this.offset + this.swing + (reduced ? 0 : .10);
    const distance = (RIDE_CAMERA.distance + this.pace * 1.1 + (portrait ? .8 : 0)) * SCALE;
    this.desired.set(state.x - Math.sin(angle) * distance, y + (RIDE_CAMERA.height + (portrait ? .5 : 0)) * SCALE, state.z - Math.cos(angle) * distance);
    const lead = (RIDE_CAMERA.lead + this.pace * .6) * SCALE;
    this.target.set(state.x + Math.sin(this.heading) * lead, y + 1.05 * SCALE, state.z + Math.cos(this.heading) * lead);
    // Follow the road's pitch without snapping to an overhead bridge layer.
    const road = this.collision.height(this.target.x, this.target.z, state.y);
    if (Number.isFinite(road)) this.target.y += clamp(road - state.y, -.07, .07);
    // Occlusion starts at the rider, NEVER at the distant road look-ahead target.
    this.anchor.set(state.x, y + 1.05 * SCALE, state.z);
    this.obstruction = null;
    this.constrain(this.desired, state);
    const c = this.camera;
    this.candidate.copy(c.position).lerp(this.desired, snap ? 1 : 1 - Math.exp(-RIDE_CAMERA.followRate * dt));
    // Validate AFTER damping as well: a moving/rotating boom may cut a corner.
    this.constrain(this.candidate, state); c.position.copy(this.candidate);
    this.controller.controls.target.lerp(this.target, snap ? 1 : 1 - Math.exp(-7 * dt));
    const fov = RIDE_CAMERA.fov + this.pace * 3 + (portrait ? 6 : 0);
    if (Math.abs(c.fov - fov) > .001) { c.fov = fov; c.updateProjectionMatrix(); }
    c.lookAt(this.controller.controls.target);
  }
  constrain(point, state) {
    const floor = this.collision.height(point.x, point.z, Math.max(state.y, point.y));
    if (Number.isFinite(floor)) point.y = Math.max(point.y, floor + .035);
    const steps = Math.max(1, Math.ceil(this.anchor.distanceTo(point) / .012));
    this.safe.copy(this.anchor);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = this.anchor.x + (point.x - this.anchor.x) * t;
      const y = this.anchor.y + (point.y - this.anchor.y) * t;
      const z = this.anchor.z + (point.z - this.anchor.z) * t;
      const ground = this.collision.height(x, z, Math.max(state.y, y));
      // This is a sight line, not the camera body. Keep the larger .035
      // clearance at the actual camera; inflating the entire ray clips curbs.
      if (this.collision.blocked(x, z, y) || (Number.isFinite(ground) && y < ground + .006)) {
        this.obstruction = {kind: this.collision.blocked(x,z,y) ? 'building' : 'ground', x,y,z,ground, anchorY:this.anchor.y};
        point.copy(this.safe); return;
      }
      this.safe.set(x, y, z);
    }
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
