import * as T from './vendor/three.module.min.js';

export function createForelegGrip(display, grips, joints, meshes) {
  const arms = ['lf', 'rf'].map((prefix, k) => {
    const tip = new T.Object3D(),
      positions = meshes[prefix + '_tarsus5'].geometry.attributes.position,
      p = new T.Vector3();
    let farthest = -1;
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i);
      if (p.lengthSq() > farthest) {
        farthest = p.lengthSq();
        tip.position.copy(p);
      }
    }
    joints[prefix + '_tarsus5'].add(tip);
    const chain = ['coxa', 'trochanterfemur', 'tibia', 'tarsus1'].map(
      (s) => joints[prefix + '_' + s],
    );
    return {
      grip: grips[k],
      end: tip,
      chain,
      neutral: chain.map((j) => j.quaternion.clone()),
      target: null,
    };
  });
  const pos = new T.Vector3(),
    end = new T.Vector3(),
    a = new T.Vector3(),
    b = new T.Vector3(),
    axis = new T.Vector3();
  const rotation = new T.Quaternion(),
    parent = new T.Quaternion(),
    local = new T.Quaternion();
  const tolerance = 0.00005; // 0.05 mm at the visible claw; stop once it is seated.
  function solve(arm, target) {
    for (let iter = 0; iter < 64; iter++) {
      if (arm.end.getWorldPosition(end).distanceToSquared(target) < tolerance * tolerance) break;
      for (let j = arm.chain.length - 1; j >= 0; j--) {
        const joint = arm.chain[j];
        joint.getWorldPosition(pos);
        arm.end.getWorldPosition(end);
        a.copy(end).sub(pos).normalize();
        b.copy(target).sub(pos).normalize();
        axis.crossVectors(a, b);
        if (axis.lengthSq() < 1e-14) continue;
        rotation.setFromAxisAngle(
          axis.normalize(),
          Math.min(0.2, Math.acos(T.MathUtils.clamp(a.dot(b), -1, 1))),
        );
        joint.parent.getWorldQuaternion(parent);
        local.copy(parent).invert().multiply(rotation).multiply(parent);
        joint.quaternion.premultiply(local).normalize();
      }
    }
  }
  return {
    update(reset = false) {
      for (const arm of arms) {
        if (reset) {
          arm.chain.forEach((j, i) => j.quaternion.copy(arm.neutral[i]));
          arm.target = null;
        }
        const world = arm.grip.getWorldPosition(new T.Vector3());
        // Compare in the fly's frame: moving/turning the whole car must not make
        // the limbs find a different solution to an unchanged grip.
        const target = display.worldToLocal(world.clone());
        if (arm.target && target.distanceToSquared(arm.target) < 1e-14) continue;
        solve(arm, world);
        arm.target = target;
      }
    },
    getErrors() {
      return arms.map((arm) =>
        arm.end
          .getWorldPosition(new T.Vector3())
          .distanceTo(arm.grip.getWorldPosition(new T.Vector3())),
      );
    },
  };
}
