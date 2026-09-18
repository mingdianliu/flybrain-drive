# How fly neural circuits participate in driving

Flybrain Drive project guide · September 18, 2026

This interactive experiment connects a subgraph of a real fruit-fly connectome to a virtual car. The current model has not been trained to drive. Engineered rules determine road and traffic demands, stimulate the neural circuit, and decode its spikes to control the car.

## 1. From the street to the steering wheel

```text
Virtual city: roads, obstacles, pedestrians, lights and other vehicles
             ↓
Engineered perception and planning: read the map and object positions
             ↓
Sensory encoding: convert steering and danger into input pulse rates
             ↓
Real connectome subgraph + simplified LIF neurons: propagate spikes
             ↓
Motor readout: convert three downstream populations into steering and braking
             ↓
Vehicle dynamics: update position and heading, then sense again
```

A separate traffic-rule supervisor limits speed near red lights, pedestrians and vehicles ahead. Its contribution is explicit: programmed traffic rules are not abilities learned by the fly.

## 2. What comes from real fly data?

The project uses neuron annotations, soma coordinates, directed connections and synapse counts from the [official MaleCNS v1.0 dataset](https://male-cns.janelia.org/download/). The browser prioritizes real-time interaction. Its default circuit has 8,000 neurons; slower devices can select 4,000 or 1,860. Switching circuit size resets both driving and neural state.

| Property                                     | Real time (default) | Low power | Lightweight |
| -------------------------------------------- | ------------------- | --------- | ----------- |
| Simulated neurons                            | 8,000               | 4,000     | 1,860       |
| Directed connections                         | 1,277,045           | 523,173   | 114,188     |
| Sum of synapse counts                        | 10,789,472          | 5,364,391 | 1,352,346   |
| Simulated nodes with recorded soma positions | 8,000               | 4,000     | 1,860       |

The 139,659 gray soma points provide anatomical context only. They are not all simulated. All three circuits retain the same input and readout body IDs: two groups of 192 T4a/T4b/T5a/T5b inputs, another 128 LC4/LPLC2 inputs, and three downstream readout pools of 48 neurons. Readout neurons are separate from directly stimulated inputs.

The larger circuits retain the original 1,860 nodes and add downstream neurons with recorded positions, ranked by total synapse count arriving from that original circuit. Every original connection and weight between selected nodes is retained. No neurons, positions, connections or spikes are invented to enhance the visualization.

The full classified CNS export remains available for local experiments, but is not downloaded by the website. Full node coverage is also different from a complete biophysical reconstruction; see section 10.

“Left turn,” “right turn” and “braking” name the engineering roles we assign to these groups, not biological driving functions annotated in the dataset. Transmitter signs and dynamics include modeling assumptions. A connectivity graph alone does not specify a complete working biological brain.

## 3. The circuit does not receive camera pixels

The driver view is a 3D rendering for the human viewer. The controller reads the road centerline, vehicle and obstacle positions, signal states and pedestrian locations directly. It uses these to determine desired steering and approaching hazards.

The 11 distance rays visualize road and obstacle sensing, including other vehicles. The planner primarily uses map and object positions; it has not learned to drive from those 11 numbers or from camera pixels.

The planner produces a desired steering angle θ, approximately within −0.52 to +0.52 radians. The encoder converts it into input rates:

```text
Left input rate  = 20 + max(θ, 0) / 0.52 × 180 Hz
Right input rate = 20 + max(−θ, 0) / 0.52 × 180 Hz
Brake input rate = danger level × 150 Hz
```

For a left turn of about 15°, the left input is approximately 111 Hz while the right stays at 20 Hz. Approaching red lights, pedestrians or a leading vehicle increases danger and the braking input. Pulses within each pool have staggered phases to reduce artificial synchrony.

This stage already contains engineered driving knowledge. An untrained brain model is not discovering the relationships between roads, traffic lights and steering from images alone.

## 4. How do the neurons spike?

Each node uses a single-compartment, current-based leaky integrate-and-fire (LIF) model. Inputs accumulate; crossing the membrane threshold produces a spike, followed by reset and a refractory period. Delayed spikes influence downstream neurons using the original connection weights and assumed transmitter signs.

| Parameter               | Value           |
| ----------------------- | --------------- |
| Neural integration step | 0.2 ms          |
| Rest / reset potential  | −52 mV / −52 mV |
| Spike threshold         | −45 mV          |
| Membrane time constant  | 20 ms           |
| Synaptic time constant  | 5 ms            |
| Refractory period       | 2.2 ms          |
| Synaptic delay          | 1.8 ms          |

Cholinergic connections are treated as excitatory; GABA and glutamate connections as inhibitory. Other transmitters have zero fast effect in this model. Synapse counts are multiplied by a shared gain of 0.275. These are simplifying assumptions, not complete physiological parameters measured for each neuron.

The model lacks dendritic compartments, voltage-gated ion channels, muscle dynamics and complete neuromodulatory mechanisms. Simulating every selected node therefore does not constitute a complete biophysical fly brain.

## 5. From spikes to vehicle motion

The neural and driving loop advances in 10 ms batches. Spikes in each readout pool are converted to mean firing rate per cell, then smoothed with a 65 ms time constant.

The two steering outputs pass through manually calibrated piecewise-linear lookup tables. Their difference generates the steering demand. A steering actuator applies 140 ms smoothing, a 0.005 rad deadband and a 0.9 rad/s rate limit to reduce jitter from brief firing-rate fluctuations. This engineered interface affects actual vehicle motion. Braking is the brake pool's mean rate divided by 240, clipped to 0–1. Measuring isolated pathway responses and setting a mapping is calibration, not training network weights.

A simplified bicycle model updates the car from speed, wheelbase, steering and grip. Target speed, acceleration limits, collisions and stop-line constraints are explicitly programmed. There is no independently trained fly throttle population.

The fly body and forelegs are visual characters. Wheel angle follows actual vehicle steering; interpolation between approximately 20 Hz state updates makes the wheel and limbs move smoothly. Inverse kinematics keeps the forelegs on the wheel rim, retaining the pose when targets are unchanged and stopping iterations within the contact tolerance. Pause freezes the motion and reset restores the initial grip. This illustrates the output; it is not a complete brain-to-muscle simulation.

## 6. Other vehicles

Four additional cars travel through the city: two in the same direction and two in the opposite direction. Conventional traffic controllers move them along their lanes, stop for signals and pedestrians, maintain following distance and stop at obstacles. These cars have no fly brain.

The main car senses their current positions. A nearby leading vehicle increases brake stimulation and triggers the traffic supervisor's speed limit. Oncoming vehicles occupying its travel space can also cause slowing. Collision checks use oriented, approximately rectangular vehicle footprints.

The Other vehicles toggle changes traffic immediately. Cars, pedestrians, signals and neurons share simulation time: all pause together and reset to their initial state. The surrounding cars follow a closed street loop, without learned visual driving, free lane changing or complex route navigation.

## 7. How do we know the circuit participates?

The project includes two causal checks:

- Set all effective synaptic signs to zero: stimulated input neurons can still spike, but downstream readout disappears and the car cannot start from rest.
- Disconnect neural output in the interface: the neural simulation continues while the car brakes; reconnecting restores control.

These checks show that this implementation depends on neural propagation. They do not show that a biological fly understands driving, or that its wiring is superior to other networks. The latter would require random-network, rewired-graph and conventional-controller baselines.

Colored points use each neuron's actual last simulated spike time, with a default 120 ms afterglow and optional longer windows. Gray-blue points are anatomical context. Thin lines are illustrative straight connections between somas, not reconstructed neurites. Approximately 4,000 strong connections are displayed at most; all circuit connections still participate in computation. Rotating the brain or increasing afterglow changes only the display, not firing.

## 8. Does this version learn to drive?

No training is required to run the current demonstration because its encoder, planner, traffic rules and readout are engineered. It has no reward function, optimizer, synaptic plasticity or learned driving policy. Reset does not retain learned experience.

A future learning experiment could hold the connectome fixed while training an input encoder or output readout. Alternatively, it could explicitly permit selected synapses to change. That would create a different model: all trained parameters must be documented, and modified weights must not be described as untouched anatomical connection strengths.

A testable learning version would need to:

1. Define objectives such as route completion, collisions, red-light violations and smoothness.
2. Specify what is trainable: the encoder, readout, synaptic weights or other parameters.
3. Train across roads, traffic densities and starting positions rather than memorizing one loop.
4. Evaluate on unseen streets against the untrained model, random wiring and a conventional controller.
5. Report the contributions of learned behavior and engineered rules separately.

Only then can we assess which driving behaviors the model has learned. The current project is an interactive, inspectable connectome control experiment.

## 9. Reproduce and inspect

Run these commands in the project directory:

```text
npm start
npm test
npm run test:scene
npm run test:realtime
```

Open the printed address, then use the English link or append /en.html to the origin. Start driving, toggle traffic and pedestrians, change lights and grip, add obstacles and watch both firing and vehicle response. Disconnect neural output to compare motion. Pause and rotate the brain to inspect one instant in space.

| File                        | Responsibility                                          |
| --------------------------- | ------------------------------------------------------- |
| scripts/prepare-circuit.py  | Verify data and select the original 1,860-node subgraph |
| scripts/prepare-realtime.py | Build 4,000 / 8,000-node circuits with original edges   |
| scripts/test-realtime.mjs   | Verify expanded models, propagation and driving         |
| dist/lif-core.mjs           | LIF neurons and synaptic propagation                    |
| dist/neural.mjs             | Input pulses and downstream population readout          |
| scripts/calibrate.mjs       | Manual response calibration                             |
| dist/drive-core.mjs         | Road encoding, motor mapping and main-car dynamics      |
| dist/traffic-core.mjs       | Signal and pedestrian schedules                         |
| dist/traffic-cars.mjs       | Other vehicles' rules and state                         |
| dist/brain.mjs              | Live activity at recorded soma positions                |
| scripts/test-drive.mjs      | Propagation ablation, traffic and driving tests         |

This document describes the current implementation. Sources, checksums and licenses appear in the model notes and dist/data/manifest.json. Biological interpretations should remain within the assumptions stated here.

## 10. Why default to 8,000 neurons?

The full classified MaleCNS CNS export contains 166,606 neurons, 25,574,615 directed connections and 124,144,950 synapse counts, including the brain and ventral nerve cord. The 44,971 unclassified/tbc annotation rows are not forced into the neuron set. Connections between classified neurons are not pruned by weight. Soma coordinates are missing for 26,947 classified neurons. The LIF model assigns zero fast synaptic sign to 11,564 neurons whose fast transmitter effects are unmodeled. Dendritic compartments, ion channels and complete neuromodulation remain absent.

An initial local Node.js benchmark took 25.65 seconds to simulate 10 seconds with the full model: approximately 0.39× real time, before browser 3D rendering overhead. It runs but does not meet the real-time goal on that machine, so the website uses smaller real subgraphs.

In local benchmarks without rendering, 60 seconds of simulation took approximately 4.07, 8.51 and 13.10 seconds for 4,000, 8,000 and 12,000 nodes. These measure computational headroom, not browser playback speed. The website targets 1× and reports measured model time divided by wall time without skipping integration or inventing spikes. The default 8,000-node circuit measured approximately 1× in the local browser.

Performance varies with hardware, background work and browser throttling. If the foreground page stays below 0.9×, try 4,000 nodes, then 1,860 if needed. Background-tab throttling does not reflect foreground performance. Neurons, vehicles and traffic share model time and pause together.

Regenerate browser circuits with `python3 scripts/prepare-realtime.py /path/to/full 4000 8000` (requires NumPy). Run `npm run test:realtime` to verify them. `npm run benchmark:realtime` measures installed models and writes work/realtime-benchmark.json.

For the full local experiment, run `python3 scripts/prepare-full-drive.py /path/to/full` to install data in work/full-model, then `npm run test:full` or `npm run benchmark:full`. The website does not download those data. These tests verify simplified full-model firing and propagation beyond the original circuit; they do not demonstrate newly learned driving skills.
