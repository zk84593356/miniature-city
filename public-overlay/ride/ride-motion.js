// SI units for the bicycle; the miniature deliberately exaggerates people 4x.
export const SCALE = 0.04;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const RIDE_MOTION = Object.freeze({ maxSpeed: 9, reverseSpeed: 2, acceleration: 3.4, response: 5.5 });
export function advance(state, throttle, turn, brake, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const previous = state.speed;
  if (brake) state.speed = Math.sign(previous) * Math.max(0, Math.abs(previous) - 7 * dt);
  else if (throttle) {
    const target = throttle > 0 ? RIDE_MOTION.maxSpeed : -RIDE_MOTION.reverseSpeed;
    // Approach a target pace, with bounded initial acceleration on real terrain.
    const response = damp(previous, target, throttle < 0 ? 2 : 1.25, dt) - previous;
    const acceleration = throttle * previous < 0 ? 5 : RIDE_MOTION.acceleration;
    state.speed = previous + clamp(response, -acceleration * dt, acceleration * dt);
    if (Math.abs(target - state.speed) < .015) state.speed = target;
  }
  else state.speed = Math.sign(previous) * Math.max(0, Math.abs(previous) - (0.35 + previous * previous * 0.025) * dt);
  const pace = Math.abs(state.speed) / RIDE_MOTION.maxSpeed;
  state.steering = damp(state.steering, clamp(turn, -1, 1) * (.5 / (1 + pace * 1.7)), RIDE_MOTION.response * (1.15 - pace * .3), dt);
  // Rear wheel kinematic bicycle: no sideways translation or stationary turning.
  state.heading += state.speed / 1.15 * Math.tan(state.steering) * dt;
  state.x += Math.sin(state.heading) * state.speed * SCALE * dt;
  state.z += Math.cos(state.heading) * state.speed * SCALE * dt;
}
