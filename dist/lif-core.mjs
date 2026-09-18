// Current-based point-neuron LIF. Parameters informed by Shiu et al. (2024).
// This is NOT a multicompartment or validated MaleCNS biophysical model.
export const PARAMS = Object.freeze({
  dt: 0.2,
  rest: -52,
  reset: -52,
  threshold: -45,
  tauMembrane: 20,
  tauSynapse: 5,
  refractory: 2.2,
  delay: 1.8,
  weight: 0.275,
  inputHz: 150,
});

export class LifNetwork {
  constructor({ offsets, targets, weights, signs }, params = {}) {
    this.p = { ...PARAMS, ...params };
    this.n = signs.length;
    if (
      offsets.length !== this.n + 1 ||
      offsets[this.n] !== targets.length ||
      targets.length !== weights.length
    )
      throw Error('Invalid CSR graph');
    for (let i = 0; i < this.n; i++)
      if (offsets[i] > offsets[i + 1]) throw Error('Invalid CSR offsets');
    for (let i = 0; i < targets.length; i++)
      if (targets[i] >= this.n || weights[i] <= 0) throw Error('Invalid edge');
    this.offsets = offsets;
    this.targets = targets;
    this.weights = weights;
    this.signs = signs;
    this.v = new Float64Array(this.n);
    this.g = new Float64Array(this.n);
    this.until = new Float64Array(this.n);
    this.last = new Float32Array(this.n);
    this.fires = new Uint32Array(this.n);
    this.awake = new Uint8Array(this.n);
    this.active = new Uint32Array(this.n);
    this.activeCount = 0;
    this.delaySteps = Math.max(1, Math.round(this.p.delay / this.p.dt));
    this.queue = Array.from({ length: this.delaySteps }, () => []);
    this.em = Math.exp(-this.p.dt / this.p.tauMembrane);
    this.es = Math.exp(-this.p.dt / this.p.tauSynapse);
    this.coupling =
      (this.p.tauSynapse / (this.p.tauSynapse - this.p.tauMembrane)) * (this.es - this.em);
    this.reset();
  }
  reset(seed = 123456789) {
    this.v.fill(this.p.rest);
    this.g.fill(0);
    this.until.fill(0);
    this.last.fill(-1e9);
    this.fires.fill(0);
    this.awake.fill(0);
    this.activeCount = 0;
    this.tick = 0;
    this.total = 0;
    this.rng = seed >>> 0;
    this.seeds = [];
    this.stimUntil = 0;
    this.continuous = false;
    this.queue.forEach((q) => (q.length = 0));
  }
  get time() {
    return this.tick * this.p.dt;
  }
  random() {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }
  wake(i) {
    if (!this.awake[i]) {
      this.awake[i] = 1;
      this.active[this.activeCount++] = i;
    }
  }
  stimulate(indices, { duration = 500, hz = 150, continuous = false } = {}) {
    this.seeds = Array.from(indices);
    this.stimUntil = this.time + duration;
    this.hz = hz;
    this.continuous = continuous;
    for (const i of this.seeds)
      if (!Number.isInteger(i) || i < 0 || i >= this.n) throw Error('Invalid stimulus neuron');
  }
  stopInput() {
    this.seeds = [];
    this.continuous = false;
    this.stimUntil = this.time;
  }
  inject(i, amplitude) {
    this.v[i] += amplitude;
    this.wake(i);
  }
  step() {
    const time = this.time,
      slot = this.tick % this.delaySteps,
      pending = this.queue[slot];
    for (let k = 0; k < pending.length; k++) {
      const s = pending[k],
        sign = this.signs[s];
      if (sign === 0) continue;
      const gain = sign * this.p.weight;
      for (let e = this.offsets[s]; e < this.offsets[s + 1]; e++) {
        const t = this.targets[e];
        this.g[t] += this.weights[e] * gain;
        this.wake(t);
      }
    }
    pending.length = 0;
    if (this.continuous || time < this.stimUntil) {
      const chance = 1 - Math.exp((-this.hz * this.p.dt) / 1000);
      for (const i of this.seeds)
        if (this.random() < chance && time >= this.until[i]) this.inject(i, this.p.weight * 250);
    }
    const spikes = [];
    let retained = 0;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k];
      if (time + 1e-8 >= this.until[i]) {
        // Exact subthreshold solution over dt for exponential synaptic current.
        this.v[i] = this.p.rest + (this.v[i] - this.p.rest) * this.em + this.g[i] * this.coupling;
        this.g[i] *= this.es;
        if (this.v[i] > this.p.threshold) {
          this.v[i] = this.p.reset;
          this.g[i] = 0;
          this.until[i] = time + this.p.refractory;
          this.last[i] = time;
          this.fires[i]++;
          this.total++;
          spikes.push(i);
          pending.push(i);
        }
      }
      if (!Number.isFinite(this.v[i]) || !Number.isFinite(this.g[i]))
        throw Error('Non-finite membrane state');
      // Sleeping is a numerical optimization: all graph nodes/edges remain present.
      if (
        Math.abs(this.v[i] - this.p.rest) < 1e-8 &&
        Math.abs(this.g[i]) < 1e-8 &&
        time >= this.until[i]
      ) {
        this.v[i] = this.p.rest;
        this.g[i] = 0;
        this.awake[i] = 0;
      } else this.active[retained++] = i;
    }
    this.activeCount = retained;
    this.tick++;
    return spikes;
  }
}
