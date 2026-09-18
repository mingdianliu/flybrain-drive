import { createForelegGrip } from './foreleg-grip.mjs';
import * as T from './vendor/three.module.min.js';
import { STLLoader } from './vendor/addons/loaders/STLLoader.js';
import { mergeVertices } from './vendor/addons/utils/BufferGeometryUtils.js';
export async function createAnatomicalDriver(parent, { grips, seatX = -0.346 }) {
  const model = await (await fetch('./assets/fly-model.json')).json(),
    loader = new STLLoader(),
    cache = new Map();
  await Promise.all(
    [...new Set(Object.values(model.meshes).map((m) => m.file))].map(async (file) => {
      let g = await loader.loadAsync('./assets/fly/' + file);
      g.scale(model.meshScale, model.meshScale, model.meshScale);
      g.deleteAttribute('normal');
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
      cache.set(file, g);
    }),
  );
  const display = new T.Group(),
    tilt = new T.Group(),
    rig = new T.Group();
  display.add(tilt);
  tilt.add(rig);
  parent.add(display);
  rig.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(
      new T.Vector3(0, 0, -1),
      new T.Vector3(-1, 0, 0),
      new T.Vector3(0, 1, 0),
    ),
  );
  tilt.rotation.x = 0.48;
  display.scale.setScalar(0.4);
  const joints = {},
    meshes = {},
    parentOf = Object.fromEntries(model.joints.map(([a, b]) => [b, a]));
  const skin = new T.MeshPhysicalMaterial({
    color: 0xa57a3f,
    roughness: 0.54,
    clearcoat: 0.23,
    clearcoatRoughness: 0.5,
  });
  const eyes = new T.MeshPhysicalMaterial({
    color: 0x8e241b,
    roughness: 0.3,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
  });
  const wings = new T.MeshPhysicalMaterial({
    color: 0xdce8e4,
    transparent: true,
    opacity: 0.31,
    roughness: 0.23,
    metalness: 0.12,
    iridescence: 0.5,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const bristle = new T.MeshStandardMaterial({ color: 0x463626, roughness: 0.65 });
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8d8d8d';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 1;
  for (let y = 0; y < 140; y += 10)
    for (let x = -10; x < 140; x += 12) {
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2,
          xx = x + ((y / 10) % 2) * 6 + 6 * Math.cos(a),
          yy = y + 6 * Math.sin(a);
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.closePath();
      ctx.stroke();
    }
  const bump = new T.CanvasTexture(c);
  bump.wrapS = bump.wrapT = T.RepeatWrapping;
  bump.repeat.set(4, 4);
  for (const name of model.segments) {
    const group = new T.Group(),
      r = model.rest[name];
    if (name !== model.root) group.position.fromArray(r.pos);
    group.quaternion.set(r.quat[1], r.quat[2], r.quat[3], r.quat[0]).normalize();
    const from = parentOf[name];
    for (const axis of model.axisOrder) {
      const deg = model.neutralDeg[`${from}-${name}-${axis}`] || 0;
      group.quaternion.multiply(
        new T.Quaternion().setFromAxisAngle(
          new T.Vector3(...model.axisVector[axis]),
          (deg * Math.PI) / 180,
        ),
      );
    }
    joints[name] = group;
    (from ? joints[from] : rig).add(group);
    const desc = model.meshes[name];
    let geometry = cache.get(desc.file).clone();
    if (desc.mirror) {
      geometry.scale(1, -1, 1);
      const idx = geometry.index;
      if (idx)
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i);
          idx.setX(i, idx.getX(i + 1));
          idx.setX(i + 1, a);
        }
      geometry.computeVertexNormals();
    }
    const material = name.includes('eye')
      ? eyes.clone()
      : name.includes('wing')
        ? wings
        : name.includes('arista')
          ? bristle
          : skin.clone();
    if (name.includes('eye')) {
      const pos = geometry.attributes.position,
        uv = [];
      geometry.computeBoundingBox();
      const center = geometry.boundingBox.getCenter(new T.Vector3());
      for (let i = 0; i < pos.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(pos, i).sub(center).normalize();
        uv.push(
          Math.atan2(v.z, v.x) / (Math.PI * 2) + 0.5,
          Math.acos(T.MathUtils.clamp(v.y, -1, 1)) / Math.PI,
        );
      }
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      material.bumpMap = bump;
      material.bumpScale = 0.005;
    } else if (name.includes('abdomen'))
      material.color.set(name === 'c_abdomen6' ? 0x47311d : 0x9c743d);
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = !name.includes('wing');
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes[name] = mesh;
  }
  display.updateMatrixWorld(true);
  const eyeCenter = new T.Box3()
    .setFromObject(joints.l_eye)
    .getCenter(new T.Vector3())
    .add(new T.Box3().setFromObject(joints.r_eye).getCenter(new T.Vector3()))
    .multiplyScalar(0.5);
  display.position.set(seatX - eyeCenter.x, 1.04 - eyeCenter.y, 0.02 - eyeCenter.z);
  display.updateMatrixWorld(true);
  // Hair follows actual reconstructed thorax/head surfaces rather than a sphere proxy.
  for (const name of ['c_thorax', 'c_head']) {
    const mesh = meshes[name],
      p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal,
      a = [];
    for (let i = 0; i < p.count; i += 6) {
      const v = new T.Vector3().fromBufferAttribute(p, i),
        nn = new T.Vector3().fromBufferAttribute(n, i);
      a.push(
        ...v.toArray(),
        ...v
          .clone()
          .addScaledVector(nn, 0.035 + (i % 7) * 0.006)
          .toArray(),
      );
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(a, 3));
    mesh.add(
      new T.LineSegments(
        g,
        new T.LineBasicMaterial({ color: 0x4d3d27, transparent: true, opacity: 0.75 }),
      ),
    );
  }
  const grasp = createForelegGrip(display, grips, joints, meshes);
  let previousTime = null;
  return {
    update(steer, view, time = 0) {
      for (const [name, mesh] of Object.entries(meshes))
        mesh.visible = view !== 'driver' || name.startsWith('lf_') || name.startsWith('rf_');
      grasp.update(previousTime !== null && time < previousTime);
      previousTime = time;
    },
    getGripErrors: () => grasp.getErrors(),
    group: display,
  };
}
