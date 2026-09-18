import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { spikeActivity } from '../dist/activity.mjs';
import { NeuralCircuit } from '../dist/neural.mjs';

test('never-fired neurons, window boundaries, pause and reset are represented honestly', () => {
  const last = Float32Array.from([-1e9, NaN, 1001, 0, 499, 500, 999]);
  const before = last.slice(),
    short = spikeActivity(last, 1000, 120),
    long = spikeActivity(last, 1000, 500);
  assert.equal(short.count, 1);
  assert.equal(long.count, 1); // exactly 500 ms ago is outside (now-window, now]
  assert.equal(spikeActivity(last, 1000, 1000).count, 3);
  assert.equal(spikeActivity(Float32Array.of(0), 0, 120).count, 1);
  assert.deepEqual(spikeActivity(last, 1000, 500), long); // paused simulation does not fade with wall time
  assert.deepEqual(last, before); // visualization must not mutate spike data
  const buffer = new Float32Array(7).fill(1);
  assert.equal(spikeActivity(null, 0, 500, buffer).count, 0);
  assert.ok(buffer.every((x) => x === 0));
  assert.throws(() => spikeActivity(last, 1000, 50));
});

test('visible counts equal unique neurons that actually spiked in the same real-model window', () => {
  const d = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(new URL('../dist/data/circuit.json.gz', import.meta.url))),
  );
  const b = new NeuralCircuit(d),
    counts = new Map([[0, b.net.fires.slice()]]);
  for (let i = 0; i < 100; i++) {
    b.advance(10, [60, 20, 0]);
    counts.set(b.net.time, b.net.fires.slice());
  }
  const beforeTotal = b.net.total;
  for (const window of [120, 500, 1000]) {
    const old = counts.get(1000 - window),
      expected = b.net.fires.reduce((n, f, i) => n + (f > old[i]), 0);
    const actual = spikeActivity(b.net.last, b.net.time, window);
    assert.equal(actual.count, expected);
    assert.equal(actual.total, 1860);
    assert.equal(actual.values.filter((x) => x > 0).length, expected);
  }
  assert.equal(b.net.total, beforeTotal);
});
