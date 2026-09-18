import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { advanceSteering, SteeringPlayback } from '../dist/steering-motion.mjs';
import { DrivingExperiment } from '../dist/drive-core.mjs';

test('steering rejects small tremor, responds to a turn and bounds actuator speed', () => {
  let angle = 0;
  for (let i = 0; i < 100; i++) angle = advanceSteering(angle, i % 2 ? 0.004 : -0.004, 0.01);
  assert.equal(angle, 0);
  for (let i = 0; i < 60; i++) {
    const next = advanceSteering(angle, 0.3, 0.01);
    assert.ok(next >= angle && next - angle <= 0.009 + 1e-12);
    angle = next;
  }
  assert.ok(angle > 0.285 && angle < 0.3, 'a deliberate turn still reaches its target');
  assert.equal(advanceSteering(angle, -0.3, 0), angle, 'no simulation time means no motion');
});

test('actual neural fluctuations do not shake a stopped steering wheel', () => {
  const data = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(new URL('../dist/data/circuit.json.gz', import.meta.url))),
  );
  const e = new DrivingExperiment(data);
  e.configure({ signalMode: 'red', vehiclesEnabled: false, pedestriansEnabled: false });
  const angles = [];
  for (let i = 0; i < 1800; i++) {
    e.step();
    if (i > 1500) angles.push(e.steer);
  }
  assert.equal(e.speed, 0);
  assert.ok(e.brain.net.total > 1000);
  const wheelRange = ((Math.max(...angles) - Math.min(...angles)) * 6 * 180) / Math.PI;
  assert.ok(wheelRange < 0.8, `wheel tremor ${wheelRange.toFixed(3)} degrees`);
  e.reset();
  assert.equal(e.steer, 0);
});

test('20 Hz steering snapshots interpolate without jumping, overshooting or moving on pause', () => {
  const p = new SteeringPlayback();
  assert.equal(p.sample(0, 0, 0, true), 0);
  assert.equal(p.sample(0.1, 50, 50, true), 0);
  assert.ok(Math.abs(p.sample(0.1, 50, 75, true) - 0.05) < 1e-12);
  assert.equal(p.sample(0.1, 50, 100, true), 0.1);
  assert.equal(p.sample(0.1, 50, 900, true), 0.1, 'never extrapolate between snapshots');
  assert.equal(p.sample(0.2, 100, 1000, true), 0.1);
  assert.equal(p.sample(0.2, 100, 1010, false), 0.2);
  assert.equal(p.sample(0.2, 100, 8000, false), 0.2, 'paused frames remain exactly identical');
  assert.equal(p.sample(0, 0, 9000, false), 0, 'reset clears the previous turn');
});
