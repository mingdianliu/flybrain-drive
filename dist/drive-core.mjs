import { advanceSteering } from './steering-motion.mjs';
import { TrafficCars, pointInCar, carsOverlap } from './traffic-cars.mjs';
import { trafficAt } from './traffic-core.mjs';
import { NeuralCircuit } from './neural.mjs';
import { at, N, WIDTH, length, nearest, clamp, START, onRoad, CROSSINGS } from './track.mjs';
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lookup = (v, ys, xs) => {
  for (let i = 1; i < ys.length; i++)
    if (v <= ys[i])
      return xs[i - 1] + (xs[i] - xs[i - 1]) * clamp((v - ys[i - 1]) / (ys[i] - ys[i - 1]), 0, 1);
  return xs.at(-1);
};
export function defaultObstacles() {
  return [];
}
export class DrivingExperiment {
  constructor(data) {
    this.brain = new NeuralCircuit(data);
    this.config = {
      targetSpeed: 18,
      grip: 1,
      connected: true,
      signalMode: 'auto',
      pedestriansEnabled: true,
      vehiclesEnabled: true,
    };
    this.obstacles = defaultObstacles();
    this.cars = new TrafficCars();
    this.reset();
  }
  reset() {
    this.brain.reset();
    this.cars.reset();
    const p = at(START);
    Object.assign(this, {
      x: p.x,
      z: p.z,
      yaw: Math.atan2(p.tz, p.tx),
      speed: 0,
      steer: 0,
      brake: 0,
      distance: 0,
      laps: 0,
      collisions: 0,
      progress: 0,
      previousIndex: START,
      blocked: false,
      rays: Array(11).fill(20),
      trail: [],
      rates: [0, 0, 0],
      drive: [0, 0, 0],
      nearObstacle: null,
      stopDistance: Infinity,
      waitReason: null,
    });
    this.traffic = trafficAt(0, this.config.signalMode, this.config.pedestriansEnabled);
    this.traffic.vehicles = this.cars.snapshot(this.config.vehiclesEnabled);
    this.sense();
  }
  configure(c) {
    if (
      !c ||
      typeof c !== 'object' ||
      Object.keys(c).some(
        (k) =>
          ![
            'targetSpeed',
            'grip',
            'connected',
            'signalMode',
            'pedestriansEnabled',
            'vehiclesEnabled',
          ].includes(k),
      )
    )
      throw Error('未知设置');
    if (
      c.targetSpeed !== undefined &&
      (!Number.isFinite(c.targetSpeed) || c.targetSpeed < 8 || c.targetSpeed > 32)
    )
      throw Error('速度必须在 8–32 km/h');
    if (c.grip !== undefined && (!Number.isFinite(c.grip) || c.grip < 0.4 || c.grip > 1))
      throw Error('抓地力必须在 0.4–1');
    if (c.connected !== undefined && typeof c.connected !== 'boolean')
      throw Error('connected 必须为布尔值');
    if (c.signalMode !== undefined && !['auto', 'red', 'green'].includes(c.signalMode))
      throw Error('未知信号灯模式');
    if (c.pedestriansEnabled !== undefined && typeof c.pedestriansEnabled !== 'boolean')
      throw Error('行人开关必须为布尔值');
    if (c.vehiclesEnabled !== undefined && typeof c.vehiclesEnabled !== 'boolean')
      throw Error('车辆开关必须为布尔值');
    if (c.vehiclesEnabled && !this.config.vehiclesEnabled)
      this.cars.reset(nearest(this.x, this.z).index);
    Object.assign(this.config, c);
    this.perception();
    this.sense();
  }
  addObstacle(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !onRoad(x, z, 1.2))
      throw Error('请把障碍物放在道路内');
    if (Math.hypot(x - this.x, z - this.z) < 4) throw Error('障碍物应距离车辆至少 4 米');
    if (this.traffic.vehicles.some((car) => pointInCar(x, z, car, 2)))
      throw Error('障碍物应与街区车辆保持距离');
    if (this.obstacles.length >= 12) throw Error('最多放置 12 个障碍物');
    if (this.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < 2))
      throw Error('两个障碍物需要间隔至少 2 米');
    const o = { id: Math.max(0, ...this.obstacles.map((o) => o.id)) + 1, x, z, r: 0.8 };
    this.obstacles.push(o);
    return o;
  }
  sense() {
    this.rays = Array.from({ length: 11 }, (_, i) => {
      const a = this.yaw - 1.1 + i * 0.22;
      for (let d = 0.5; d <= 20; d += 0.5) {
        const x = this.x + Math.cos(a) * d,
          z = this.z + Math.sin(a) * d;
        if (
          !onRoad(x, z) ||
          this.traffic.vehicles.some((car) => pointInCar(x, z, car, 0.25)) ||
          this.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.3) ||
          this.traffic.pedestrians.some((p) => p.crossing && Math.hypot(x - p.x, z - p.z) < 0.5)
        )
          return d;
      }
      return 20;
    });
  }
  perception() {
    this.traffic = trafficAt(
      this.brain.net.time,
      this.config.signalMode,
      this.config.pedestriansEnabled,
    );
    this.traffic.vehicles = this.cars.snapshot(this.config.vehiclesEnabled);
    this.stopDistance = Infinity;
    this.waitReason = null;
    const n = nearest(this.x, this.z),
      look = 5 + this.speed * 0.55,
      advance = (look / length) * N;
    let offset = 0,
      best = 1e9,
      chosen = null;
    for (const o of this.obstacles) {
      const on = nearest(o.x, o.z),
        ahead = (((on.index - n.index + N) % N) * length) / N;
      if (ahead < 15 && ahead < best) {
        best = ahead;
        chosen = { ...o, offset: on.offset };
      }
    }
    // Engineered lane planner; the connectome supplies the downstream actuation signal.
    if (chosen) {
      const clearance = 2.5;
      const side = -1;
      offset = side * clearance * Math.min(1, Math.max(0, (17 - best) / 6));
      this.nearObstacle = chosen.id;
    } else this.nearObstacle = null;
    // Keep the selected passing side until the obstacle is behind the whole car.
    const nearBehind = this.obstacles.find((o) => Math.hypot(o.x - this.x, o.z - this.z) < 4.5);
    if (nearBehind) {
      const on = nearest(nearBehind.x, nearBehind.z);
      offset = -2.5;
    }
    const p = at(n.index + advance),
      tx = p.x + p.nx * offset,
      tz = p.z + p.nz * offset,
      err = wrap(Math.atan2(tz - this.z, tx - this.x) - this.yaw),
      range = Math.hypot(tx - this.x, tz - this.z);
    // Positive steering is left; world yaw grows toward +Z (vehicle right).
    const requested = clamp(
      -Math.atan2(2 * 2.3 * Math.sin(err), Math.max(3, range)) / this.config.grip,
      -0.52,
      0.52,
    );
    let danger = 0;
    for (const o of this.obstacles) {
      const dx = o.x - this.x,
        dz = o.z - this.z,
        along = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw),
        lateral = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      if (along > 0 && Math.abs(lateral) < o.r + 0.8)
        danger = Math.max(danger, clamp((5 + this.speed * 0.35 - along) / 4, 0, 1));
    }
    for (const c of CROSSINGS) {
      const ahead = (((c.index - n.index + N) % N) * length) / N,
        phase = this.traffic.signals[c.id].phase;
      const stop = ahead - 6.0;
      if (
        ahead > 6 &&
        ahead < 42 &&
        phase !== 'green' &&
        (phase === 'red' || stop > (this.speed * this.speed) / 6 + 1)
      ) {
        if (stop < this.stopDistance) {
          this.stopDistance = stop;
          this.waitReason = phase === 'red' ? '红灯等待' : '黄灯减速';
        }
      }
    }
    for (const ped of this.traffic.pedestrians) {
      if (!ped.crossing) continue;
      const dx = ped.x - this.x,
        dz = ped.z - this.z,
        along = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw),
        side = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      if (along > 0 && along < 16 && Math.abs(side) < 2.2 && along - 3.2 < this.stopDistance) {
        this.stopDistance = along - 3.2;
        this.waitReason = '行人优先';
      }
    }
    for (const car of this.traffic.vehicles) {
      const ahead = (((car.index - n.index + N) % N) * length) / N,
        dx = car.x - this.x,
        dz = car.z - this.z,
        along = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw),
        side = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      const sameLane = car.direction === 1 && Math.abs(n.offset) < 1.8;
      const gap =
        sameLane && ahead < 35
          ? ahead - 5.8
          : along > 0 && along < 25 && Math.abs(side) < 2.1
            ? along - 5.8
            : Infinity;
      if (gap < this.stopDistance) {
        this.stopDistance = gap;
        this.waitReason = car.direction === 1 ? '前车减速' : '会车让行';
      }
    }
    if (Number.isFinite(this.stopDistance))
      danger = Math.max(
        danger,
        clamp(((this.speed * this.speed) / 3 + 10 - this.stopDistance) / 10, 0, 1),
      );
    this.drive = [
      20 + (Math.max(requested, 0) / 0.52) * 180,
      20 + (Math.max(-requested, 0) / 0.52) * 180,
      danger * 150,
    ];
  }
  step(ms = 10) {
    this.cars.advance(ms, this.traffic, this, this.obstacles, this.config.vehiclesEnabled);
    this.perception();
    this.rates = this.brain.advance(ms, this.drive);
    const hz = [
      lookup(this.rates[0], [0, 16.07, 33.62, 52.41, 66.28, 76.24], [0, 20, 50, 100, 150, 200]),
      lookup(this.rates[1], [0, 15.75, 31.86, 50.74, 65.21, 76.45], [0, 20, 50, 100, 150, 200]),
    ];
    const dt = ms / 1000;
    const demand = this.config.connected ? clamp(((hz[0] - hz[1]) / 180) * 0.52, -0.52, 0.52) : 0;
    this.steer = this.config.connected ? advanceSteering(this.steer, demand, dt) : 0;
    this.brake = this.config.connected ? clamp(this.rates[2] / 240, 0, 1) : 1;
    const active = this.rates[0] + this.rates[1] + this.rates[2] > 1;
    let target =
      active && this.config.connected && !this.blocked
        ? ((this.config.targetSpeed / 3.6) * (1 - this.brake)) / (1 + 2.5 * Math.abs(this.steer))
        : 0;
    // Explicit traffic-rule supervisor caps speed at stop lines; it is separate from neural decoding.
    if (Number.isFinite(this.stopDistance))
      target = Math.min(
        target,
        this.stopDistance < 1.2 ? 0 : Math.sqrt(Math.max(0, 3.6 * (this.stopDistance - 0.4))),
      );
    this.speed = clamp(this.speed + clamp((target - this.speed) * 2, -7, 2.5) * dt, 0, 12);
    if (Number.isFinite(this.stopDistance))
      this.speed = Math.min(this.speed, Math.max(0, this.stopDistance - 0.2) / dt);
    if (this.speed < 0.02) this.speed = 0;
    const yaw = this.yaw - (this.speed / 2.3) * Math.tan(this.steer) * this.config.grip * dt,
      x = this.x + Math.cos(yaw) * this.speed * dt,
      z = this.z + Math.sin(yaw) * this.speed * dt;
    // Bumper samples for static hazards and an oriented footprint for other cars.
    const hit =
      !onRoad(x, z, 1.12) ||
      this.obstacles.some((o) =>
        [-1.3, 1.3].some(
          (q) => Math.hypot(x + Math.cos(yaw) * q - o.x, z + Math.sin(yaw) * q - o.z) < o.r + 1.1,
        ),
      );
    const hitPed = this.traffic.pedestrians.some((p) =>
      [-1.3, 1.3].some(
        (q) => Math.hypot(x + Math.cos(yaw) * q - p.x, z + Math.sin(yaw) * q - p.z) < 1.35,
      ),
    );
    if (
      (hit || hitPed || this.traffic.vehicles.some((car) => carsOverlap({ x, z, yaw }, car))) &&
      this.speed > 0
    ) {
      this.collisions++;
      this.blocked = true;
      this.speed = 0;
      this.brake = 1;
    } else if (!this.blocked) {
      this.x = x;
      this.z = z;
      this.yaw = yaw;
      this.distance += this.speed * dt;
      const ix = nearest(x, z).index;
      let delta = ix - this.previousIndex;
      if (delta < -N / 2) delta += N;
      if (delta > N / 2) delta -= N;
      this.progress += delta;
      this.previousIndex = ix;
      this.laps = Math.max(0, Math.floor(this.progress / N));
    }
    if (this.brain.net.tick % 500 === 0) {
      this.sense();
      this.trail.push([this.x, this.z]);
      if (this.trail.length > 1500) this.trail.shift();
    }
    return this.snapshot();
  }
  snapshot() {
    return {
      time: this.brain.net.time,
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      steer: this.steer,
      brake: this.brake,
      distance: this.distance,
      laps: this.laps,
      collisions: this.collisions,
      blocked: this.blocked,
      rates: this.rates,
      rays: this.rays,
      drive: this.drive,
      total: this.brain.net.total,
      active: this.brain.net.last.reduce((a, t) => a + (this.brain.net.time - t < 120), 0),
      traffic: this.traffic,
      waitReason: this.waitReason,
      stopDistance: Number.isFinite(this.stopDistance) ? this.stopDistance : null,
      config: { ...this.config },
      obstacles: this.obstacles.map((o) => ({ ...o })),
    };
  }
}
