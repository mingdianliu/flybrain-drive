import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { DrivingExperiment } from '../dist/drive-core.mjs';
const small = JSON.parse(zlib.gunzipSync(fs.readFileSync('dist/data/circuit.json.gz'))),
  manifest = JSON.parse(fs.readFileSync('dist/data/realtime-manifest.json'));
for (const spec of manifest.models) {
  const bytes = fs.readFileSync('dist/data/' + spec.circuit.file),
    data = JSON.parse(zlib.gunzipSync(bytes));
  test(`${spec.neurons}-node model preserves original driving cells, positions and every old edge`, () => {
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), spec.circuit.sha256);
    assert.equal(data.nodes.length, spec.neurons);
    assert.equal(data.targets.length, spec.edges);
    assert.equal(
      data.weights.reduce((a, v) => a + v, 0),
      spec.synapses,
    );
    assert.ok(data.nodes.every((n) => n.slice(4, 7).every(Number.isFinite)));
    const byID = new Map(data.nodes.map((n, i) => [n[0], i])),
      remap = small.nodes.map((n) => byID.get(n[0]));
    assert.ok(remap.every(Number.isInteger));
    for (const key of ['inputs', 'outputs'])
      for (let k = 0; k < 3; k++)
        assert.deepEqual(
          data[key][k].map((i) => data.nodes[i][0]),
          small[key][k].map((i) => small.nodes[i][0]),
        );
    for (let i = 0; i < small.nodes.length; i++) {
      const row = remap[i],
        edges = new Map();
      for (let e = data.offsets[row]; e < data.offsets[row + 1]; e++)
        edges.set(data.targets[e], data.weights[e]);
      for (let e = small.offsets[i]; e < small.offsets[i + 1]; e++)
        assert.equal(edges.get(remap[small.targets[e]]), small.weights[e]);
    }
  });
  test(`${spec.neurons}-node network drives safely and additional cells actually fire`, () => {
    const e = new DrivingExperiment(data),
      duration = spec.neurons === 8000 ? 360000 : 60000,
      old = new Set(small.nodes.map((n) => n[0]));
    for (let t = 0; t < duration; t += 10) e.step();
    assert.equal(e.collisions, 0);
    assert.ok(e.distance > 80);
    if (spec.neurons === 8000) assert.ok(e.laps >= 2);
    let outside = 0;
    for (let i = 0; i < data.nodes.length; i++)
      if (e.brain.net.fires[i] && !old.has(data.nodes[i][0])) outside++;
    assert.ok(outside > 100);
    const total = e.brain.net.total;
    e.configure({ connected: false });
    for (let t = 0; t < 400; t++) e.step();
    assert.equal(e.speed, 0);
    assert.ok(e.brain.net.total > total);
    e.reset();
    assert.equal(e.brain.net.total, 0);
    assert.equal(e.distance, 0);
  });
}
