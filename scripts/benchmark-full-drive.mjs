import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadFullModel } from './full-model.mjs';
import { DrivingExperiment } from '../dist/drive-core.mjs';
const root = new URL('../work/full-model/', import.meta.url),
  manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root)));
const start = performance.now(),
  data = await loadFullModel(
    manifest,
    async (file) => new Uint8Array(await fs.readFile(new URL(file, root))),
  );
console.log(
  JSON.stringify({
    loaded: true,
    neurons: data.nodes.length,
    edges: data.targets.length,
    loadMs: performance.now() - start,
  }),
);
const e = new DrivingExperiment(data),
  results = [],
  inputSet = new Set(data.inputs.flat()),
  smallIDs = new Set(
    JSON.parse(
      (await import('node:zlib')).gunzipSync(
        await fs.readFile(new URL('../dist/data/circuit.json.gz', import.meta.url)),
      ),
    ).nodes.map((n) => n[0]),
  );
const duration = Number(process.argv[2] || 10000);
let wall = performance.now();
for (let i = 0; i < duration / 10; i++) {
  e.step();
  if (i % 100 === 99) {
    const s = e.snapshot();
    console.log(
      JSON.stringify({
        simMs: s.time,
        speed: s.speed,
        rates: s.rates,
        steer: s.steer,
        collisions: s.collisions,
        ratio: s.time / (performance.now() - wall),
      }),
    );
  }
}
const elapsed = performance.now() - wall,
  fires = e.brain.net.fires,
  s = e.snapshot();
let active = 0,
  outside = 0,
  downstream = 0;
for (let i = 0; i < fires.length; i++)
  if (fires[i]) {
    active++;
    if (!smallIDs.has(data.nodes[i][0])) outside++;
    if (!inputSet.has(i)) downstream++;
  }
const report = {
  neurons: data.nodes.length,
  edges: data.targets.length,
  synapses: manifest.synapses,
  simulatedMs: s.time,
  wallMs: elapsed,
  speedRatio: s.time / elapsed,
  totalSpikes: s.total,
  firingNeurons: active,
  outsideOriginalCircuit: outside,
  downstreamFiringNeurons: downstream,
  distanceM: s.distance,
  collisions: s.collisions,
  simulationArraysMB:
    Object.values(e.brain.net)
      .filter(ArrayBuffer.isView)
      .reduce((a, v) => a + v.byteLength, 0) / 1e6,
  rssMB: process.memoryUsage().rss / 1e6,
};
await fs.mkdir(new URL('../work/', import.meta.url), { recursive: true });
await fs.writeFile(
  new URL('../work/full-drive-benchmark.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
