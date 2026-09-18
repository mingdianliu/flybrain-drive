import fs from 'node:fs';
import zlib from 'node:zlib';
import { DrivingExperiment } from '../dist/drive-core.mjs';
const d = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(new URL('../dist/data/circuit.json.gz', import.meta.url))),
  ),
  e = new DrivingExperiment(d);
for (let i = 0; i < 36000; i++) {
  e.step();
  if (i % 2000 === 0)
    console.log(
      e.brain.net.time,
      e.distance.toFixed(1),
      e.speed.toFixed(2),
      e.waitReason,
      e.stopDistance.toFixed(2),
      e.collisions,
      e.laps,
    );
}
console.log('result', e.snapshot().distance, e.laps, e.collisions);
