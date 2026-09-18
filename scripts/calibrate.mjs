import fs from 'node:fs';
import zlib from 'node:zlib';
import { NeuralCircuit } from '../dist/neural.mjs';
const d = JSON.parse(
  zlib.gunzipSync(fs.readFileSync(new URL('../dist/data/circuit.json.gz', import.meta.url))),
);
for (let k = 0; k < 3; k++)
  for (const hz of [0, 20, 50, 100, 150, 200, 250]) {
    const n = new NeuralCircuit(d);
    let v;
    for (let i = 0; i < 30; i++)
      v = n.advance(
        10,
        [0, 0, 0].map((_, j) => (j === k ? hz : 0)),
      );
    console.log(
      k,
      hz,
      v.map((x) => +x.toFixed(2)),
      n.net.total,
    );
  }
