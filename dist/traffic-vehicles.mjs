import * as T from './vendor/three.module.min.js';
const COLORS = [0xd5c8ac, 0x28788c, 0x324b9a, 0xc58b25];
export function addTrafficVehicles(scene, template) {
  const actors = new Map();
  return {
    update(state) {
      const present = new Set();
      for (const car of state.traffic?.vehicles || []) {
        let actor = actors.get(car.id);
        if (!actor) {
          const root = new T.Group(),
            model = template.clone(true);
          root.add(model);
          scene.add(root);
          const body = model.getObjectByName('body');
          body.material = body.material.clone();
          body.material.color.setHex(COLORS[car.id % COLORS.length]);
          actor = {
            root,
            wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) =>
              model.getObjectByName(n),
            ),
          };
          actors.set(car.id, actor);
        }
        present.add(car.id);
        actor.root.visible = true;
        actor.root.position.set(car.x, 0.05, car.z);
        actor.root.rotation.y = -car.yaw - Math.PI / 2;
        actor.wheels.forEach((wheel, i) => {
          wheel.rotation.set(-Math.PI / 2 - car.distance / 0.355, 0, 0);
          if (i < 2)
            wheel.quaternion.premultiply(
              new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), car.steer),
            );
        });
      }
      for (const [id, actor] of actors) if (!present.has(id)) actor.root.visible = false;
    },
  };
}
