// SI units for the bicycle; the miniature deliberately exaggerates people 4x.
export const SCALE = 0.04;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function advance(state, throttle, turn, brake, dt) {
  const previous = state.speed;
  if (brake) state.speed = Math.sign(previous) * Math.max(0, Math.abs(previous) - 7 * dt);
  else if (throttle) state.speed = clamp(previous + throttle * (throttle * previous < 0 ? 5 : 2.2) * dt, -2, 9);
  else state.speed = Math.sign(previous) * Math.max(0, Math.abs(previous) - (0.35 + previous * previous * 0.025) * dt);
  state.steering = damp(state.steering, turn * (0.48 / (1 + Math.abs(state.speed) * 0.13)), 7, dt);
  // Rear wheel kinematic bicycle: no sideways translation or stationary turning.
  state.heading += state.speed / 1.15 * Math.tan(state.steering) * dt;
  state.x += Math.sin(state.heading) * state.speed * SCALE * dt;
  state.z += Math.cos(state.heading) * state.speed * SCALE * dt;
}
