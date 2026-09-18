"""Restore scene assets using the committed source URLs and SHA-256 hashes.

All downloads are verified before any bundled file is replaced. The source
manifest is never regenerated from network responses. Existing files therefore
remain intact if an upstream download changes or fails.
"""

import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def download(record):
    destination = (DIST / record["file"]).resolve()
    if not destination.is_relative_to(DIST.resolve()):
        raise ValueError("Asset path escapes dist")
    with urllib.request.urlopen(record["url"], timeout=60) as response:
        data = response.read()
    actual = hashlib.sha256(data).hexdigest()
    if len(data) != record["bytes"] or actual != record["sha256"]:
        raise ValueError(
            f"{record['file']}: upstream bytes differ from the pinned asset"
        )
    return destination, data


def main():
    records = json.loads((DIST / "assets/source-manifest.json").read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        verified = list(pool.map(download, records))
    for destination, data in verified:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    print(f"Restored {len(verified)} SHA-256-verified scene assets.")
    subprocess.run(
        [sys.executable, str(Path(__file__).with_name("fetch-pedestrian-assets.py"))],
        check=True,
    )


if __name__ == "__main__":
    main()
