// Activity is measured in simulation time, from actual last-spike timestamps.
// The display window never changes the network or its input currents.
export const ACTIVITY_WINDOWS = Object.freeze([120, 500, 1000]);
export function spikeActivity(
  last,
  time,
  windowMs = 500,
  values = new Float32Array(last?.length || 0),
) {
  if (!ACTIVITY_WINDOWS.includes(windowMs)) throw Error('Invalid activity window');
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const stamp = last?.[i],
      age = time - stamp;
    const active = Number.isFinite(stamp) && stamp >= 0 && age >= 0 && age < windowMs;
    values[i] = active ? 0.18 + 0.82 * (1 - age / windowMs) : 0;
    if (active) count++;
  }
  return {
    count,
    total: values.length,
    percent: values.length ? (100 * count) / values.length : 0,
    windowMs,
    values,
  };
}
