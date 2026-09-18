import * as T from './vendor/three.module.min.js';

export function prepareSteering(car) {
  const wheel = car.getObjectByName('steering_wheel');
  const rim = car.getObjectByName('steering_leather');
  if (!wheel || !rim?.geometry) throw Error('The vehicle has no articulated steering wheel');
  car.updateMatrixWorld(true);
  const neutral = wheel.quaternion.clone(),
    axis = new T.Vector3(0, 1, 0),
    turn = new T.Quaternion();
  const box = new T.Box3().setFromObject(rim),
    center = box.getCenter(new T.Vector3());
  const radius = box.getSize(new T.Vector3()).x / 2;
  // Choose actual vertices on the original rim, then parent the contact points
  // to that wheel. The forelegs and visible wheel therefore share one transform.
  const grips = [-1, 1].map((side) => {
    const ideal = new T.Vector3(
      center.x + side * radius * 0.82,
      center.y + radius * 0.43,
      box.max.z,
    );
    const positions = rim.geometry.attributes.position,
      vertex = new T.Vector3(),
      best = new T.Vector3();
    let score = Infinity;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(rim.matrixWorld);
      const distance = vertex.distanceToSquared(ideal);
      if (distance < score) {
        score = distance;
        best.copy(vertex);
      }
    }
    const anchor = new T.Object3D();
    anchor.name = side < 0 ? 'left_foreleg_grip' : 'right_foreleg_grip';
    anchor.position.copy(wheel.worldToLocal(best));
    wheel.add(anchor);
    return anchor;
  });
  return {
    wheel,
    grips,
    update(steer) {
      const angle = T.MathUtils.clamp(steer * 6, -1.1, 1.1);
      // This imported wheel's spin axis is local Y, directed toward the windshield.
      wheel.quaternion.copy(neutral).multiply(turn.setFromAxisAngle(axis, -angle));
      wheel.updateWorldMatrix(true, true);
      return angle;
    },
  };
}
