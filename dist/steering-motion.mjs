const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// An engineered actuator after neural decoding, shared by the car physics and
// the visible steering wheel. Small readout fluctuations need not move the rack.
export function advanceSteering(angle, demand, dt) {
  const error = clamp(demand, -0.52, 0.52) - angle,
    deadband = 0.005;
  if (dt <= 0 || Math.abs(error) <= deadband) return angle;
  const correction = (error - Math.sign(error) * deadband) * (1 - Math.exp(-dt / 0.14));
  return angle + clamp(correction, -0.9 * dt, 0.9 * dt);
}

// Worker snapshots arrive at about 20 Hz. Interpolate between received angles
// for rendering; never extrapolate, change physics, or advance while paused.
export class SteeringPlayback {
  constructor() {
    this.reset();
  }
  reset() {
    this.time = null;
    this.from = this.to = 0;
    this.start = 0;
    this.duration = 50;
  }
  sample(steer, time, now, running) {
    if (this.time === null || time < this.time || !running) {
      this.from = this.to = steer;
      this.time = time;
      this.start = now;
      return steer;
    }
    const current =
      this.from + (this.to - this.from) * clamp((now - this.start) / this.duration, 0, 1);
    if (time > this.time) {
      this.from = current;
      this.to = steer;
      this.duration = clamp(time - this.time, 16, 80);
      this.time = time;
      this.start = now;
    }
    return current;
  }
}
