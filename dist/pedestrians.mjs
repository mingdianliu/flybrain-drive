import * as T from './vendor/three.module.min.js';
import { clone } from './vendor/addons/utils/SkeletonUtils.js';

export const PEDESTRIAN_MODELS = ['woman-casual', 'man-hoodie', 'woman-formal', 'man-casual'];
// Quaternius's Walk clip faces local +Z: its planted foot travels toward -Z.
// World heading belongs to a parent group, outside the animated skeleton.
export function createPedestrian(gltf, id = 0) {
  const model = clone(gltf.scene),
    heading = new T.Group();
  heading.add(model);
  const bounds = new T.Box3().setFromObject(model),
    height = [1.68, 1.79, 1.72, 1.76][id % 4],
    scale = height / bounds.getSize(new T.Vector3()).y;
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const mixer = new T.AnimationMixer(model),
    walk = gltf.animations.find((a) => a.name === 'Walk'),
    idle = gltf.animations.find((a) => a.name === 'Idle');
  if (!walk || !idle) throw Error('Civilian model is missing its walk or idle animation');
  const walking = mixer.clipAction(walk),
    standing = mixer.clipAction(idle);
  walking.setEffectiveTimeScale(1.2 / (0.98 * scale)).play();
  standing.play();
  let previousTime = null,
    walkWeight = 1;
  return {
    model,
    heading,
    mixer,
    update(p, time) {
      const reset = previousTime === null || time < previousTime,
        dt = reset ? 0 : Math.max(0, (time - previousTime) / 1000);
      previousTime = time;
      const distance = Math.hypot(p.x - heading.position.x, p.z - heading.position.z);
      if (p.walking && dt > 0)
        walking.setEffectiveTimeScale(Math.max(0.1, Math.min(3, distance / dt / (0.98 * scale))));
      const target = p.walking ? 1 : 0;
      walkWeight = reset ? target : walkWeight + (target - walkWeight) * (1 - Math.exp(-dt / 0.15));
      heading.position.set(p.x, p.crossing ? 0.035 : 0.14, p.z);
      heading.rotation.y = p.yaw;
      walking.setEffectiveWeight(walkWeight);
      standing.setEffectiveWeight(1 - walkWeight);
      if (reset) mixer.setTime(time / 1000 + (id % 5) * 0.31);
      else mixer.update(dt);
      heading.updateMatrixWorld(true);
    },
  };
}

export async function addPedestrians(scene, loader) {
  const sources = await Promise.all(
      PEDESTRIAN_MODELS.map((name) => loader.loadAsync('./assets/pedestrians/' + name + '.glb')),
    ),
    people = new Map();
  for (const gltf of sources)
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.material.roughness = Math.max(0.65, o.material.roughness);
        o.material.metalness = 0;
      }
    });
  return {
    update(s) {
      const visible = new Set();
      for (const p of s.traffic?.pedestrians || []) {
        let actor = people.get(p.id);
        if (!actor) {
          actor = createPedestrian(sources[p.id % sources.length], p.id);
          people.set(p.id, actor);
          scene.add(actor.heading);
        }
        visible.add(p.id);
        actor.heading.visible = true;
        actor.update(p, s.time);
      }
      for (const [id, a] of people) if (!visible.has(id)) a.heading.visible = false;
    },
  };
}
