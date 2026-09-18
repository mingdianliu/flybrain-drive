#!/usr/bin/env python3
"""Deterministic induced subgraph of the SHA-pinned Flybrain Playground MaleCNS export.
Usage: python prepare-circuit.py /path/to/full
Requires numpy. No synthetic cells, positions or edges are added.
"""

import sys, json, gzip, hashlib
from pathlib import Path
import numpy as np

if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    raise SystemExit(0 if len(sys.argv) >= 2 else 2)
src = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / "dist/data"
out.mkdir(exist_ok=True)
m = json.loads((src / "manifest.json").read_text())


def read(meta):
    b = (src / meta["file"]).read_bytes()
    assert len(b) == meta["bytes"] and hashlib.sha256(b).hexdigest() == meta["sha256"]
    return gzip.decompress(b)


nodes = json.loads(read(m["nodes"]))
off = np.frombuffer(read(m["offsets"]), dtype="<u4")
targets = np.concatenate(
    [np.frombuffer(read(p["targets"]), dtype="<u4") for p in m["parts"]]
)
weights = np.concatenate(
    [
        np.frombuffer(
            read(p["weights"]), dtype="<u2" if m["weight_bytes"] == 2 else "<u4"
        )
        for p in m["parts"]
    ]
)
# x split is an engineered geometric grouping, not a biological steering annotation.
valid = [i for i, n in enumerate(nodes) if n[4] is not None]
mid = float(np.median([nodes[i][4] for i in valid]))
motion = [
    i
    for i in valid
    if m["types"][nodes[i][1]] in ["T4a", "T4b", "T5a", "T5b"]
    and m["neurotransmitters"][nodes[i][3]] == "acetylcholine"
]
loom = [
    i
    for i in valid
    if m["types"][nodes[i][1]] in ["LC4", "LPLC2"]
    and m["neurotransmitters"][nodes[i][3]] == "acetylcholine"
]


def sample(a, n):
    return [a[int(k)] for k in np.linspace(0, len(a) - 1, min(n, len(a)))]


seeds = [
    sample([i for i in motion if nodes[i][4] < mid], 192),
    sample([i for i in motion if nodes[i][4] >= mid], 192),
    sample(loom, 128),
]
seedset = set(sum(seeds, []))
scores = np.zeros((3, len(nodes)), dtype=np.float64)
for k, bank in enumerate(seeds):
    for i in bank:
        np.add.at(scores[k], targets[off[i] : off[i + 1]], weights[off[i] : off[i + 1]])
readouts = []
selected = set(seedset)
for k in range(3):
    ranked = sorted(valid, key=lambda i: (-scores[k, i], i))
    pool = [
        i
        for i in ranked
        if i not in seedset
        and scores[k, i] > 0
        and scores[k, i] >= 0.9 * scores[:, i].sum()
    ][:48]
    assert len(pool) >= 24
    readouts.append(pool)
    selected.update(pool)
    selected.update([i for i in ranked if scores[k, i] > 0][:260])
# Include strong second-hop neighbors for recurrent anatomical context.
second = np.zeros(len(nodes))
for i in sorted(selected - seedset):
    np.add.at(second, targets[off[i] : off[i + 1]], weights[off[i] : off[i + 1]])
selected.update(sorted(valid, key=lambda i: (-second[i], i))[:900])
selected = sorted(selected)
remap = {old: new for new, old in enumerate(selected)}
new_off = [0]
new_t = []
new_w = []
for i in selected:
    for e in range(int(off[i]), int(off[i + 1])):
        j = int(targets[e])
        if j in remap:
            new_t.append(remap[j])
            new_w.append(int(weights[e]))
    new_off.append(len(new_t))
circuit = {
    "nodes": [nodes[i] for i in selected],
    "offsets": new_off,
    "targets": new_t,
    "weights": new_w,
    "signs": [
        m["fast_sign_assumption"].get(m["neurotransmitters"][nodes[i][3]], 0)
        for i in selected
    ],
    "inputs": [[remap[i] for i in bank] for bank in seeds],
    "outputs": [[remap[i] for i in bank] for bank in readouts],
}


def save(name, obj):
    b = gzip.compress(json.dumps(obj, separators=(",", ":")).encode(), mtime=0)
    (out / name).write_bytes(b)
    return {"file": name, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()}


meta = {
    k: m[k]
    for k in [
        "dataset",
        "license",
        "citation",
        "sources",
        "coordinate_system",
        "fast_sign_assumption",
        "types",
        "classes",
        "neurotransmitters",
    ]
}
meta.update(
    neurons=len(selected),
    edges=len(new_t),
    synapses=sum(new_w),
    positioned=sum(nodes[i][4] is not None for i in selected),
    x_split=mid,
    selection="192 spatially split T4a/T4b/T5a/T5b inputs per bank, 128 LC4/LPLC2 inputs; 260 strongest targets per bank plus 900 strongest second-hop targets; all internal original edges retained. Readouts: 48 non-input neurons per bank with >=90% bank-specific direct input.",
    circuit=save("circuit.json.gz", circuit),
    context=save(
        "context.json.gz",
        [
            nodes[i][4:7]
            for i in valid
            if m["classes"][nodes[i][2]] != "descending" or nodes[i][5] < 50000
        ],
    ),
)
(out / "manifest.json").write_text(json.dumps(meta, separators=(",", ":")))
print(
    json.dumps(
        {
            k: meta[k]
            for k in [
                "neurons",
                "edges",
                "synapses",
                "positioned",
                "circuit",
                "context",
            ]
        }
    )
)
