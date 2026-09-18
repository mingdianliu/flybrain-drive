export async function loadFullModel(manifest, read, onProgress = () => {}) {
  let loaded = 0;
  const specs = [
    manifest.nodes,
    manifest.offsets,
    ...manifest.parts.flatMap((p) => [p.targets, p.weights]),
  ];
  const total = specs.reduce((n, s) => n + s.bytes, 0);
  async function unpack(spec) {
    const buffer = await read(spec.file);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), (x) =>
      x.toString(16).padStart(2, '0'),
    ).join('');
    if (buffer.byteLength !== spec.bytes || hash !== spec.sha256)
      throw Error('全量数据校验失败：' + spec.file);
    const decoded = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
    loaded += spec.bytes;
    onProgress({ loaded, total });
    return decoded;
  }
  const nodes = JSON.parse(new TextDecoder().decode(await unpack(manifest.nodes)));
  if (nodes.length !== manifest.neurons) throw Error('全量神经元数量不匹配');
  const offsets = new Uint32Array(await unpack(manifest.offsets));
  const Weight = manifest.weight_bytes === 2 ? Uint16Array : Uint32Array;
  const targets = new Uint32Array(manifest.edges),
    weights = new Weight(manifest.edges);
  let next = 0,
    synapses = 0;
  for (const part of manifest.parts) {
    if (part.start !== next) throw Error('全量连接分块不连续');
    const t = new Uint32Array(await unpack(part.targets)),
      w = new Weight(await unpack(part.weights));
    if (t.length !== part.count || w.length !== part.count) throw Error('全量连接分块大小不匹配');
    targets.set(t, part.start);
    weights.set(w, part.start);
    next += part.count;
    for (const n of w) synapses += n;
  }
  if (next !== manifest.edges || synapses !== manifest.synapses) throw Error('全量连接总数不匹配');
  const signs = Int8Array.from(
    nodes,
    (n) => manifest.fast_sign_assumption[manifest.neurotransmitters[n[3]]] || 0,
  );
  const inputs = manifest.inputs,
    outputs = manifest.outputs,
    seedSet = new Set(inputs.flat());
  for (const bank of [...inputs, ...outputs])
    for (const i of bank)
      if (!Number.isInteger(i) || i < 0 || i >= nodes.length) throw Error('驾驶接口索引不正确');
  if (outputs.flat().some((i) => seedSet.has(i))) throw Error('读出不得直接注入');
  return { nodes, offsets, targets, weights, signs, inputs, outputs, mode: 'full' };
}
