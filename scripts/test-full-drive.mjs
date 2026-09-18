import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { loadFullModel } from './full-model.mjs';
import { DrivingExperiment } from '../dist/drive-core.mjs';
const root = new URL('../work/full-model/', import.meta.url),
  manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root))),
  read = async (file) => new Uint8Array(await fs.readFile(new URL(file, root)));
const full = await loadFullModel(manifest, read),
  small = JSON.parse(
    zlib.gunzipSync(await fs.readFile(new URL('../dist/data/circuit.json.gz', import.meta.url))),
  );
test('full graph preserves every classified node and connection, including neurons without positions', () => {
  assert.equal(full.nodes.length, 166606);
  assert.equal(full.targets.length, 25574615);
  assert.equal(full.offsets.at(-1), 25574615);
  assert.equal(full.nodes.filter((n) => n.slice(4, 7).every(Number.isFinite)).length, 139659);
  const byID = new Map(full.nodes.map((n, i) => [n[0], i]));
  assert.equal(byID.size, full.nodes.length);
  const indices = small.nodes.map((n) => byID.get(n[0]));
  assert.ok(indices.every(Number.isInteger));
  for (let k = 0; k < 3; k++)
    for (const key of ['inputs', 'outputs'])
      assert.deepEqual(
        full[key][k].map((i) => full.nodes[i][0]),
        small[key][k].map((i) => small.nodes[i][0]),
      );
  for (let i = 0; i < small.nodes.length; i++) {
    const row = indices[i],
      edges = new Map();
    for (let j = full.offsets[row]; j < full.offsets[row + 1]; j++)
      edges.set(full.targets[j], full.weights[j]);
    for (let j = small.offsets[i]; j < small.offsets[i + 1]; j++)
      assert.equal(edges.get(indices[small.targets[j]]), small.weights[j]);
  }
});
test('driving stimuli propagate beyond the former subgraph; reset clears the entire network', () => {
  const e = new DrivingExperiment(full),
    old = new Set(small.nodes.map((n) => n[0]));
  for (let t = 0; t < 100; t++) e.step();
  let outside = 0;
  for (let i = 0; i < full.nodes.length; i++)
    if (e.brain.net.fires[i] && !old.has(full.nodes[i][0])) outside++;
  assert.ok(outside > 100);
  assert.ok(e.distance > 0);
  assert.equal(e.collisions, 0);
  assert.equal(e.brain.net.n, 166606);
  assert.equal(e.brain.net.targets.length, 25574615);
  assert.equal(e.brain.net.targets, full.targets, 'retain one full graph allocation');
  e.reset();
  assert.equal(e.brain.net.total, 0);
  assert.equal(
    e.brain.net.fires.reduce((s, v) => s + v, 0),
    0,
  );
  assert.ok(e.brain.net.last.every((t) => t < 0));
});
test('silencing every full-graph synapse removes the downstream motor signal', () => {
  const e = new DrivingExperiment({ ...full, signs: new Int8Array(full.nodes.length) });
  for (let t = 0; t < 30; t++) e.step();
  assert.ok(e.brain.net.total > 0);
  assert.deepEqual(e.rates, [0, 0, 0]);
  assert.equal(e.distance, 0);
});
test('corrupted full-model downloads fail verification instead of falling back silently', async () => {
  await assert.rejects(
    loadFullModel(manifest, async (file) => {
      const bytes = await read(file);
      bytes[0] ^= 1;
      return bytes;
    }),
    /校验失败/,
  );
});
