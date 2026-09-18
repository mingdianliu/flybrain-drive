export const WIDTH = 10,
  N = 640,
  LANE = 2.15;
// A city-block loop: straight streets linked by 10 m corner radii.
const R = 12,
  X = 48,
  Z = 34,
  segments = [
    { len: 2 * (X - R), p: (d) => ({ x: -X + R + d, z: -Z, tx: 1, tz: 0 }) },
    {
      len: (Math.PI * R) / 2,
      p: (d) => {
        const a = -Math.PI / 2 + d / R;
        return {
          x: X - R + R * Math.cos(a),
          z: -Z + R + R * Math.sin(a),
          tx: -Math.sin(a),
          tz: Math.cos(a),
        };
      },
    },
    { len: 2 * (Z - R), p: (d) => ({ x: X, z: -Z + R + d, tx: 0, tz: 1 }) },
    {
      len: (Math.PI * R) / 2,
      p: (d) => {
        const a = d / R;
        return {
          x: X - R + R * Math.cos(a),
          z: Z - R + R * Math.sin(a),
          tx: -Math.sin(a),
          tz: Math.cos(a),
        };
      },
    },
    { len: 2 * (X - R), p: (d) => ({ x: X - R - d, z: Z, tx: -1, tz: 0 }) },
    {
      len: (Math.PI * R) / 2,
      p: (d) => {
        const a = Math.PI / 2 + d / R;
        return {
          x: -X + R + R * Math.cos(a),
          z: Z - R + R * Math.sin(a),
          tx: -Math.sin(a),
          tz: Math.cos(a),
        };
      },
    },
    { len: 2 * (Z - R), p: (d) => ({ x: -X, z: Z - R - d, tx: 0, tz: -1 }) },
    {
      len: (Math.PI * R) / 2,
      p: (d) => {
        const a = Math.PI + d / R;
        return {
          x: -X + R + R * Math.cos(a),
          z: -Z + R + R * Math.sin(a),
          tx: -Math.sin(a),
          tz: Math.cos(a),
        };
      },
    },
  ];
const total = segments.reduce((a, s) => a + s.len, 0);
export const track = Array.from({ length: N }, (_, i) => {
  let d = (i / N) * total,
    p;
  for (const s of segments) {
    if (d <= s.len) {
      p = s.p(d);
      break;
    }
    d -= s.len;
  }
  const nx = -p.tz,
    nz = p.tx;
  return { ...p, x: p.x + nx * LANE, z: p.z + nz * LANE, nx, nz };
});
export const length = track.reduce(
  (v, p, i) => v + Math.hypot(p.x - track[(i + 1) % N].x, p.z - track[(i + 1) % N].z),
  0,
);
export const at = (i) => track[((Math.round(i) % N) + N) % N];
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function nearest(x, z) {
  let best = Infinity,
    index = 0;
  for (let i = 0; i < N; i++) {
    const p = track[i],
      d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < best) {
      best = d;
      index = i;
    }
  }
  const p = track[index];
  return { index, p, distance: Math.sqrt(best), offset: (x - p.x) * p.nx + (z - p.z) * p.nz };
}
export const START = nearest(-27, -Z + LANE).index;
export const CROSSINGS = [
  nearest(-8, -Z + LANE).index,
  nearest(X - LANE, -8).index,
  nearest(8, Z - LANE).index,
  nearest(-X + LANE, 8).index,
].map((index, id) => ({
  id,
  index,
  p: at(index),
  offset: id * 6,
  name: ['榆树街', '花园大道', '市集街', '图书馆路'][id],
}));
export function onRoad(x, z, margin = 0) {
  const n = nearest(x, z);
  return (
    n.offset > -WIDTH / 2 - LANE + margin &&
    n.offset < WIDTH / 2 - LANE - margin &&
    n.distance < WIDTH
  );
}
