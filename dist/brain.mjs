import * as T from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { ACTIVITY_WINDOWS, spikeActivity } from './activity.mjs';

export class BrainView {
  constructor(el, data, context) {
    this.el = el;
    this.windowMs = 120;
    this.scope = 'anatomy';
    this.time = 0;
    this.last = null;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 1, 0.03, 30);
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 9;
    const coords = context.filter((p) => p.every(Number.isFinite));
    this.contextCount = coords.length;
    const rawBounds = new T.Box3().setFromPoints(coords.map((p) => new T.Vector3(...p)));
    const mid = rawBounds.getCenter(new T.Vector3()),
      size = rawBounds.getSize(new T.Vector3());
    const scale = 2.45 / Math.max(size.x, size.y, size.z);
    const xyz = (p) => [(p[0] - mid.x) * scale, -(p[1] - mid.y) * scale, -(p[2] - mid.z) * scale];
    const referenceGeometry = new T.BufferGeometry();
    referenceGeometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(coords.flatMap(xyz), 3),
    );
    this.reference = new T.Points(
      referenceGeometry,
      new T.PointsMaterial({
        color: 0x547689,
        size: 0.009,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );
    this.scene.add(this.reference);
    referenceGeometry.computeBoundingBox();
    const pos = data.nodes.flatMap((n) => xyz(n.slice(4, 7))),
      geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.computeBoundingBox();
    this.bounds = { circuit: geometry.boundingBox, anatomy: referenceGeometry.boundingBox };
    // Restore the original fine, colored points within the full brain silhouette.
    this.activity = new Float32Array(data.nodes.length);
    this.colors = new Float32Array(data.nodes.length * 3);
    geometry.setAttribute('color', new T.BufferAttribute(this.colors, 3));
    this.points = new T.Points(
      geometry,
      new T.PointsMaterial({
        size: 0.025,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.scene.add(this.points);
    this.bank = new Int8Array(data.nodes.length).fill(-1);
    data.inputs.forEach((indices, k) => indices.forEach((i) => (this.bank[i] = k)));
    this.palette = [
      [0.3, 0.73, 1],
      [0.85, 1, 0.38],
      [1, 0.45, 0.2],
    ];
    // Sampling applies only to the decorative lines, never to neural dynamics.
    let strong = 0;
    for (const w of data.weights) if (w >= 40) strong++;
    const stride = Math.max(1, Math.ceil(strong / 4000)),
      edgePos = [];
    let candidate = 0;
    for (let i = 0; i < data.nodes.length; i++)
      for (let j = data.offsets[i]; j < data.offsets[i + 1]; j++)
        if (data.weights[j] >= 40 && candidate++ % stride === 0)
          edgePos.push(
            ...pos.slice(i * 3, i * 3 + 3),
            ...pos.slice(data.targets[j] * 3, data.targets[j] * 3 + 3),
          );
    const edges = new T.BufferGeometry();
    edges.setAttribute('position', new T.Float32BufferAttribute(edgePos, 3));
    this.scene.add(
      new T.LineSegments(
        edges,
        new T.LineBasicMaterial({
          color: 0x4c8aa1,
          transparent: true,
          opacity: 0.035,
          depthWrite: false,
        }),
      ),
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(el);
    this.resize();
    this.setScope('anatomy');
    this.update(null, 0);
  }
  resize() {
    const w = this.el.clientWidth,
      h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
  setScope(scope) {
    if (!['circuit', 'anatomy'].includes(scope)) throw Error('Invalid brain view');
    this.scope = scope;
    this.reference.visible = scope === 'anatomy';
    if (scope === 'anatomy') {
      this.controls.target.set(0, 0, 0);
      this.camera.position.set(0, 0, 4);
      this.controls.update();
      return;
    }
    const box = this.bounds[scope],
      center = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3());
    const tan = Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
    const distance =
      (Math.max(size.y / 2 / tan, size.x / 2 / tan / this.camera.aspect) + size.z / 2) * 1.12;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new T.Vector3(0, 0, distance));
    this.controls.update();
  }
  setWindow(ms) {
    if (!ACTIVITY_WINDOWS.includes(ms)) throw Error('Invalid activity window');
    this.windowMs = ms;
    return this.update(this.last, this.time);
  }
  update(last, time) {
    this.last = last;
    this.time = time;
    this.stats = spikeActivity(last, time, this.windowMs, this.activity);
    for (let i = 0; i < this.activity.length; i++) {
      const a = this.activity[i] > 0 ? Math.max(0, (this.activity[i] - 0.18) / 0.82) : 0,
        c = this.palette[this.bank[i]] || [0.78, 0.96, 0.63];
      for (let k = 0; k < 3; k++) this.colors[i * 3 + k] = 0.1 + c[k] * a;
    }
    this.points.geometry.attributes.color.needsUpdate = true;
    return this.stats;
  }
  getState() {
    return {
      scope: this.scope,
      windowMs: this.windowMs,
      active: this.stats.count,
      simulated: this.stats.total,
      percent: this.stats.percent,
      referencePoints: this.contextCount,
    };
  }
  dispose() {
    this.observer.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
