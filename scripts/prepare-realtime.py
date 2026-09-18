#!/usr/bin/env python3
"""Grow the original driving subgraph by real downstream connection strength.
Usage: python3 scripts/prepare-realtime.py FULL_EXPORT [COUNTS ...]
Retains the complete induced graph, fixed driving body IDs and real soma locations.
"""

import gzip, hashlib, json, sys
from pathlib import Path
import numpy as np

if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    raise SystemExit(0 if len(sys.argv) >= 2 else 2)
src = Path(sys.argv[1])
counts = list(map(int, sys.argv[2:])) or [4000, 8000]
if len(set(counts)) != len(counts) or any(count < 1860 for count in counts):
    raise SystemExit("Choose distinct circuit sizes of at least 1,860 neurons.")
root = Path(__file__).resolve().parents[1]
out = root / "dist/data"
m = json.loads((src / "manifest.json").read_text())


def read(spec):
    b = b"".join((src / n).read_bytes() for n in spec.get("files", [spec["file"]]))
    assert len(b) == spec["bytes"] and hashlib.sha256(b).hexdigest() == spec["sha256"]
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
small = json.loads(gzip.decompress((out / "circuit.json.gz").read_bytes()))
byid = {n[0]: i for i, n in enumerate(nodes)}
base = [byid[n[0]] for n in small["nodes"]]
scores = np.zeros(len(nodes))
for i in base:
    np.add.at(scores, targets[off[i] : off[i + 1]], weights[off[i] : off[i + 1]])
base_set = set(base)
ranked = sorted(
    (
        i
        for i, n in enumerate(nodes)
        if n[4] is not None and i not in base_set and scores[i] > 0
    ),
    key=lambda i: (-scores[i], i),
)
models = []
for count in counts:
    selected = sorted(base + ranked[: count - len(base)])
    assert len(selected) == count
    remap = np.full(len(nodes), -1, dtype=np.int32)
    remap[selected] = np.arange(count)
    new_off = [0]
    tt = []
    ww = []
    for i in selected:
        row = remap[targets[off[i] : off[i + 1]]]
        keep = row >= 0
        tt.extend(row[keep].tolist())
        ww.extend(weights[off[i] : off[i + 1]][keep].tolist())
        new_off.append(len(tt))
    d = {
        "nodes": [nodes[i] for i in selected],
        "offsets": new_off,
        "targets": tt,
        "weights": ww,
        "signs": [
            m["fast_sign_assumption"].get(m["neurotransmitters"][nodes[i][3]], 0)
            for i in selected
        ],
        "inputs": [[int(remap[base[i]]) for i in bank] for bank in small["inputs"]],
        "outputs": [[int(remap[base[i]]) for i in bank] for bank in small["outputs"]],
    }
    name = f"realtime-{count}.json.gz"
    b = gzip.compress(
        json.dumps(d, separators=(",", ":")).encode(), compresslevel=6, mtime=0
    )
    (out / name).write_bytes(b)
    spec = {
        "mode": str(count),
        "neurons": count,
        "edges": len(tt),
        "synapses": sum(ww),
        "positioned": count,
        "circuit": {
            "file": name,
            "bytes": len(b),
            "sha256": hashlib.sha256(b).hexdigest(),
        },
    }
    models.append(spec)
    print(spec)
(out / "realtime-manifest.json").write_text(
    json.dumps(
        {
            "selection": "Original 1,860 driving nodes plus positioned downstream nodes ranked by summed incoming synapse counts from that original set. All original connections between retained nodes kept; inputs and readouts preserve body IDs.",
            "models": models,
        },
        separators=(",", ":"),
    )
)
