import { at, N, length, LANE, START, CROSSINGS, nearest, clamp } from './track.mjs';
const mod = (n, d) => ((n % d) + d) % d;
const ahead = (a, b, dir) => (mod((b - a) * dir, N) * length) / N;
export function carPose(index, direction = 1) {
  const i = Math.floor(index),
    f = index - i,
    a = at(i),
    b = at(i + 1),
    tx = a.tx + (b.tx - a.tx) * f,
    tz = a.tz + (b.tz - a.tz) * f,
    n = Math.hypot(tx, tz),
    offset = direction === 1 ? 0 : -2 * LANE;
  return {
    x: a.x + (b.x - a.x) * f - (tz / n) * offset,
    z: a.z + (b.z - a.z) * f + (tx / n) * offset,
    yaw: Math.atan2(tz * direction, tx * direction),
  };
}
export function pointInCar(x, z, car, padding = 0) {
  const dx = x - car.x,
    dz = z - car.z,
    c = Math.cos(car.yaw),
    s = Math.sin(car.yaw);
  return Math.abs(dx * c + dz * s) < 2.3 + padding && Math.abs(-dx * s + dz * c) < 1 + padding;
}
export function carsOverlap(a, b) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  return axes.every((angle) => {
    const x = Math.cos(angle),
      z = Math.sin(angle),
      radius = (v) =>
        2.3 * Math.abs(Math.cos(v.yaw) * x + Math.sin(v.yaw) * z) +
        Math.abs(-Math.sin(v.yaw) * x + Math.cos(v.yaw) * z);
    return Math.abs((b.x - a.x) * x + (b.z - a.z) * z) < radius(a) + radius(b);
  });
}
// Scripted traffic actors share the simulation clock, but have no neural controller.
export class TrafficCars {
  constructor() {
    this.reset();
  }
  reset(index = START) {
    this.cars = [
      { direction: 1, offset: 11, cruise: 4.1 },
      { direction: 1, offset: length * 0.5, cruise: 4.7 },
      { direction: -1, offset: 45, cruise: 4.6 },
      { direction: -1, offset: length * 0.7, cruise: 5.1 },
    ].map((v, id) => {
      const i = mod(index + (v.offset / length) * N, N);
      return {
        id,
        index: i,
        direction: v.direction,
        cruise: v.cruise,
        speed: 0,
        distance: 0,
        steer: 0,
        waiting: null,
        ...carPose(i, v.direction),
      };
    });
  }
  snapshot(enabled = true) {
    return enabled ? this.cars.map((c) => ({ ...c })) : [];
  }
  advance(ms, traffic, hero, obstacles, enabled = true) {
    if (!enabled) return;
    const dt = ms / 1000,
      old = this.cars.map((c) => ({ ...c })),
      heroIndex = nearest(hero.x, hero.z).index;
    this.cars = old.map((car) => {
      let stop = Infinity,
        waiting = null;
      const limit = (distance, reason) => {
        if (distance < stop) {
          stop = distance;
          waiting = reason;
        }
      };
      for (const c of CROSSINGS) {
        const distance = ahead(car.index, c.index, car.direction),
          phase = traffic.signals[c.id].phase;
        if (
          distance > 6 &&
          distance < 42 &&
          phase !== 'green' &&
          (phase === 'red' || distance - 6 > car.speed ** 2 / 6 + 1)
        )
          limit(distance - 6, phase === 'red' ? 'red' : 'yellow');
      }
      for (const other of old) {
        if (other.id === car.id || other.direction !== car.direction) continue;
        const distance = ahead(car.index, other.index, car.direction);
        if (distance < 35) limit(distance - 5.8, 'vehicle');
      }
      // Following the main car is based on its actual lane, not only its target path.
      const heroLane = nearest(hero.x, hero.z).offset,
        targetLane = car.direction === 1 ? 0 : -2 * LANE;
      if (Math.abs(heroLane - targetLane) < 1.8) {
        const distance = ahead(car.index, heroIndex, car.direction);
        if (distance < 35) limit(distance - 5.8, 'vehicle');
      }
      const c = Math.cos(car.yaw),
        s = Math.sin(car.yaw);
      for (const p of traffic.pedestrians) {
        if (!p.crossing) continue;
        const dx = p.x - car.x,
          dz = p.z - car.z,
          along = dx * c + dz * s,
          side = -dx * s + dz * c;
        if (along > 0 && along < 18 && Math.abs(side) < 1.9) limit(along - 3.2, 'pedestrian');
      }
      for (const o of obstacles) {
        const dx = o.x - car.x,
          dz = o.z - car.z,
          along = dx * c + dz * s,
          side = -dx * s + dz * c;
        if (along > 0 && along < 25 && Math.abs(side) < o.r + 1.1)
          limit(along - o.r - 3, 'obstacle');
      }
      let target = car.cruise;
      if (Number.isFinite(stop))
        target = Math.min(target, stop < 0.8 ? 0 : Math.sqrt(Math.max(0, 3.6 * (stop - 0.4))));
      let speed = clamp(car.speed + clamp((target - car.speed) * 2, -7, 2.1) * dt, 0, car.cruise);
      if (Number.isFinite(stop)) speed = Math.min(speed, Math.max(0, stop - 0.2) / dt);
      if (speed < 0.02) speed = 0;
      const index = mod(car.index + ((car.direction * speed * dt) / length) * N, N),
        pose = carPose(index, car.direction),
        distance = Math.hypot(pose.x - car.x, pose.z - car.z),
        turn = Math.atan2(Math.sin(pose.yaw - car.yaw), Math.cos(pose.yaw - car.yaw));
      return {
        ...car,
        index,
        speed,
        waiting: target < car.cruise ? waiting : null,
        distance: car.distance + distance,
        steer:
          distance > 1e-6 ? clamp(-Math.atan((2.3 * turn) / distance), -0.52, 0.52) : car.steer,
        ...pose,
      };
    });
  }
}
