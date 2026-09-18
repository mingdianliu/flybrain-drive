import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { DrivingExperiment } from '../dist/drive-core.mjs';
import { trafficAt } from '../dist/traffic-core.mjs';
import { START, at, CROSSINGS, nearest, length, N } from '../dist/track.mjs';
import { NeuralCircuit } from '../dist/neural.mjs';
const m = JSON.parse(fs.readFileSync(new URL('../dist/data/manifest.json', import.meta.url)));
const bytes = fs.readFileSync(new URL('../dist/data/circuit.json.gz', import.meta.url));
const d = JSON.parse(zlib.gunzipSync(bytes));
const run = (e, ms) => {
  for (let i = 0; i < ms / 10; i++) e.step();
  return e.snapshot();
};
test('pinned circuit is intact, positioned and readouts are not injected inputs', () => {
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), m.circuit.sha256);
  assert.equal(d.nodes.length, m.neurons);
  assert.equal(d.targets.length, m.edges);
  assert.ok(d.nodes.every((n) => n.slice(4).every(Number.isFinite)));
  const inputs = new Set(d.inputs.flat());
  assert.ok(d.outputs.flat().every((i) => !inputs.has(i)));
});
test('real synaptic propagation is required for downstream spikes', () => {
  const brain = new NeuralCircuit(d);
  for (let i = 0; i < 50; i++) brain.advance(10, [100, 0, 0]);
  assert.ok(brain.rates[0] > 40);
  assert.ok(brain.rates[0] > brain.rates[1] * 5);
  const silenced = new NeuralCircuit({ ...d, signs: d.signs.map(() => 0) });
  for (let i = 0; i < 50; i++) silenced.advance(10, [100, 0, 0]);
  assert.deepEqual(silenced.rates, [0, 0, 0]);
  assert.ok(silenced.net.total > 0);
});
test('city route completes two circuits with live signals and pedestrians without contact', () => {
  const e = new DrivingExperiment(d),
    s = run(e, 360000);
  assert.ok(s.laps >= 2);
  assert.equal(s.collisions, 0);
  assert.ok(s.total > 10000);
});
test('disconnecting brain stops motion while simulation continues', () => {
  const e = new DrivingExperiment(d);
  e.configure({ signalMode: 'green', pedestriansEnabled: false });
  run(e, 5000);
  assert.ok(e.speed > 1);
  const total = e.brain.net.total;
  e.configure({ connected: false });
  run(e, 5000);
  assert.equal(e.speed, 0);
  assert.ok(e.brain.net.total > total);
  e.configure({ connected: true });
  run(e, 5000);
  assert.ok(e.speed > 1);
});
test('obstacles and live settings are validated atomically', () => {
  const e = new DrivingExperiment(d);
  const cfg = { ...e.config };
  assert.throws(() => e.configure({ targetSpeed: 25, grip: 0 }));
  assert.deepEqual(e.config, cfg);
  assert.throws(() => e.addObstacle(20, 20));
  assert.throws(() => e.addObstacle(e.x, e.z));
  e.obstacles = [];
  e.addObstacle(22, -31.85);
  assert.equal(e.obstacles.length, 1);
  assert.throws(() => e.addObstacle(22, -31.85));
  e.configure({ targetSpeed: 22, grip: 0.7 });
  assert.equal(e.config.targetSpeed, 22);
});
test('zero effective synapses prevent autonomous motion', () => {
  const e = new DrivingExperiment({ ...d, signs: d.signs.map(() => 0) });
  const s = run(e, 3000);
  assert.equal(s.distance, 0);
  assert.equal(s.speed, 0);
});

test('red signal causes a full stop; green releases the car', () => {
  const e = new DrivingExperiment(d);
  e.configure({ signalMode: 'red', pedestriansEnabled: false, vehiclesEnabled: false });
  const s = run(e, 15000);
  assert.equal(s.speed, 0);
  assert.equal(s.waitReason, '红灯等待');
  assert.ok(s.stopDistance >= 0);
  const distance = s.distance;
  e.configure({ signalMode: 'green' });
  const after = run(e, 5000);
  assert.ok(after.distance > distance + 5);
  assert.equal(after.collisions, 0);
});
test('pedestrians walk across the road during the red phase and pause with model time', () => {
  const a = trafficAt(4000),
    b = trafficAt(7000);
  assert.equal(a.signals[0].phase, 'red');
  assert.ok(a.pedestrians[0].walking);
  assert.ok(
    Math.hypot(a.pedestrians[0].x - b.pedestrians[0].x, a.pedestrians[0].z - b.pedestrians[0].z) >
      1,
  );
  assert.deepEqual(trafficAt(4000), a);
  assert.equal(trafficAt(4000, 'auto', false).pedestrians.length, 0);
});

test('ambient cars move, stop for red lights and cause actual neural braking in the follower', () => {
  const e = new DrivingExperiment(d);
  e.configure({ signalMode: 'red', pedestriansEnabled: false });
  const initial = e.snapshot().traffic.vehicles;
  assert.equal(initial.length, 4);
  assert.deepEqual(new Set(initial.map((c) => c.direction)), new Set([1, -1]));
  const stopped = run(e, 15000);
  assert.equal(stopped.waitReason, '前车减速');
  assert.equal(stopped.speed, 0);
  assert.ok(stopped.rates[2] > 0);
  assert.ok(stopped.stopDistance >= 0);
  assert.equal(stopped.collisions, 0);
  assert.ok(stopped.traffic.vehicles.some((c) => c.distance > 1));
  assert.ok(stopped.traffic.vehicles.some((c) => c.speed === 0 && c.waiting === 'red'));
  const frozen = JSON.stringify(e.snapshot().traffic.vehicles);
  assert.equal(JSON.stringify(e.snapshot().traffic.vehicles), frozen);
  const distance = stopped.distance;
  e.configure({ signalMode: 'green' });
  const moving = run(e, 7000);
  assert.ok(moving.distance > distance + 5);
  assert.ok(moving.traffic.vehicles.some((c) => c.speed > 1));
  assert.equal(moving.collisions, 0);
  e.configure({ vehiclesEnabled: false });
  assert.equal(e.snapshot().traffic.vehicles.length, 0);
  e.configure({ vehiclesEnabled: true });
  assert.equal(e.snapshot().traffic.vehicles.length, 4);
  assert.throws(() => e.configure({ vehiclesEnabled: 'yes' }));
  e.reset();
  assert.deepEqual(e.snapshot().traffic.vehicles, initial);
});
