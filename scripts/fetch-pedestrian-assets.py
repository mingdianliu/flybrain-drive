"""Fetch and pack the author's CC0 civilian characters with Idle and Walk clips."""

import base64, concurrent.futures, hashlib, json, struct, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist/assets/pedestrians"
SOURCES = [
    (
        "woman-casual",
        "18b3WwlrwrFYWAM7BcnjWeIxKJyxAQiGh",
        "b0fe6e92219cd71808844a20a1a8b960fd1cf640a6546dc6362b5add6604e87c",
    ),
    (
        "woman-formal",
        "1iayBzVv_zLjuPtaNPouw_auwKlQLLmes",
        "fdfcf454c4de037d31973eb28d8591bd7763035d49f46b380e63b1c832dc7ddf",
    ),
    (
        "man-casual",
        "1Jn7kULNmrtqP8BUUL19h8MhbdOnwPFhv",
        "55c654d09a2a5ff6e3bd6158d4a1b462f181cd6f1e12a0f5e9d959f9c3abc438",
    ),
    (
        "man-hoodie",
        "1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5",
        "dd74886c26998a0fa888b4ce557a0932d7d97b0265dd4c763154d081b7a6cb98",
    ),
]


# Only live mesh/skin/Idle/Walk accessors are packed. No geometry or animation is generated.
def pack(data):
    d = json.loads(data)
    d["animations"] = [a for a in d["animations"] if a["name"] in ("Idle", "Walk")]
    assert len(d["animations"]) == 2 and len(d["buffers"]) == 1 and not d.get("images")
    source = base64.b64decode(d["buffers"][0]["uri"].split(",")[1])
    used = set()
    for m in d["meshes"]:
        for p in m["primitives"]:
            used.update(p["attributes"].values())
            if "indices" in p:
                used.add(p["indices"])
            for target in p.get("targets", []):
                used.update(target.values())
    for skin in d.get("skins", []):
        if "inverseBindMatrices" in skin:
            used.add(skin["inverseBindMatrices"])
    for a in d["animations"]:
        for s in a["samplers"]:
            used.update([s["input"], s["output"]])
    ids = sorted(used)
    mapping = {old: new for new, old in enumerate(ids)}
    accessors = [d["accessors"][i] for i in ids]
    assert all("sparse" not in a for a in accessors)
    views = sorted({a["bufferView"] for a in accessors})
    viewmap = {old: new for new, old in enumerate(views)}
    blob = bytearray()
    outviews = []
    for index in views:
        v = dict(d["bufferViews"][index])
        start = v.get("byteOffset", 0)
        part = source[start : start + v["byteLength"]]
        blob.extend(b"\0" * (-len(blob) % 4))
        v.update(buffer=0, byteOffset=len(blob))
        blob.extend(part)
        outviews.append(v)
    for a in accessors:
        a["bufferView"] = viewmap[a["bufferView"]]
    for m in d["meshes"]:
        for p in m["primitives"]:
            p["attributes"] = {k: mapping[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = mapping[p["indices"]]
            for target in p.get("targets", []):
                for k in target:
                    target[k] = mapping[target[k]]
    for skin in d.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = mapping[skin["inverseBindMatrices"]]
    for a in d["animations"]:
        for s in a["samplers"]:
            s["input"] = mapping[s["input"]]
            s["output"] = mapping[s["output"]]
    d["accessors"] = accessors
    d["bufferViews"] = outviews
    d["buffers"] = [{"byteLength": len(blob)}]
    d["asset"]["copyright"] = "Quaternius — CC0 1.0; see QUATERNIUS-LICENSE.txt"
    j = json.dumps(d, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    blob.extend(b"\0" * (-len(blob) % 4))
    return (
        struct.pack("<III", 0x46546C67, 2, 28 + len(j) + len(blob))
        + struct.pack("<II", len(j), 0x4E4F534A)
        + j
        + struct.pack("<II", len(blob), 0x004E4942)
        + blob
    )


def fetch(item):
    name, uid, expected = item
    url = "https://drive.google.com/uc?export=download&id=" + uid
    data = urllib.request.urlopen(url).read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        raise ValueError(name + " upstream SHA-256 changed: " + actual)
    result = pack(data)
    (OUT / (name + ".glb")).write_bytes(result)
    return {
        "file": name + ".glb",
        "url": url,
        "source_sha256": actual,
        "sha256": hashlib.sha256(result).hexdigest(),
        "bytes": len(result),
        "clips": ["Idle", "Walk"],
    }


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True, parents=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(fetch, SOURCES))
    license_url = "https://drive.google.com/uc?export=download&id=1lIFL16xEpoPbr0j_HUATgmcEnAmYoIK2"
    license_data = urllib.request.urlopen(license_url).read()
    assert (
        hashlib.sha256(license_data).hexdigest()
        == "e8dbf915a2b82229913e301a0787696611241bdefec4832bc084f54161db1efe"
    )
    (OUT / "QUATERNIUS-LICENSE.txt").write_bytes(license_data)
    (OUT / "source-manifest.json").write_text(json.dumps(records, indent=2))
    print(json.dumps(records, indent=2))
