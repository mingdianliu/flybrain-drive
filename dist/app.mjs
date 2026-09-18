import { t } from './i18n.mjs';
import { RoadScene } from './scene.mjs';
import { BrainView } from './brain.mjs';
const $ = (id) => document.getElementById(id),
  scene = new RoadScene($('road-view'));
let modelMode = '8000',
  modelMeta,
  loadEpoch = 0;
let brain,
  worker,
  state,
  running = false,
  ready = false,
  placing = false,
  request = 0,
  history = [],
  lastSim = 0,
  lastReal = performance.now(),
  ratio = 1;
const pending = new Map();
const status = (message) => ($('status').textContent = t(message));
function activityUI() {
  if (!brain) return;
  const b = brain.getState();
  $('active-count').textContent = b.active.toLocaleString();
  $('active-label').textContent = t('近 {window} 活跃', {
    window: b.windowMs === 1000 ? '1 s' : b.windowMs + ' ms',
  });
  $('active-percent').textContent = t('{percent}% 的回路', { percent: b.percent.toFixed(1) });
  $('activity-window').value = b.windowMs;
  $('brain-explanation').textContent = t(
    '亮光保留最近 {window} 的模拟放电；暂停时定格，重置后清空。',
    { window: b.windowMs === 1000 ? '1 s' : b.windowMs + ' ms' },
  );
  for (const scope of ['circuit', 'anatomy']) {
    const el = $('brain-' + scope);
    el.classList.toggle('selected', b.scope === scope);
    el.setAttribute('aria-pressed', String(b.scope === scope));
  }
}
function configureBrainView(v) {
  if (!brain) throw Error(t('神经回路尚未就绪'));
  if (v.scope !== undefined && !['circuit', 'anatomy'].includes(v.scope))
    throw Error('Invalid brain scope');
  if (v.windowMs !== undefined && ![120, 500, 1000].includes(v.windowMs))
    throw Error('Invalid activity window');
  if (v.scope !== undefined) brain.setScope(v.scope);
  if (v.windowMs !== undefined) brain.setWindow(v.windowMs);
  activityUI();
  return readState();
}
$('activity-window').onchange = (e) => configureBrainView({ windowMs: +e.target.value });
for (const scope of ['circuit', 'anatomy'])
  $('brain-' + scope).onclick = () => configureBrainView({ scope });

function camera(mode) {
  if (mode !== 'top') {
    placing = false;
    $('place-obstacle').classList.remove('selected');
  }
  scene.setMode(mode);
  $('track-hint').textContent =
    mode === 'driver'
      ? t('驾驶席 · 前足随神经输出转动方向盘')
      : mode === 'passenger'
        ? t('副驾驶 · 看前足握盘与转向')
        : t('拖动旋转 · 滚轮缩放');
  ['driver', 'passenger', 'overview', 'top-view'].forEach((id) =>
    $(id).classList.toggle('selected', (id === 'top-view' ? 'top' : id) === mode),
  );
}
for (const [id, mode] of [
  ['driver', 'driver'],
  ['passenger', 'passenger'],
  ['overview', 'overview'],
  ['top-view', 'top'],
])
  $(id).onclick = () => camera(mode);
