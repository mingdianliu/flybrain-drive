import { SteeringPlayback } from './steering-motion.mjs';
import { prepareSteering } from './steering.mjs';
import * as T from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/addons/loaders/DRACOLoader.js';
import { RGBELoader } from './vendor/addons/loaders/RGBELoader.js';
import { createAnatomicalDriver } from './anatomical-fly.mjs';
// Eye points use the car's local coordinates (forward is -Z). Keep both
// seats at z=0.10, ahead of the seat backs: z=0.95 is behind the cabin.
const CABIN_VIEWS = {
  driver: { eye: [-0.346, 1.07, 0.1], target: [-0.346, 1.05, -20] },
  passenger: { eye: [0.47, 1.04, 0.1], target: [-0.35, 0.91, -0.16] },
};
export async function loadVehicle(scene) {
  const decoder = new DRACOLoader().setDecoderPath(
      new URL('./vendor/draco/', import.meta.url).href,
    ),
    loader = new GLTFLoader().setDRACOLoader(decoder);
  const [gltf, hdr] = await Promise.all([
    loader.loadAsync('./assets/car.glb'),
    new RGBELoader().loadAsync('./assets/daylight.hdr'),
  ]);
  hdr.mapping = T.EquirectangularReflectionMapping;
  scene.environment = hdr;
  scene.environmentIntensity = 0.8;
  const root = new T.Group();
  root.name = 'vehicle';
  scene.add(root);
  const car = gltf.scene;
  root.add(car);
  const paint = new T.MeshPhysicalMaterial({
    color: 0x8d1723,
    metalness: 0.85,
    roughness: 0.27,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  car.getObjectByName('body').material = paint;
  car.getObjectByName('glass').material = new T.MeshPhysicalMaterial({
    color: 0xc5e3e9,
    metalness: 0.12,
    roughness: 0.08,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (const name of ['rim_fl', 'rim_fr', 'rim_rl', 'rim_rr', 'trim']) {
    const obj = car.getObjectByName(name);
    if (obj)
      obj.material = new T.MeshStandardMaterial({
        color: 0xc4c9ce,
        metalness: 0.96,
        roughness: 0.23,
      });
  }
  car.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material.map) o.material.map.anisotropy = 4;
    }
  });
  const steering = prepareSteering(car),
    playback = new SteeringPlayback();
  car.getObjectByName('steering_leather').material = new T.MeshStandardMaterial({
    color: 0x17191d,
    roughness: 0.72,
  });
  car.getObjectByName('steering_carbon').material = new T.MeshStandardMaterial({
    color: 0x292c30,
    metalness: 0.25,
    roughness: 0.4,
  });
  // An inset, high-resolution instrument display with actual model telemetry.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 400;
  const ctx = canvas.getContext('2d'),
    map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const screen = new T.Mesh(
    new T.PlaneGeometry(0.51, 0.2),
    new T.MeshBasicMaterial({ map, toneMapped: false }),
  );
  screen.position.set(-0.43, 0.86, -0.64);
  root.add(screen);
  const driver = await createAnatomicalDriver(root, {
      grips: steering.grips,
      seatX: steering.wheel.position.x,
    }),
    wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => car.getObjectByName(n));
  let lastTime = -1;
  return {
    root,
    loader,
    driver,
    trafficTemplate: car,
    update(s, view, running) {
      const visibleSteer = playback.sample(s.steer, s.time, performance.now(), running);
      root.position.set(s.x, 0.05, s.z);
      root.rotation.y = -s.yaw - Math.PI / 2;
      root.updateMatrixWorld(true);
      steering.update(visibleSteer);
      driver.update(visibleSteer, view, s.time);
      for (let i = 0; i < wheels.length; i++) {
        const w = wheels[i];
        w.rotation.set(-Math.PI / 2 - s.distance / 0.355, 0, 0);
        if (i < 2)
          w.quaternion.premultiply(
            new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), visibleSteer),
          );
      }
      if (s.time - lastTime > 90 || s.time === 0) {
        lastTime = s.time;
        ctx.fillStyle = '#071018';
        ctx.fillRect(0, 0, 1024, 400);
        ctx.strokeStyle = '#4b797f';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(300, 290, 215, Math.PI, 2 * Math.PI);
        ctx.stroke();
        ctx.strokeStyle = '#b4dbce';
        ctx.beginPath();
        ctx.arc(300, 290, 215, Math.PI, Math.PI + Math.min(1, (s.speed * 3.6) / 40) * Math.PI);
        ctx.stroke();
        ctx.fillStyle = '#e6f2ef';
        ctx.textAlign = 'center';
        ctx.font = '140px sans-serif';
        ctx.fillText((s.speed * 3.6).toFixed(0), 300, 290);
        ctx.font = '30px sans-serif';
        ctx.fillText('km/h', 300, 350);
        ctx.textAlign = 'left';
        ctx.font = '36px sans-serif';
        ctx.fillText('D   /   NEURAL', 600, 125);
        ctx.font = '26px sans-serif';
        ctx.fillStyle = '#8aa5ad';
        ctx.fillText(s.waitReason ? 'WAIT · CROSSING' : 'CITY DRIVE', 600, 195);
        ctx.fillText(`GRIP  ${Math.round(s.config.grip * 100)}%`, 600, 255);
        map.needsUpdate = true;
      }
    },
    cameraPose(s, view, camera) {
      const pose = CABIN_VIEWS[view] || CABIN_VIEWS.driver;
      camera.position.copy(root.localToWorld(new T.Vector3(...pose.eye)));
      camera.lookAt(root.localToWorld(new T.Vector3(...pose.target)));
    },
  };
}
