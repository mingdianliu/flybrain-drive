import { DrivingExperiment } from './drive-core.mjs';
let experiment,
  running = false,
  lastWall = performance.now(),
  debt = 0,
  lastFrame = 0,
  error = false;
function frame(extra = {}) {
  const e = experiment;
  const last = e.brain.net.last.slice();
  postMessage({ kind: 'frame', state: e.snapshot(), running, last, trail: e.trail, ...extra }, [
    last.buffer,
  ]);
}
self.onmessage = ({ data: m }) => {
  try {
    if (m.kind === 'init') {
      experiment = new DrivingExperiment(m.data);
      frame({ ready: true });
    } else if (experiment) {
      if (m.kind === 'run') {
        running = m.value && !experiment.blocked;
        lastWall = performance.now();
        debt = 0;
      }
      if (m.kind === 'reset') {
        running = false;
        experiment.reset();
        debt = 0;
      }
      if (m.kind === 'configure') experiment.configure(m.values);
      if (m.kind === 'add') experiment.addObstacle(m.x, m.z);
      if (m.kind === 'clear') experiment.obstacles = [];
      if (m.kind === 'remove')
        experiment.obstacles = experiment.obstacles.filter((o) => o.id !== m.id);
      frame({ requestId: m.requestId });
    }
  } catch (e) {
    postMessage({ kind: 'error', message: e.message, requestId: m.requestId });
  }
};
function loop() {
  const now = performance.now(),
    elapsed = now - lastWall;
  lastWall = now;
  if (experiment && running && !error) {
    debt = Math.min(debt + elapsed, 150);
    const start = performance.now(),
      simStart = experiment.brain.net.time;
    try {
      while (debt >= 10 && performance.now() - start < 9) {
        experiment.step(10);
        debt -= 10;
        if (experiment.blocked) {
          running = false;
          break;
        }
      }
      if (now - lastFrame >= 50) {
        frame({ ratio: (experiment.brain.net.time - simStart) / Math.max(1, elapsed) });
        lastFrame = now;
      }
    } catch (e) {
      error = true;
      running = false;
      postMessage({ kind: 'error', message: e.message });
    }
  }
  setTimeout(loop, 4);
}
loop();