$('model-info').onclick = () => $('info-dialog').showModal();
$('close-info').onclick = () => $('info-dialog').close();
$('info-dialog').addEventListener('click', (e) => {
  if (e.target === $('info-dialog')) $('info-dialog').close();
});
function command(kind, values = {}) {
  if (!ready) return Promise.reject(Error(t('神经回路尚未就绪')));
  return new Promise((resolve, reject) => {
    const requestId = ++request;
    pending.set(requestId, { resolve, reject });
    worker.postMessage({ kind, requestId, ...values });
  });
}
function doAction(kind, values) {
  return command(kind, values).catch((e) => {
    status(e.message);
    throw e;
  });
}
function uiCommand(kind, values) {
  void doAction(kind, values).catch(() => {});
}
$('run').onclick = () => uiCommand('run', { value: !running });
$('reset').onclick = () => {
  history = [];
  uiCommand('reset');
};
$('clear-obstacles').onclick = () => uiCommand('clear');
$('place-obstacle').onclick = () => {
  placing = !placing;
  if (placing) camera('top');
  scene.controls.enabled = !placing && !['chase', 'driver', 'passenger'].includes(scene.mode);
  $('place-obstacle').classList.toggle('selected', placing);
  $('track-hint').textContent = placing
    ? t('点击赛道放置 · 点击现有障碍移除')
    : t('拖动旋转 · 滚轮缩放');
};
scene.renderer.domElement.addEventListener('pointerup', (e) => {
  if (!placing || !state) return;
  const p = scene.ground(e);
  if (!p) return;
  const existing = state.obstacles.find((o) => Math.hypot(o.x - p.x, o.z - p.z) < 1.3);
  uiCommand(existing ? 'remove' : 'add', existing ? { id: existing.id } : p);
});
$('target-speed').oninput = (e) => {
  const value = +e.target.value;
  $('target-speed-value').value = `${value} km/h`;
  uiCommand('configure', { values: { targetSpeed: value } });
};
$('grip').oninput = (e) => {
  const value = +e.target.value;
  $('grip-value').value = `${value}%`;
  uiCommand('configure', { values: { grip: value / 100 } });
};
$('brain-connected').onchange = (e) =>
  uiCommand('configure', { values: { connected: e.target.checked } });
$('signal-mode').onchange = (e) =>
  uiCommand('configure', { values: { signalMode: e.target.value } });
$('pedestrians-enabled').onchange = (e) =>
  uiCommand('configure', { values: { pedestriansEnabled: e.target.checked } });
$('vehicles-enabled').onchange = (e) =>
  uiCommand('configure', { values: { vehiclesEnabled: e.target.checked } });
