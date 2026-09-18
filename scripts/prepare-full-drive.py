#!/usr/bin/env python3
"""Install the checksum-pinned, classified MaleCNS graph without edge pruning.
Usage: python3 scripts/prepare-full-drive.py PATH_TO_FULL_EXPORT
Driving inputs/readouts retain their original body IDs; only indices change.
"""

import gzip, hashlib, json, sys
from pathlib import Path

if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    raise SystemExit(0 if len(sys.argv) >= 2 else 2)
src = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
out = root / "work/full-model"
out.mkdir(parents=True, exist_ok=True)
m = json.loads((src / "manifest.json").read_text())


def copy(spec):
    b = b"".join((src / n).read_bytes() for n in spec.get("files", [spec["file"]]))
    assert (
        len(b) == spec["bytes"] and hashlib.sha256(b).hexdigest() == spec["sha256"]
    ), spec["file"]
    (out / spec["file"]).write_bytes(b)
    spec.pop("files", None)
    return b


nodes = json.loads(gzip.decompress(copy(m["nodes"])))
copy(m["offsets"])
for part in m["parts"]:
    copy(part["targets"])
    copy(part["weights"])
small = json.loads(gzip.decompress((root / "dist/data/circuit.json.gz").read_bytes()))
index = {n[0]: i for i, n in enumerate(nodes)}
m["inputs"] = [[index[small["nodes"][i][0]] for i in bank] for bank in small["inputs"]]
m["outputs"] = [
    [index[small["nodes"][i][0]] for i in bank] for bank in small["outputs"]
]
m["driving_interface"] = (
    "Same original neuron body IDs as the 1,860-node driving interface; all classified nodes and all connections between them retained. No weight cutoff."
)
m["mode"] = "full"
m["download_bytes"] = sum(p.stat().st_size for p in out.glob("*.gz"))
(out / "manifest.json").write_text(json.dumps(m, separators=(",", ":")))
print(
    {
        k: m[k]
        for k in ["neurons", "edges", "synapses", "soma_positions", "download_bytes"]
    }
)
