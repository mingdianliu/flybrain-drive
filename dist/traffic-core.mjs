import { CROSSINGS, at, N, length, LANE } from './track.mjs';
// Interpolate pedestrian positions between road samples; rounding created visible
// stationary frames followed by jumps of nearly half a metre.
function sidewalkPoint(index) {
  const i = Math.floor(index),
    f = index - i,
    a = at(i),
    b = at(i + 1),
    tx = a.tx + (b.tx - a.tx) * f,
    tz = a.tz + (b.tz - a.tz) * f,
    n = Math.hypot(tx, tz);
  return {
    x: a.x + (b.x - a.x) * f,
    z: a.z + (b.z - a.z) * f,
    tx: tx / n,
    tz: tz / n,
    nx: -tz / n,
    nz: tx / n,
  };
}
export function trafficAt(time, mode = 'auto', pedestriansEnabled = true) {
  const t = time / 1000,
    signals = CROSSINGS.map((c) => {
      const phase = (t + c.offset) % 44;
      return {
        id: c.id,
        phase: mode === 'auto' ? (phase < 18 ? 'red' : phase < 40 ? 'green' : 'yellow') : mode,
        remaining: Math.ceil(phase < 18 ? 18 - phase : phase < 40 ? 40 - phase : 44 - phase),
        name: c.name,
      };
    }),
    pedestrians = [];
  if (pedestriansEnabled) {
    for (const c of CROSSINGS)
      for (let k = 0; k < 2; k++) {
        const phase = (t + c.offset) % 44,
          start = 2 + k * 1.5,
          duration = 11,
          progress = Math.max(0, Math.min(1, (phase - start) / duration)),
          direction = (k === 0 ? 1 : -1) * (Math.floor((t + c.offset) / 44) % 2 ? -1 : 1),
          lateral = (progress - 0.5) * 13 * direction - LANE,
          p = c.p;
        pedestrians.push({
          id: c.id * 2 + k,
          x: p.x + p.nx * lateral + p.tx * (k ? 0.55 : -0.55),
          z: p.z + p.nz * lateral + p.tz * (k ? 0.55 : -0.55),
          yaw: Math.atan2(p.nx * direction, p.nz * direction),
          walking: phase > start && phase < start + duration,
          crossing: progress > 0 && progress < 1,
        });
      }
    for (let k = 0; k < 12; k++) {
      const ix = ((k / 12) * N + ((t * 1.2) / length) * N) % N,
        p = sidewalkPoint(ix),
        side = k % 2 ? 1 : -1,
        offset = side * 7.15 - LANE;
      pedestrians.push({
        id: 8 + k,
        x: p.x + p.nx * offset,
        z: p.z + p.nz * offset,
        yaw: Math.atan2(p.tx, p.tz),
        walking: true,
        crossing: false,
      });
    }
  }
  return { signals, pedestrians };
}