document.addEventListener('keydown', (e) => {
  if (
    e.code === 'Space' &&
    !['INPUT', 'BUTTON'].includes(e.target.tagName) &&
    !$('info-dialog').open
  ) {
    e.preventDefault();
    if (ready) uiCommand('run', { value: !running });
  }
});
async function unpack(meta) {
  const r = await fetch(`./data/${meta.file}`);
  if (!r.ok) throw Error(t('数据下载失败 ({status})', { status: r.status }));
  const b = await r.arrayBuffer(),
    hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('');
  if (hash !== meta.sha256) throw Error(t('数据完整性校验未通过'));
  return JSON.parse(
    await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text(),
  );
}
function update(m) {
  state = m.state;
  running = m.running;
  scene.setObstacles(state.obstacles);
  scene.setTrail(m.trail);
  brain.update(m.last, state.time);
  activityUI();
  $('speed-value').textContent = (state.speed * 3.6).toFixed(1);
  $('speed-fill').style.width = `${((state.speed * 3.6) / 32) * 100}%`;
  $('laps').textContent = String(state.laps).padStart(2, '0');
  $('distance').textContent = `${state.distance.toFixed(0)} m`;
  $('collisions').textContent = state.collisions;
  $('spike-count').textContent = state.total.toLocaleString();
  $('steering').textContent =
    `${state.steer > 0 ? t('左') : t('右')} ${Math.abs((state.steer * 180) / Math.PI).toFixed(1)}°`;
  $('brake').textContent = `${(state.brake * 100).toFixed(0)}%`;
  $('brain-connected').checked = state.config.connected;
  $('signal-mode').value = state.config.signalMode;
  $('pedestrians-enabled').checked = state.config.pedestriansEnabled;
  $('vehicles-enabled').checked = state.config.vehiclesEnabled;
  $('target-speed').value = state.config.targetSpeed;
  $('target-speed-value').value = `${state.config.targetSpeed} km/h`;
  $('grip').value = state.config.grip * 100;
  $('grip-value').value = `${Math.round(state.config.grip * 100)}%`;
  $('traffic-status').textContent = state.waitReason
    ? `${t(state.waitReason)} · ${state.speed < 0.1 ? t('停车中') : t('正在减速')}`
    : t('{cars} 辆车 · {people} 位行人 · {signals}', {
        cars: state.traffic?.vehicles.length || 0,
        people: state.traffic?.pedestrians.length || 0,
        signals:
          state.config.signalMode === 'auto'
            ? t('自动信号周期')
            : state.config.signalMode === 'red'
              ? t('红灯模式')
              : t('绿灯模式'),
      });
  $('traffic-status').dataset.wait = !!state.waitReason;
  $('run').textContent = running ? t('Ⅱ 暂停') : t('▶ 开始驾驶');
  $('run').disabled = state.blocked;
  $('mode-badge').textContent = state.blocked
    ? t('碰撞停车 · 点击重置')
    : !state.config.connected
      ? t('神经输出已断开')
      : running
        ? t('NEURAL DRIVE · 运行中')
        : t('已暂停');
  status(
    state.blocked
      ? t('碰撞后已停车，重置可重新出发')
      : running
        ? t('神经回路已接通 · 正在驾驶')
        : t('回路就绪 · 点击开始驾驶'),
  );
  const now = performance.now();
  if (state.time > lastSim) {
    if (now - lastReal > 500) {
      ratio = (state.time - lastSim) / (now - lastReal);
      $('ratio').textContent = `${ratio.toFixed(2)} ×`;
      lastSim = state.time;
      lastReal = now;
    }
    history.push([state.time, ...state.rates]);
    while (history.length && state.time - history[0][0] > 12000) history.shift();
  } else if (!running) {
    lastSim = state.time;
    lastReal = now;
    if (state.time === 0) $('ratio').textContent = '— ×';
  }
  drawCharts();
}
function canvas(id) {
  const c = $(id),
    r = c.getBoundingClientRect(),
    d = Math.min(devicePixelRatio, 2);
  if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) {
    c.width = Math.round(r.width * d);
    c.height = Math.round(r.height * d);
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  return [ctx, r.width, r.height];
}
function drawCharts() {
  if (!state) return;
  let [c, w, h] = canvas('signal-chart');
  c.font = '11px ui-monospace,monospace';
  c.strokeStyle = '#27353d';
  c.fillStyle = '#77919f';
  const max = Math.max(100, ...history.flatMap((p) => p.slice(1))) * 1.15;
  for (let i = 0; i < 3; i++) {
    const y = 18 + (i * (h - 42)) / 2;
    c.beginPath();
    c.moveTo(38, y);
    c.lineTo(w - 16, y);
    c.stroke();
    c.fillText(Math.round(max * (1 - i / 2)), 4, y + 4);
  }
  c.fillText('Hz / cell', 42, 12);
  c.fillText('−12 s', 38, h - 5);
  c.fillText('现在', w - 42, h - 5);
  ['#64c2ff', '#dcff71', '#ff966c'].forEach((color, k) => {
    c.strokeStyle = color;
    c.lineWidth = 1.7;
    c.beginPath();
    history.forEach((p, i) => {
      const x = 38 + (1 - (state.time - p[0]) / 12000) * (w - 54),
        y = h - 24 - (p[k + 1] / max) * (h - 42);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.stroke();
  });
  [c, w, h] = canvas('sensor-chart');
  const x = w / 2,
    y = h - 15,
    scale = (h - 28) / 20;
  c.strokeStyle = '#2a3b44';
  for (const r of [5, 10, 15, 20]) {
    c.beginPath();
    c.arc(x, y, r * scale, Math.PI + Math.PI * 0.15, -Math.PI * 0.15);
    c.stroke();
  }
  state.rays.forEach((r, i) => {
    const a = -Math.PI / 2 - 1.1 + i * 0.22;
    c.strokeStyle = r < 5 ? '#ff966c' : '#81baa5';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * r * scale, y + Math.sin(a) * r * scale);
    c.stroke();
  });
  c.fillStyle = '#dcff71';
  c.fillRect(x - 4, y - 7, 8, 12);
  c.fillStyle = '#77919f';
  c.font = '11px ui-monospace,monospace';
  c.fillText('0–20 m', 12, h - 10);
}
function render() {
  scene.update(state, running);
  brain?.render();
  requestAnimationFrame(render);
}
render();
window.addEventListener('resize', drawCharts);
function loading(message) {
  let el = $('brain-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'brain-loading';
    el.className = 'brain-loading';
    $('brain-view').append(el);
  }
  el.textContent = t(message);
}
function installBrain(meta, data, context) {
  modelMeta = meta;
  brain = new BrainView($('brain-view'), data, context);
  $('brain-loading')?.remove();
  $('neuron-count').textContent = meta.neurons.toLocaleString();
  $('brain-circuit').textContent = t('仅仿真回路');
  $('brain-scope').textContent = t(
    '{neurons} 个真实坐标神经元参与简化仿真；{context} 个灰色背景点只作解剖参考。',
    { neurons: meta.neurons.toLocaleString(), context: context.length.toLocaleString() },
  );
  $('model-status').textContent = t('{edges} 条连接 · 目标 1× 实时；切换规模会重置驾驶。', {
    edges: meta.edges.toLocaleString(),
  });
  $('dataset-description').textContent = t(
    '使用 MaleCNS v1.0 的 {neurons} 个神经元与 {edges} 条有向连接。保留所选节点之间的全部原始连接；灰色背景仅作解剖参考。',
    { neurons: meta.neurons.toLocaleString(), edges: meta.edges.toLocaleString() },
  );
  for (const id of ['activity-window', 'brain-circuit', 'brain-anatomy']) $(id).disabled = false;
}
async function boot(mode = '8000') {
  const epoch = ++loadEpoch;
  modelMode = mode;
  $('model-size').value = mode;
  ready = false;
  running = false;
  state = undefined;
  history = [];
  lastSim = 0;
  lastReal = performance.now();
  worker?.terminate();
  for (const p of pending.values()) p.reject(Error(t('仿真规模已切换')));
  pending.clear();
  brain?.dispose();
  brain = null;
  $('run').disabled = true;
  $('run').textContent = t('▶ 开始驾驶');
  $('ratio').textContent = '— ×';
  $('active-count').textContent = '0';
  $('spike-count').textContent = '0';
  $('neuron-count').textContent = '—';
  $('brain-scope').textContent = t('正在核对仿真范围…');
  $('mode-badge').textContent = t('载入模型');
  for (const id of ['activity-window', 'brain-circuit', 'brain-anatomy']) $(id).disabled = true;
  loading(t('加载实时神经回路…'));
  status(t('正在校验神经元与连接'));
  $('model-status').textContent = t('加载中；切换规模会重置驾驶。');
  try {
    await scene.ready;
    if (epoch !== loadEpoch) return;
    const response = await fetch('./data/manifest.json');
    if (!response.ok) throw Error(t('模型清单加载失败'));
    let meta = await response.json();
    if (mode !== 'small') {
      const r = await fetch('./data/realtime-manifest.json');
      if (!r.ok) throw Error(t('实时模型清单加载失败'));
      const variants = await r.json(),
        selected = variants.models.find((m) => m.mode === mode);
      if (!selected) throw Error(t('未知仿真规模'));
      meta = { ...meta, ...selected, selection: variants.selection };
    }
    const loaded = await Promise.all([unpack(meta.circuit), unpack(meta.context)]);
    if (epoch !== loadEpoch) return;
    const data = loaded[0];
    installBrain(meta, data, loaded[1]);
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: m }) => {
      if (epoch !== loadEpoch) return;
      if (m.kind === 'error') {
        status(m.message);
        if (!ready) {
          loading(t(m.message) + t('；可切换轻量回路重试。'));
          $('model-status').textContent = t(m.message);
        }
        pending.get(m.requestId)?.reject(Error(m.message));
        pending.delete(m.requestId);
        return;
      }
      if (m.ready) {
        ready = true;
        $('run').disabled = false;
        lastReal = performance.now();
        lastSim = 0;
      }
      update(m);
      if (m.requestId) {
        pending.get(m.requestId)?.resolve(readState());
        pending.delete(m.requestId);
      }
    };
    worker.onerror = () => {
      status(t('仿真加载失败，请切换模型重试'));
      loading(t('仿真加载失败，请切换模型重试'));
    };
    worker.postMessage({ kind: 'init', mode, data });
  } catch (e) {
    if (epoch !== loadEpoch) return;
    status(e.message);
    loading(t(e.message) + t('；可切换模型重试。'));
  }
}
$('model-size').onchange = (e) => boot(e.target.value);
function readState() {
  return {
    ready,
    running,
    simulationModel: modelMode,
    simulatedNeurons: modelMeta?.neurons,
    simulatedConnections: modelMeta?.edges,
    brainVisualization: brain?.getState(),
    camera: scene.mode,
    placing,
    ...(state
      ? {
          simulationMs: state.time,
          speedKmh: +(state.speed * 3.6).toFixed(2),
          laps: state.laps,
          distanceM: +state.distance.toFixed(2),
          collisions: state.collisions,
          blocked: state.blocked,
          neuralRates: state.rates,
          totalSpikes: state.total,
          configuration: state.config,
          trafficSignals: state.traffic?.signals,
          pedestrians: state.traffic?.pedestrians,
          trafficVehicles: state.traffic?.vehicles,
          waitReason: state.waitReason,
          stopDistanceM: state.stopDistance,
          obstacles: state.obstacles,
        }
      : {}),
  };
}
const mc = document.modelContext;
if (mc?.registerTool) {
  const life = new AbortController();
  const register = (name, description, schema, execute, readOnly = false) => {
    try {
      Promise.resolve(
        mc.registerTool(
          {
            name,
            description,
            inputSchema: { type: 'object', ...schema, additionalProperties: false },
            annotations: { readOnlyHint: readOnly, untrustedContentHint: false },
            execute: (v) => {
              if (
                !v ||
                typeof v !== 'object' ||
                Array.isArray(v) ||
                Object.keys(v).some((k) => !(k in (schema.properties || {}))) ||
                (schema.required || []).some((k) => !(k in v))
              )
                throw Error('Invalid arguments');
              return execute(v);
            },
          },
          { signal: life.signal },
        ),
      ).catch(() => {});
    } catch {}
  };
  register(
    'configure_brain_view',
    'Change the spike afterglow window or show the simulated circuit in its anatomical context. Display only; does not change simulation.',
    {
      properties: {
        scope: { type: 'string', enum: ['circuit', 'anatomy'] },
        windowMs: { type: 'number', enum: [120, 500, 1000] },
      },
    },
    configureBrainView,
  );
  register(
    'read_drive_state',
    'Read visible driving telemetry and settings.',
    { properties: {} },
    () => readState(),
    true,
  );
  register(
    'control_drive',
    'Start, pause or reset the simulation using the same controls as the page.',
    {
      properties: { action: { type: 'string', enum: ['start', 'pause', 'reset'] } },
      required: ['action'],
    },
    async (v) => {
      if (!['start', 'pause', 'reset'].includes(v.action)) throw Error('Unknown action');
      if (v.action === 'reset') history = [];
      return doAction(v.action === 'reset' ? 'reset' : 'run', { value: v.action === 'start' });
    },
  );
  register(
    'configure_drive',
    'Change speed, grip, traffic-light mode, pedestrian activity, ambient traffic or neural motor connection.',
    {
      properties: {
        targetSpeed: { type: 'number', minimum: 8, maximum: 32 },
        grip: { type: 'number', minimum: 0.4, maximum: 1 },
        connected: { type: 'boolean' },
        signalMode: { type: 'string', enum: ['auto', 'red', 'green'] },
        pedestriansEnabled: { type: 'boolean' },
        vehiclesEnabled: { type: 'boolean' },
      },
    },
    (v) => doAction('configure', { values: v }),
  );
  register(
    'place_drive_obstacle',
    'Place an obstacle in world coordinates on the street; reject overlap, off-road or near-car placements.',
    { properties: { x: { type: 'number' }, z: { type: 'number' } }, required: ['x', 'z'] },
    (v) => doAction('add', { x: v.x, z: v.z }),
  );
  register(
    'set_drive_view',
    'Switch the visible camera between fly driver, passenger, overview and overhead.',
    {
      properties: { view: { type: 'string', enum: ['driver', 'passenger', 'overview', 'top'] } },
      required: ['view'],
    },
    (v) => {
      if (!['driver', 'passenger', 'overview', 'top'].includes(v.view)) throw Error('Unknown view');
      camera(v.view);
      return readState();
    },
  );
  register(
    'clear_drive_obstacles',
    'Remove all track obstacles, as the clear-obstacles button does.',
    { properties: {} },
    () => doAction('clear'),
  );
  window.addEventListener('pagehide', () => life.abort(), { once: true });
}
boot();
