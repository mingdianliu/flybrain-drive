import * as T from './vendor/three.module.min.js';
import { track, N, at, WIDTH, LANE, CROSSINGS, nearest } from './track.mjs';
export function buildStreet(scene) {
  const batches = new Map();
  const material = (color, opts = {}) =>
    new T.MeshStandardMaterial({ color, roughness: 0.82, ...opts });
  const stone = material(0xaaa9a1),
    curb = material(0xc6c4ba),
    white = material(0xe0ddd1),
    metal = material(0x4b575b, { metalness: 0.7, roughness: 0.35 }),
    dark = material(0x253036),
    glass = material(0x718f9b, { metalness: 0.55, roughness: 0.22 });
  const box = (w, h, d, x, y, z, mat, rotation = 0) => {
    const key = mat.uuid;
    let b = batches.get(key);
    if (!b) {
      b = { mat, items: [] };
      batches.set(key, b);
    }
    const o = new T.Object3D();
    o.position.set(x, y, z);
    o.rotation.y = rotation;
    o.scale.set(w, h, d);
    o.updateMatrix();
    b.items.push(o.matrix.clone());
  };
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = roadCanvas.height = 256;
  const ctx = roadCanvas.getContext('2d'),
    im = ctx.createImageData(256, 256);
  let rng = 932;
  for (let i = 0; i < im.data.length; i += 4) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const v = 73 + (rng % 25);
    im.data[i] = v;
    im.data[i + 1] = v + 2;
    im.data[i + 2] = v + 3;
    im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const tex = new T.CanvasTexture(roadCanvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(65, 65);
  tex.colorSpace = T.SRGBColorSpace;
  const asphalt = material(0x818b90, { map: tex, bumpMap: tex, bumpScale: 0.025 });
  const pos = [],
    uv = [];
  for (let i = 0; i < N; i++) {
    const a = at(i),
      b = at(i + 1),
      v = (p, s) => [
        p.x + p.nx * ((s * WIDTH) / 2 - LANE),
        0.025,
        p.z + p.nz * ((s * WIDTH) / 2 - LANE),
      ];
    const arr = [...v(a, -1), ...v(a, 1), ...v(b, 1), ...v(a, -1), ...v(b, 1), ...v(b, -1)];
    pos.push(...arr);
    for (let j = 0; j < arr.length; j += 3) uv.push(arr[j] / 180, arr[j + 2] / 180);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const mesh = new T.Mesh(g, asphalt);
  mesh.material.side = T.DoubleSide;
  mesh.receiveShadow = true;
  scene.add(mesh);
  // Cross streets connect the four signalized junctions through the central blocks.
  box(165, 0.04, 10, 0, 0.012, 0, asphalt);
  box(10, 0.04, 140, 0, 0.012, 0, asphalt);
  const isJunction = (p) => Math.abs(p.x - p.nx * LANE) < 6 || Math.abs(p.z - p.nz * LANE) < 6;
  for (let i = 0; i < N; i += 2) {
    const p = at(i),
      cx = p.x - p.nx * LANE,
      cz = p.z - p.nz * LANE,
      a = -Math.atan2(p.tz, p.tx);
    if (isJunction(p)) continue;
    for (const side of [-1, 1]) {
      box(1.25, 0.16, 3.8, cx + p.nx * side * 7.0, 0.05, cz + p.nz * side * 7.0, stone, a);
      box(1.25, 0.25, 0.21, cx + p.nx * side * 5.1, 0.09, cz + p.nz * side * 5.1, curb, a);
    }
    if (i % 8 === 0) box(1.1, 0.006, 0.11, cx, 0.051, cz, white, a);
  }
  for (const c of CROSSINGS) {
    const { p } = c,
      a = -Math.atan2(p.tz, p.tx);
    for (let k = -5; k <= 5; k++)
      box(
        2.8,
        0.01,
        0.44,
        p.x + p.nx * (k * 0.85 - LANE),
        0.054,
        p.z + p.nz * (k * 0.85 - LANE),
        white,
        a,
      );
    box(0.35, 0.012, 4.5, p.x - p.tx * 3.4, 0.06, p.z - p.tz * 3.4, white, a);
  }
  // Distinct facades: recessed windows, lintels, storefront glass, awnings and cornices.
  const colors = [0xa18167, 0xa5aaa2, 0xbcaf99, 0x976e5c, 0x6f8588, 0xc2b69b],
    buildingMats = colors.map((c) => material(c));
  function building(x, z, w, d, h, k) {
    const m = buildingMats[k % colors.length];
    box(w, h, d, x, h / 2, z, m);
    box(w + 0.42, 0.24, d + 0.42, x, h - 0.2, z, curb);
    box(w + 0.2, 0.18, d + 0.2, x, 3.4, z, curb);
    box(w - 1, 0.28, d - 1, x, h + 0.12, z, dark);
    for (let side = 0; side < 4; side++) {
      const along = side % 2 ? d : w,
        rot = (side * Math.PI) / 2;
      for (let level = 0; level < Math.floor((h - 3.5) / 2.7); level++)
        for (let n = 0; n < Math.floor(along / 2.4); n++) {
          const q = (n - (Math.floor(along / 2.4) - 1) / 2) * 2.4,
            xx =
              side === 0
                ? x + q
                : side === 2
                  ? x - q
                  : x + (side === 1 ? w / 2 + 0.015 : -w / 2 - 0.015),
            zz =
              side === 1
                ? z - q
                : side === 3
                  ? z + q
                  : z + (side === 0 ? d / 2 + 0.015 : -d / 2 - 0.015),
            yy = 4.6 + level * 2.7;
          box(1.4, 1.7, 0.15, xx, yy, zz, dark, rot);
          box(1.22, 1.5, 0.17, xx, yy, zz, glass, rot);
          box(1.6, 0.12, 0.38, xx, yy - 0.9, zz, curb, rot);
          box(0.045, 1.5, 0.19, xx, yy, zz, metal, rot);
        }
    }
    for (let n = 0; n < Math.floor(w / 3); n++) {
      const xx = x + (n - (Math.floor(w / 3) - 1) / 2) * 3;
      box(2.4, 2.5, 0.12, xx, 1.4, z + d / 2 + 0.02, glass);
      box(2.6, 0.18, 1.1, xx, 2.95, z + d / 2 + 0.4, buildingMats[(k + 2) % 6]);
    }
    box(1.4, 2.7, 0.18, x, 1.4, z + d / 2 + 0.08, dark);
  }
  let k = 0;
  for (const z of [-51, 51])
    for (const x of [-51, -34, -18, 18, 34, 51]) building(x, z, 13, 13, 10 + (k % 4) * 3, k++);
  for (const x of [-66, 66])
    for (const z of [-28, -11, 11, 28]) building(x, z, 14, 12, 13 + (k % 3) * 3, k++);
  for (const x of [-25, 25])
    for (const z of [-17, 17]) building(x, z, 25, 17, 11 + (k % 3) * 3, k++);
  // Street furniture and tree canopies along sidewalks.
  const bark = material(0x62584a),
    leaf = material(0x617447);
  for (let i = 0; i < N; i += 38) {
    const p = at(i);
    if (isJunction(p)) continue;
    const x = p.x + p.nx * 5.4,
      z = p.z + p.nz * 5.4;
    box(0.12, 5, 0.12, x, 2.5, z, metal);
    box(1, 0.1, 0.35, x, 5, z, metal);
    const lamp = new T.Mesh(
      new T.BoxGeometry(0.7, 0.04, 0.25),
      new T.MeshStandardMaterial({ color: 0xffe9c1, emissive: 0xffe9c1, emissiveIntensity: 0.5 }),
    );
    lamp.position.set(x, 4.93, z);
    scene.add(lamp);
    const tx = p.x + p.nx * 5.5 + p.tx * 5,
      tz = p.z + p.nz * 5.5 + p.tz * 5;
    box(0.23, 2.5, 0.23, tx, 1.25, tz, bark);
    const tree = new T.Mesh(new T.SphereGeometry(1, 14, 10), leaf);
    tree.scale.set(1.35, 1.8, 1.35);
    tree.position.set(tx, 3.5, tz);
    tree.castShadow = true;
    scene.add(tree);
  }
  for (const { mat, items } of batches.values()) {
    const m = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, items.length);
    items.forEach((v, i) => m.setMatrixAt(i, v));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  const signals = CROSSINGS.map((c) => {
    const g = new T.Group(),
      pole = new T.Mesh(new T.CylinderGeometry(0.065, 0.09, 4.4, 12), metal);
    pole.position.y = 2.2;
    g.add(pole);
    const housing = new T.Mesh(new T.BoxGeometry(0.38, 1.14, 0.3), dark);
    housing.position.y = 3.95;
    g.add(housing);
    const lamps = ['red', 'yellow', 'green'].map((color, i) => {
      const m = new T.Mesh(
        new T.CircleGeometry(0.11, 24),
        new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0 }),
      );
      m.position.set(0, 4.32 - i * 0.36, 0.161);
      g.add(m);
      return m;
    });
    const p = c.p;
    g.position.set(p.x + p.nx * 3.8, p.y || 0, p.z + p.nz * 3.8);
    g.rotation.y = Math.atan2(-p.tx, -p.tz);
    scene.add(g);
    return lamps;
  });
  return {
    signals,
    update(s) {
      for (let i = 0; i < signals.length; i++) {
        const phase = s?.traffic?.signals[i]?.phase || 'red';
        signals[i].forEach((m, j) => {
          const on = ['red', 'yellow', 'green'][j] === phase;
          m.material.emissiveIntensity = on ? 2.6 : 0;
          m.material.color.set(on ? ['#ff3729', '#ffbb28', '#31e28b'][j] : '#1c2421');
        });
      }
    },
  };
}
