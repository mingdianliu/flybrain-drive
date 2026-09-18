import { addTrafficVehicles } from './traffic-vehicles.mjs';
import * as T from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { at, START } from './track.mjs';
import { buildStreet } from './street.mjs';
import { loadVehicle } from './vehicle.mjs';
import { addPedestrians } from './pedestrians.mjs';
export class RoadScene {
  constructor(el) {
    this.el = el;
    this.mode = 'driver';
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#c4d7e2');
    this.scene.fog = new T.Fog('#d0dce1', 110, 250);
    this.camera = new T.PerspectiveCamera(68, 1, 0.035, 350);
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    el.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.03;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 190;
    this.controls.enabled = false;
    this.scene.add(new T.HemisphereLight(0xd7eaff, 0x82745c, 2.0));
    const sun = new T.DirectionalLight(0xffebd1, 3.1);
    sun.position.set(-55, 85, -45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 80, bottom: -80, far: 220 });
    sun.shadow.bias = -0.00015;
    this.scene.add(sun);
    const ground = new T.Mesh(
      new T.PlaneGeometry(260, 230),
      new T.MeshStandardMaterial({ color: 0xa9aaa0, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.city = buildStreet(this.scene);
    this.obstacles = new T.Group();
    this.scene.add(this.obstacles);
    this.trail = new T.Line(
      new T.BufferGeometry(),
      new T.LineBasicMaterial({ color: 0x77cbd3, transparent: true, opacity: 0.65 }),
    );
    this.scene.add(this.trail);
    this.trail.visible = false;
    this.ready = loadVehicle(this.scene).then(async (v) => {
      this.vehicle = v;
      this.trafficVehicles = addTrafficVehicles(this.scene, v.trafficTemplate);
      this.cityTraffic = await addPedestrians(this.scene, v.loader);
      return v;
    });
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const p = at(START);
    this.camera.position.set(p.x, 1.2, p.z);
    this.camera.lookAt(p.x + p.tx * 20, 1.1, p.z + p.tz * 20);
  }
  resize() {
    const w = this.el.clientWidth,
      h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
  update(s, running = false) {
    if (s) {
      this.city.update(s);
      this.vehicle?.update(s, this.mode, running);
      if (['driver', 'passenger'].includes(this.mode))
        this.vehicle?.cameraPose(s, this.mode, this.camera);
      this.cityTraffic?.update(s);
      this.trafficVehicles?.update(s);
    }
    if (!['driver', 'passenger'].includes(this.mode)) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  // A cabin near plane loses depth precision across the city, making road surfaces flicker.
  setMode(mode) {
    this.mode = mode;
    const inside = ['driver', 'passenger'].includes(mode);
    this.controls.enabled = !inside;
    this.camera.near = inside ? 0.035 : 1;
    this.camera.fov = mode === 'passenger' ? 72 : mode === 'driver' ? 72 : 43;
    this.camera.updateProjectionMatrix();
    this.trail.visible = !inside;
    if (mode === 'overview') {
      this.camera.position.set(92, 78, 100);
      this.controls.target.set(0, 0, 0);
    }
    if (mode === 'top') {
      this.camera.position.set(0, 160, 0.1);
      this.controls.target.set(0, 0, 0);
    }
    if (!inside) this.controls.update();
  }
  setObstacles(obs) {
    const key = JSON.stringify(obs);
    if (key === this.obsKey) return;
    this.obsKey = key;
    while (this.obstacles.children.length) {
      const o = this.obstacles.children[0];
      this.obstacles.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    for (const p of obs) {
      const m = new T.Mesh(
        new T.CylinderGeometry(p.r * 0.4, p.r, 1.15, 24),
        new T.MeshStandardMaterial({ color: 0xe88639, roughness: 0.65 }),
      );
      m.position.set(p.x, 0.57, p.z);
      m.castShadow = true;
      this.obstacles.add(m);
      const band = new T.Mesh(
        new T.CylinderGeometry(p.r * 0.6, p.r * 0.67, 0.2, 24),
        new T.MeshStandardMaterial({ color: 0xeeebe2 }),
      );
      band.position.set(p.x, 0.67, p.z);
      this.obstacles.add(band);
    }
  }
  setTrail(points) {
    this.trail.geometry.dispose();
    this.trail.geometry = new T.BufferGeometry().setFromPoints(
      points.map((p) => new T.Vector3(p[0], 0.08, p[1])),
    );
  }
  ground(event) {
    const r = this.renderer.domElement.getBoundingClientRect(),
      ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const p = new T.Vector3();
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p)
      ? { x: p.x, z: p.z }
      : null;
  }
}
