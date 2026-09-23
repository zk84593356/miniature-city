import { RideAvatar } from './ride-avatar.js';
import { RideCamera } from './ride-camera.js';
import { RideCollision } from './ride-collision.js';
import { advance, SCALE, clamp, damp } from './ride-motion.js';

export function createRide(context) { return new RideController(context); }
class RideController {
  constructor(context) {
    Object.assign(this, context);
    this.active = false; this.keys = new Set(); this.events = new AbortController();
    this.button = document.createElement('button'); this.button.id = 'ride-toggle'; this.button.type = 'button';
    this.button.setAttribute('aria-pressed', 'false');
    this.root.querySelector('.top-actions').prepend(this.button);
    this.hud = document.createElement('aside'); this.hud.className = 'ride-hud'; this.hud.hidden = true;
    this.hud.innerHTML = '<strong>↗ <span class="ride-speed">0</span> km/h</strong><p class="ride-help"></p><button type="button" class="ride-exit"></button>';
    this.root.append(this.hud); this.speedLabel = this.hud.querySelector('.ride-speed');
    this.button.onclick = () => this.active ? this.exit() : this.enter();
    this.hud.querySelector('button').onclick = () => this.exit();
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('./ride.css', import.meta.url).href; document.head.append(style); this.style = style;
    const listen = (target, name, fn, options = {}) => target.addEventListener(name, fn, { ...options, signal: this.events.signal });
    const codes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    listen(window, 'keydown', event => {
      if (!this.active || event.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.exit(); return; }
      if (codes.has(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); this.keys.add(event.code); }
      else if (['KeyH', 'KeyF', 'KeyN', 'KeyM', 'Equal', 'Minus'].includes(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true });
    listen(window, 'keyup', event => { this.keys.delete(event.code); if (this.active && codes.has(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true });
    const clear = () => { this.keys.clear(); if (this.follow) this.follow.dragging = false; if (this.state) this.state.speed = 0; this.pointer = null; };
    listen(window, 'blur', clear);
    listen(document, 'visibilitychange', clear);
    listen(window, 'pagehide', clear);
    listen(window, 'pointerdown', event => {
      if (!this.active || event.target !== this.canvas) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.button !== 0) return;
      this.canvas.focus({ preventScroll: true }); this.pointer = event.pointerId; this.lastX = event.clientX;
      this.follow.dragging = true; this.canvas.setPointerCapture(event.pointerId);
    }, { capture: true });
    listen(window, 'pointermove', event => {
      if (!this.active || (event.target !== this.canvas && this.pointer !== event.pointerId)) return;
      event.stopImmediatePropagation();
      if (this.pointer === event.pointerId) { this.follow.drag(event.clientX - this.lastX); this.lastX = event.clientX; }
    }, { capture: true });
    const release = event => {
      if (!this.active || (event.target !== this.canvas && this.pointer !== event.pointerId)) return;
      event.stopImmediatePropagation(); this.follow.dragging = false; this.pointer = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    listen(window, 'pointerup', release, { capture: true }); listen(window, 'pointercancel', release, { capture: true });
    listen(this.canvas, 'lostpointercapture', () => { if (this.follow) this.follow.dragging = false; this.pointer = null; });
    listen(window, 'wheel', event => { if (this.active && event.target === this.canvas) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true, passive: false });
    listen(this.canvas, 'contextmenu', event => { if (this.active) event.preventDefault(); });
    // A city destination chosen from the original UI cleanly leaves riding first.
    this.original = new Map();
    for (const name of ['fly', 'zoom']) {
      const fn = this.controller[name]; this.original.set(name, fn);
      this.controller[name] = (...args) => { if (this.active) this.exit(); return fn.apply(this.controller, args); };
    }
    this.languageObserver = new MutationObserver(() => this.localize());
    this.languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    this.localize();
    // Read-only diagnostics for acceptance checks; no second animation loop.
    window.__cityRide = { getState: () => this.snapshot() };
  }
  localize() {
    const zh = document.documentElement.lang.startsWith('zh');
    this.button.textContent = this.active ? (zh ? '退出骑行' : 'Exit ride') : (zh ? '骑行' : 'Ride');
    this.hud.querySelector('.ride-help').textContent = zh ? 'WASD / 方向键 骑行 · Space 刹车\n拖动鼠标观察 · Esc 退出' : 'WASD / arrows Ride · Space Brake\nDrag to look · Esc Exit';
    this.hud.querySelector('button').textContent = zh ? '退出骑行' : 'Exit ride';
    this.hud.setAttribute('aria-label', zh ? '骑行状态' : 'Ride status');
  }
  enter() {
    if (this.active) return;
    try {
      this.collision ||= new RideCollision(this);
      const state = this.collision.spawn(this.controller.controls.target, this.roads);
      if (!state) { this.toast(document.documentElement.lang.startsWith('zh') ? '附近没有可安全进入的道路，请先切换城市位置' : 'No safe road found. Choose another city location.'); return; }
      this.avatar ||= new RideAvatar(this.three, this.rideModel);
      this.follow ||= new RideCamera(this.three, this.camera, this.controller, this.collision);
      this.state = state; this.visualY = state.y + .002; this.pitch = 0; this.roll = 0; this.keys.clear();
      this.follow.save(); this.active = true;
      this.scene.add(this.avatar.root); this.avatar.root.visible = true;
      this.hud.hidden = false; this.root.classList.add('is-riding');
      this.button.setAttribute('aria-pressed', 'true'); this.localize();
      this.update(0); this.follow.update(this.state, 0, true, this.visualY);
      this.canvas.focus({ preventScroll: true });
    } catch (error) {
      if (this.active) this.exit();
      console.error('Ride initialization failed', error); this.toast(document.documentElement.lang.startsWith('zh') ? '骑行暂时不可用，请重试' : 'Riding is temporarily unavailable. Please retry.');
    }
  }
  exit() {
    if (!this.active) return;
    this.active = false; this.keys.clear(); this.state.speed = 0;
    if (this.pointer != null && this.canvas.hasPointerCapture(this.pointer)) this.canvas.releasePointerCapture(this.pointer);
    this.pointer = null;
    this.avatar.root.visible = false; this.follow.restore(); this.hud.hidden = true;
    this.root.classList.remove('is-riding'); this.button.setAttribute('aria-pressed', 'false'); this.localize();
    this.button.focus({ preventScroll: true });
  }
  update(dt) {
    if (!this.active) return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .08);
    const has = (a, b) => this.keys.has(a) || this.keys.has(b);
    const throttle = Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown'));
    const turn = Number(has('KeyA', 'ArrowLeft')) - Number(has('KeyD', 'ArrowRight'));
    const brake = this.keys.has('Space'), s = this.state;
    // Small substeps prevent fast motion tunneling through narrow building walls.
    let remaining = dt, travel = 0;
    while (remaining > 1e-8) {
      const step = Math.min(remaining, 1 / 120); remaining -= step;
      const x = s.x, z = s.z, previousY = s.y, heading = s.heading;
      advance(s, throttle, turn, brake, step);
      const y = this.collision.height(s.x, s.z, s.y);
      if (!this.collision.valid(s.x, s.z, y) || Math.abs(y - s.y) > .06) {
        s.x = x; s.z = z; s.heading = heading; s.speed = 0;
      } else {
        travel += Math.sign(s.speed) * Math.hypot(s.x - x, s.z - z, y - previousY) / SCALE;
        s.y = y;
      }
    }
    const half = .58 * SCALE, dx = Math.sin(s.heading) * half, dz = Math.cos(s.heading) * half;
    const front = this.collision.height(s.x + dx, s.z + dz, s.y), rear = this.collision.height(s.x - dx, s.z - dz, s.y);
    const slope = Number.isFinite(front) && Number.isFinite(rear) ? Math.atan2(front - rear, half * 2) : 0;
    this.pitch = damp(this.pitch, clamp(-slope, -.4, .4), 10, dt);
    const side = .22 * SCALE, sx = Math.cos(s.heading) * side, sz = -Math.sin(s.heading) * side;
    const left = this.collision.height(s.x - sx, s.z - sz, s.y), right = this.collision.height(s.x + sx, s.z + sz, s.y);
    const bank = Number.isFinite(left) && Number.isFinite(right) ? Math.atan2(right - left, side * 2) : 0;
    this.roll = damp(this.roll, clamp(bank - s.steering * s.speed * .055, -.18, .18), 6, dt);
    const root = this.avatar.root;
    // Both wheel contacts constrain the damped chassis: never interpolate below a surface.
    const support = Number.isFinite(front) && Number.isFinite(rear)
      ? Math.max(s.y, front + Math.sin(this.pitch) * half, rear - Math.sin(this.pitch) * half) : s.y;
    const floor = support + .002;
    this.visualY = Math.max(floor, damp(this.visualY, floor, 18, dt));
    root.position.set(s.x, this.visualY, s.z);
    root.rotation.set(this.pitch, s.heading, this.roll, 'YXZ');
    this.avatar.animate(dt, s.speed, s.steering, brake, travel); this.follow.update(s, dt, false, this.visualY);
    const speed = Math.round(Math.abs(s.speed) * 3.6).toString();
    if (this.speedLabel.textContent !== speed) this.speedLabel.textContent = speed;
  }
  snapshot() {
    return { active: this.active, state: this.state ? { ...this.state } : null, wheel: this.avatar?.animation.wheelAngle, pedalPhase: this.avatar?.animation.phase,
      model: this.avatar?.modelStatus, contactError: (this.avatar?.modelAnimation || this.avatar?.animation)?.contactError,
      cameraBlock: this.follow?.obstruction, cameraOffset: this.follow?.offset, cameraSwing: this.follow?.swing, cameraFov: this.camera.fov,
      camera: this.camera.position.toArray(), cameraQuaternion: this.camera.quaternion.toArray(), cameraNear: this.camera.near,
      cameraView: this.camera.view ? { ...this.camera.view } : null, cameraTarget: this.controller.controls.target.toArray(),
      pitch: this.pitch, roll: this.roll, avatarVisible: this.avatar?.root.visible ?? false,
      ground: this.state && this.collision.height(this.state.x, this.state.z, this.state.y), controlsEnabled: this.controller.controls.enabled };
  }
  dispose() {
    this.exit(); this.events.abort(); this.languageObserver.disconnect();
    for (const [name, fn] of this.original) this.controller[name] = fn;
    this.avatar?.dispose(); this.button.remove(); this.hud.remove(); this.style.remove(); delete window.__cityRide;
  }
}
