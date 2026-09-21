import { SCALE, clamp, damp } from './ride-motion.js';

export class RideCamera {
  constructor(T, camera, controller, collision) {
    Object.assign(this, { camera, controller, collision });
    this.target = new T.Vector3(); this.desired = new T.Vector3();
    this.offset = 0; this.heading = 0; this.dragging = false;
  }
  save() {
    const c = this.camera, controls = this.controller.controls;
    this.saved = { position: c.position.clone(), quaternion: c.quaternion.clone(), target: controls.target.clone(), near: c.near, fov: c.fov, view: c.view ? { ...c.view } : null, enabled: controls.enabled };
    this.controller.cancel();
    // Drain pending orbit inertia while the saved view is intact. Otherwise a
    // drag immediately before entering would resume unexpectedly after Escape.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    controls.enabled = false;
    c.near = .002; c.fov = 52; c.clearViewOffset(); c.updateProjectionMatrix();
    this.offset = 0;
  }
  drag(dx) { this.offset = clamp(this.offset - dx * .006, -1.15, 1.15); }
  update(state, dt, snap = false) {
    if (!this.dragging) this.offset = damp(this.offset, 0, 1.8, dt);
    const difference = Math.atan2(Math.sin(state.heading - this.heading), Math.cos(state.heading - this.heading));
    this.heading = snap ? state.heading : this.heading + difference * (1 - Math.exp(-4 * dt));
    const angle = this.heading + this.offset, distance = (5 + Math.abs(state.speed) * .16) * SCALE;
    this.desired.set(state.x - Math.sin(angle) * distance, state.y + 2.8 * SCALE, state.z - Math.cos(angle) * distance);
    this.target.set(state.x + Math.sin(state.heading) * SCALE, state.y + 1.05 * SCALE, state.z + Math.cos(state.heading) * SCALE);
    // Shorten the boom when buildings intervene, without raycasting the city.
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, x = this.target.x + (this.desired.x - this.target.x) * t, z = this.target.z + (this.desired.z - this.target.z) * t;
      if (this.collision.blocked(x, z, this.target.y)) { this.desired.lerp(this.target, 1 - Math.max(.12, (i - 1) / 12)); break; }
    }
    const c = this.camera;
    if (snap) c.position.copy(this.desired);
    else c.position.lerp(this.desired, 1 - Math.exp(-6 * dt));
    const floor = this.collision.height(c.position.x, c.position.z, state.y);
    if (Number.isFinite(floor)) c.position.y = Math.max(c.position.y, floor + .035);
    this.controller.controls.target.lerp(this.target, snap ? 1 : 1 - Math.exp(-9 * dt));
    c.lookAt(this.controller.controls.target);
  }
  restore() {
    const s = this.saved, c = this.camera;
    c.position.copy(s.position); c.quaternion.copy(s.quaternion);
    c.near = s.near; c.fov = s.fov; c.view = s.view; c.updateProjectionMatrix();
    this.controller.controls.target.copy(s.target);
    this.controller.controls.enabled = s.enabled;
    this.dragging = false;
  }
}
