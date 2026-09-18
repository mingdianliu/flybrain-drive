# Flybrain Drive

A fruit-fly connectome behind the wheel of an interactive 3D driving experiment. Watch a fly grip the steering wheel, change traffic conditions, and inspect the neural activity at recorded anatomical positions.

<!-- INLINE_VIDEO_ATTACHMENT -->

**[Download the 1080p MP4](https://github.com/mingdianliu/flybrain-drive/releases/download/v0.1.0/flybrain-drive-showcase-1080p.mp4)** · [English driving guide](docs/driving-guide.en.md) · [中文原理说明](docs/驾驶原理.md) · [Reproduce the data](docs/REPRODUCING.md)

Play the 1920 × 1080, 30 fps video above. Drag the timeline to seek or use the fullscreen control. The 94-second recording shows the actual simulation, with driver, passenger and city views, traffic-light changes, and synchronized neural activity. The video uses a 500 ms spike afterglow; the app defaults to 120 ms.

**This model has not been trained to drive.** It couples a real connectome subgraph and simplified LIF neurons to engineered sensing, planning and motor readout. It is not a complete biophysical fly model or a system for real vehicles. The guide explains which behavior comes from neural propagation and which comes from programmed control.

## Quick start

Install **Node.js 22 or newer**, then:

```sh
git clone https://github.com/mingdianliu/flybrain-drive.git
cd flybrain-drive
npm start
```

Open the exact localhost address printed by the server. The default page is Chinese; click **English**, or open `/en.html` at that address. No API key, account, package installation or build is required to run the app. Browser models, 3D assets and Three.js are included, so no runtime CDN download is needed.

Use a current desktop browser with WebGL2. The server binds to `127.0.0.1` and chooses an available port. Keep the browser tab in the foreground for reliable simulation speed.

## What you can do

- Switch between **Driver**, **Passenger**, **Overview** and **Overhead** cameras. The passenger view shows the fly's forelegs gripping the car's original steering wheel.
- Change target speed and tire grip while driving.
- Set traffic lights to automatic, red or green; toggle pedestrians and four surrounding vehicles.
- Add obstacles from the overhead view; click an existing obstacle to remove it.
- Rotate and zoom the 3D brain; select the simulated circuit or its anatomical context.
- Compare 120 ms, 500 ms and 1 s spike afterglow. These settings change the display, not neural firing.
- Disconnect neural output: the car brakes while the neural model continues running.
- Pause with the button or Space. Reset restarts neural and vehicle state while preserving settings and obstacles. Changing circuit size or language starts a fresh simulation.

## Real-time neural models

| Mode                | Simulated neurons | Directed connections | Synapse counts |
| ------------------- | ----------------: | -------------------: | -------------: |
| Real time — default |             8,000 |            1,277,045 |     10,789,472 |
| Low power           |             4,000 |              523,173 |      5,364,391 |
| Lightweight         |             1,860 |              114,188 |      1,352,346 |

All simulated nodes have recorded soma coordinates. Larger circuits retain the original driving nodes and add positioned downstream neurons; all source connections between selected nodes are preserved. The app verifies compressed-data SHA-256 hashes before loading.

The **139,659 gray points are anatomical reference**, not additional simulated neurons. Colored highlights and activity counts use actual last-spike times. Thin straight lines illustrate a sample of strong connections, not reconstructed neurites; drawing fewer lines does not remove computation edges.

The app targets 1× model time / wall time. The 8,000-node version measured approximately 1× on the development machine, but device performance varies. If the foreground page stays below 0.9×, select a smaller circuit. Recorded compute-only benchmarks are in [performance-sample.json](docs/performance-sample.json).

## How the control loop works

```text
Road, traffic and obstacle state
  → engineered sensing and planning
  → input pulses to the selected fly circuit
  → LIF spikes propagated through measured connections
  → downstream population-rate readout
  → engineered steering/braking interface
  → vehicle dynamics and the next observation
```

The planner reads map and object positions, not camera pixels. The 3D driver image is not a physiological simulation of compound-eye vision. Traffic rules explicitly supervise speed near signals, pedestrians and other cars.

A 140 ms steering filter, 0.005 rad deadband and 0.9 rad/s actuator limit reduce jitter. Render interpolation and foreleg inverse kinematics follow that actual steering output; they do not simulate fly muscles. The visual fly is derived from a female NeuroMechFly scan, separate from the male MaleCNS connectome.

The model has no optimizer, reward function, learned driving policy or synaptic plasticity. Increasing the neuron count does not train it. See the [full guide](docs/driving-guide.en.md) and the app's **About the model** panel for parameters, causal checks and limitations.

## Repository layout

| Path                                                   | Purpose                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `dist/`                                                | Browser application and directly editable source; no bundler required  |
| `dist/lif-core.mjs`, `dist/neural.mjs`                 | Neural dynamics, stimulation and readout                               |
| `dist/drive-core.mjs`, `dist/worker.mjs`               | Driving rules, car physics and simulation scheduling                   |
| `dist/traffic-*.mjs`                                   | Signals, pedestrians and ordinary traffic vehicles                     |
| `dist/scene.mjs`, `dist/vehicle.mjs`, `dist/brain.mjs` | 3D rendering and live brain view                                       |
| `dist/data/`                                           | Included model packages, provenance and checksums                      |
| `dist/assets/`, `dist/vendor/`                         | Pinned scene assets and third-party code with notices                  |
| `scripts/`                                             | Local server, tests, model preparation and document generation         |
| `docs/`                                                | English/Chinese guides, reproduction instructions and benchmark sample |
| `work/`                                                | Ignored local recordings, downloads and optional full-network data     |

The static site can be served from `dist/` by a normal static web server. Do not open `index.html` with a `file://` URL: module, worker and data loading need HTTP. Personal deployment configuration is intentionally not part of this repository.

## Check and test

```sh
npm run check          # Offline asset/data hashes, syntax and guide consistency
npm test               # Core model, control, causal ablation and steering tests
npm run test:scene     # Actual pedestrian rigs, heading and pause semantics
npm run test:realtime  # Expanded circuits and six simulated minutes of driving
# Or run all of the above:
npm run test:all
```

These commands need no npm packages. The tests check neural propagation versus zero-synapse ablation, input/readout separation, signal response, traffic, collisions, pause/reset and the larger circuits' retained source edges. They are regression tests for the implemented experiment, not proof of biological driving or general autonomous-driving safety.

To edit and format source:

```sh
npm ci                 # Installs the pinned development formatter only
npm run format
npm run format:check
npm run build:docs     # Also requires Python 3.10+
```

Edit `dist/index.html` and `dist/i18n.mjs` for the UI; `dist/en.html` is generated. Edit guides in `docs/`, then regenerate their HTML and downloadable Markdown copies. Third-party and generated files are excluded from formatting. Python scripts use Black formatting.

## Data reproduction and full-network experiments

The included models are enough to run the website. Rebuilding them requires the checksum-pinned parent export and NumPy; see [REPRODUCING.md](docs/REPRODUCING.md) for commands and asset restoration.

Optional scripts can run the full **166,606-neuron classified CNS** graph locally, including brain and ventral nerve cord. It is not part of the browser download and remains a simplified LIF model. A development-machine sample ran at approximately 0.39× real time, so the interactive app defaults to the smaller circuits. Full-network files, recordings and local environments are excluded from Git.

## License and attribution

Project code: [MIT](LICENSE). The neural core builds on [Flybrain Playground](https://github.com/mingdianliu/flybrain-playground).

MaleCNS v1.0 data: **CC BY 4.0**, with filtering, reindexing and compression by this project. Source: [Janelia MaleCNS](https://male-cns.janelia.org/download/); citation: [Berg et al., 2026](https://doi.org/10.1016/j.cell.2026.08.015). Source URLs, hashes and model assumptions are retained in `dist/data/manifest.json`.

Third-party code and assets retain their original licenses, including Three.js (MIT), NeuroMechFly assets (Apache-2.0), Draco (Apache-2.0), Quaternius civilians (CC0) and the HDR environment (CC0). Vehicle credits, source manifests and modification notes are in [scene attribution](dist/assets/ATTRIBUTION.md). The project MIT license does not replace these terms. The demo's background music was synthesized for this project.
