# Reproducing the model and assets

The repository already includes everything needed for the browser demo. The steps below are optional: use them to inspect or regenerate model packages and restore pinned assets.

## Parent connectome export

Download `malecns-v1.0-model.zip` and `SHA256SUMS.txt` from [Flybrain Playground v0.1.0](https://github.com/mingdianliu/flybrain-playground/releases/tag/v0.1.0). Verify the ZIP against that release's checksum file before extracting it. The preparation scripts also verify compressed parts against the parent manifest.

The `FULL_EXPORT` path below must be the extracted directory containing `manifest.json`, neuron data, CSR offsets and connection blocks, rather than the ZIP file or its parent directory.

```sh
python3 -m venv .venv
# macOS / Linux:
source .venv/bin/activate
# Windows PowerShell uses: .venv\Scripts\Activate.ps1
python -m pip install 'numpy>=1.26,<3'
python scripts/prepare-circuit.py /path/to/FULL_EXPORT
python scripts/prepare-realtime.py /path/to/FULL_EXPORT 4000 8000
npm run check
npm test
npm run test:realtime
```

Preparation deterministically selects real nodes and retains all original edges within the selected set. The two expanded modes retain the original driving input and readout body IDs. No geometry, neuron, connection or neural activity is invented to fill the model. Original-source provenance is in `dist/data/manifest.json`; packaged counts and checksums are in the circuit manifests.

Compressed byte hashes can depend on the Python/zlib versions used to regenerate gzip data. Keep the committed packages when byte-for-byte identity is required; compare decoded graph content and the preservation tests when regenerating with a different toolchain. Do not replace source hashes to accept an unexpected upstream download.

`node scripts/calibrate.mjs` measures isolated pathway responses used by the engineered motor decoder. Calibration is not training network weights.

## Optional full classified CNS

```sh
python scripts/prepare-full-drive.py /path/to/FULL_EXPORT
npm run test:full
npm run benchmark:full
```

Data are installed in ignored `work/full-model/`. The export includes 166,606 classified neurons and 25,574,615 directed connections. It excludes unclassified/tbc rows. The 26,947 classified neurons without soma positions remain simulated. A zero fast-transmitter sign is used for 11,564 neurons with unmodeled fast transmitter effects. Full node coverage does not restore missing ion channels, dendritic compartments or neuromodulation.

The full model can be slower than real time and requires more memory. It is never automatically downloaded by the browser. To benchmark the bundled browser circuits instead:

```sh
npm run benchmark:realtime
```

Results are written under `work/`. The checked-in performance sample documents one machine, not a guaranteed speed.

## Pinned scene assets

```sh
python scripts/fetch-scene-assets.py
# Restore only the four pedestrian models:
python scripts/fetch-pedestrian-assets.py
npm run check
npm run test:scene
```

The scene fetcher reads the committed manifest, verifies all downloaded bytes against its SHA-256 values, and only then replaces bundled files. It does not regenerate the manifest from the network. The pedestrian script verifies original downloads, retains only the authored Idle/Walk clips, and packs them into GLB. Downloads require network access; normal playback and regression tests do not.

Retain all licenses and attribution files when distributing assets. See [scene attribution](../dist/assets/ATTRIBUTION.md).

## Documents and source formatting

```sh
npm ci
npm run format
npm run build:docs
npm run check
```

Python document generation uses only the standard library. Python script formatting uses Black; it is not required to run the app or JavaScript tests. The original Chinese guide and its English translation are independently editable under `docs/`. Keep their scientific claims and counts synchronized.
