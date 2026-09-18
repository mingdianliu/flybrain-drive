import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.min.js';
import { GLTFLoader } from '../dist/vendor/addons/loaders/GLTFLoader.js';
import { createPedestrian, PEDESTRIAN_MODELS } from '../dist/pedestrians.mjs';
import { trafficAt } from '../dist/traffic-core.mjs';
const models = await Promise.all(
  PEDESTRIAN_MODELS.map(async (name) => {
    const b = fs.readFileSync(
      new URL('../dist/assets/pedestrians/' + name + '.glb', import.meta.url),
    );
    return new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      '',
    );
  }),
);
test('all four civilian models have complete rigs and forward-walking clips', () => {
  for (const g of models) {
    assert.deepEqual(g.animations.map((a) => a.name).sort(), ['Idle', 'Walk']);
    const mixer = new T.AnimationMixer(g.scene);
    mixer.clipAction(g.animations.find((a) => a.name === 'Walk')).play();
    const foot = g.scene.getObjectByName('FootL') || g.scene.getObjectByName('Foot_L');
    assert.ok(foot, 'left foot bone exists');
    mixer.setTime(0.14);
    g.scene.updateMatrixWorld(true);
    const a = foot.getWorldPosition(new T.Vector3());
    mixer.setTime(0.42);
    g.scene.updateMatrixWorld(true);
    const b = foot.getWorldPosition(new T.Vector3());
    assert.ok(
      b.z < a.z - 0.15,
      'planted foot moves backward in model coordinates, so the model walks toward +Z',
    );
    assert.ok(Math.abs(b.y - a.y) < 0.03, 'comparison uses the grounded phase');
  }
});
test('walking direction matches path motion; animations cannot overwrite heading; pause freezes the skeleton', () => {
  const actor = createPedestrian(models[0], 0),
    a = trafficAt(4500).pedestrians,
    b = trafficAt(4510).pedestrians;
  for (let i = 0; i < a.length; i++)
    if (a[i].walking) {
      actor.update(a[i], 4500);
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(actor.heading.quaternion),
        delta = new T.Vector3(b[i].x - a[i].x, 0, b[i].z - a[i].z).normalize();
      assert.ok(fwd.dot(delta) > 0.98, 'faces movement direction');
      const pose = [];
      actor.model.traverse((o) => pose.push(...o.position.toArray(), ...o.quaternion.toArray()));
      actor.update(a[i], 4500);
      const paused = [];
      actor.model.traverse((o) => paused.push(...o.position.toArray(), ...o.quaternion.toArray()));
      assert.deepEqual(paused, pose);
    }
});
