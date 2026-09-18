import fs from 'node:fs';
import zlib from 'node:zlib';
import { DrivingExperiment } from '../dist/drive-core.mjs';
const results = [];
for (const count of [1860, 4000, 8000, 12000]) {
  const file =
    count === 1860
      ? 'dist/data/circuit.json.gz'
      : count === 12000
        ? `work/realtime-${count}.json.gz`
        : `dist/data/realtime-${count}.json.gz`;
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))),
    e = new DrivingExperiment(data),
    start = performance.now();
  for (let i = 0; i < 6000; i++) e.step();
  const wall = performance.now() - start,
    s = e.snapshot();
  const r = {
    neurons: count,
    edges: data.targets.length,
    simulatedMs: s.time,
    wallMs: wall,
    ratio: s.time / wall,
    distance: s.distance,
    collisions: s.collisions,
    spikes: s.total,
  };
  results.push(r);
  console.log(JSON.stringify(r));
}
fs.mkdirSync('work', { recursive: true });
fs.writeFileSync('work/realtime-benchmark.json', JSON.stringify(results, null, 2));
