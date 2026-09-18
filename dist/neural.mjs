import { LifNetwork } from './lif-core.mjs';
export class NeuralCircuit {
  constructor(data) {
    this.data = data;
    this.net = new LifNetwork({
      offsets: data.offsets instanceof Uint32Array ? data.offsets : Uint32Array.from(data.offsets),
      targets: data.targets instanceof Uint32Array ? data.targets : Uint32Array.from(data.targets),
      weights: ArrayBuffer.isView(data.weights) ? data.weights : Uint16Array.from(data.weights),
      signs: data.signs instanceof Int8Array ? data.signs : Int8Array.from(data.signs),
    });
    this.outputBank = new Int8Array(data.nodes.length).fill(-1);
    data.outputs.forEach((a, k) => a.forEach((i) => (this.outputBank[i] = k)));
    this.reset();
  }
  reset() {
    this.net.reset(8102026);
    this.rates = [0, 0, 0];
    this.counts = [0, 0, 0];
    this.phase = this.data.inputs.map((a) => Float64Array.from(a, (_, j) => j / a.length));
  }
  advance(ms, drive) {
    const steps = Math.round(ms / this.net.p.dt),
      decay = Math.exp(-ms / 65);
    this.counts.fill(0);
    for (let s = 0; s < steps; s++) {
      this.data.inputs.forEach((bank, k) => {
        const hz = drive[k];
        for (let j = 0; j < bank.length; j++) {
          this.phase[k][j] += (hz * this.net.p.dt) / 1000;
          if (this.phase[k][j] >= 1) {
            this.phase[k][j] -= 1;
            const i = bank[j];
            if (this.net.time >= this.net.until[i]) this.net.inject(i, 70);
          }
        }
      });
      for (const i of this.net.step()) {
        const k = this.outputBank[i];
        if (k >= 0) this.counts[k]++;
      }
    }
    this.rates = this.rates.map(
      (v, k) =>
        v * decay + ((((1 - decay) * this.counts[k]) / this.data.outputs[k].length) * 1000) / ms,
    );
    return this.rates;
  }
}
