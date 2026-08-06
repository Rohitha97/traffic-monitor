/*
 * The detection system, standing in for the real thing.
 *
 * This exists to make the boundary the brief describes — the layer between the
 * detection system and the people — visible in the architecture rather than
 * only in prose. It is a separate process that knows nothing about the
 * dashboard except its ingest URL, and it posts observations, never priorities:
 * what to do about a stopped vehicle in lane 1 is the dashboard's judgement,
 * not the detector's.
 *
 * Running it in-process behind SIM_MODE=internal is the cheaper option and is
 * still supported (see the stream route) — but then the boundary is a function
 * call, and a reviewer cannot see it in `docker compose ps`.
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:3000';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 20_000);

const CAMERAS = [
  { id: 'CAM-011', name: 'M6 northbound, junction 8 approach', roadway: 'M6', direction: 'NB', marker: 'MM 41.0', laneCount: 3, lat: 52.5063, lng: -1.9838 },
  { id: 'CAM-014', name: 'M6 northbound, junction 8–9', roadway: 'M6', direction: 'NB', marker: 'MM 42.3', laneCount: 3, lat: 52.5218, lng: -1.9765 },
  { id: 'CAM-038', name: 'M42 southbound, junction 1', roadway: 'M42', direction: 'SB', marker: 'MM 12.4', laneCount: 3, lat: 52.3712, lng: -1.9021 },
  { id: 'CAM-062', name: 'M6 northbound, junction 10a', roadway: 'M6', direction: 'NB', marker: 'MM 34.7', laneCount: 3, lat: 52.5901, lng: -2.0143 },
  { id: 'CAM-077', name: 'M42 northbound, junction 8', roadway: 'M42', direction: 'NB', marker: 'MM 21.9', laneCount: 3, lat: 52.4477, lng: -1.7812 },
  { id: 'CAM-091', name: 'M25 anti-clockwise, junction 9', roadway: 'M25', direction: 'WB', marker: 'MM 62.3', laneCount: 4, lat: 51.3211, lng: -0.3457 },
  { id: 'CAM-108', name: 'M42 southbound, junction 3a–4', roadway: 'M42', direction: 'SB', marker: 'MM 18.2', laneCount: 3, lat: 52.3865, lng: -1.8299 },
  { id: 'CAM-168', name: 'M25 clockwise, junction 6–7', roadway: 'M25', direction: 'EB', marker: 'MM 51.2', laneCount: 4, lat: 51.2703, lng: -0.0871 },
  { id: 'CAM-231', name: 'M6 Toll, junction T1–T2', roadway: 'M6 Toll', direction: 'NB', marker: 'MM 8.5', laneCount: 2, lat: 52.5934, lng: -1.8377 },
];

// Weighted so the mix is roughly 60% low/medium, 30% high, 10% critical once
// the dashboard applies its rules. A demo where everything is critical teaches
// a reviewer nothing about triage.
const TYPES = [
  { type: 'congestion', weight: 34, lanes: { live_lane: 80, unknown: 20 } },
  { type: 'stopped_vehicle', weight: 26, lanes: { hard_shoulder: 70, live_lane: 12, off_carriageway: 13, unknown: 5 } },
  { type: 'debris', weight: 22, lanes: { hard_shoulder: 55, live_lane: 30, off_carriageway: 10, unknown: 5 } },
  { type: 'smoke_fire', weight: 8, lanes: { off_carriageway: 40, hard_shoulder: 35, live_lane: 25 } },
  { type: 'pedestrian', weight: 6, lanes: { hard_shoulder: 70, live_lane: 20, off_carriageway: 10 } },
  { type: 'wrong_way_driver', weight: 4, lanes: { live_lane: 90, unknown: 10 } },
];

const DESCRIPTIONS = {
  stopped_vehicle: (l) => `Vehicle stationary in ${l} for over 4 minutes. Hazard lights not detected.`,
  wrong_way_driver: (l) => `Vehicle travelling against traffic flow in ${l}, approaching the next junction.`,
  debris: (l) => `Object in the carriageway at ${l}, roughly 1m across.`,
  congestion: (l) => `Average speed below 20mph across ${l}, queue building upstream.`,
  pedestrian: (l) => `Person detected on foot at ${l}, moving against traffic.`,
  smoke_fire: (l) => `Smoke plume detected at ${l}, source not yet visible.`,
};

const pick = (weights) => {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
};

function observe() {
  const type = pick(Object.fromEntries(TYPES.map((t) => [t.type, t.weight])));
  const lanes = TYPES.find((t) => t.type === type).lanes;
  const lanePosition = pick(lanes);
  const camera = CAMERAS[Math.floor(Math.random() * CAMERAS.length)];
  const laneNumber =
    lanePosition === 'live_lane' ? 1 + Math.floor(Math.random() * camera.laneCount) : undefined;

  // 15% of detections land below the confidence threshold, which is what
  // exercises the demotion rule and the "needs verification" treatment.
  const confidence =
    Math.random() < 0.15 ? 0.3 + Math.random() * 0.29 : 0.72 + Math.random() * 0.27;

  const laneText =
    laneNumber !== undefined
      ? `lane ${laneNumber} of ${camera.laneCount}`
      : lanePosition === 'hard_shoulder'
        ? 'the hard shoulder'
        : lanePosition === 'off_carriageway'
          ? 'the verge'
          : 'an unconfirmed position';

  return {
    type,
    camera,
    lanePosition,
    confidence: Number(confidence.toFixed(2)),
    snapshotUrl: `/snapshots/${type}.svg`,
    description: DESCRIPTIONS[type](laneText),
    detectedAt: new Date(Date.now() - (200 + Math.floor(Math.random() * 1200))).toISOString(),
    ...(laneNumber !== undefined ? { laneNumber } : {}),
  };
}

async function emit() {
  const observation = observe();
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observation),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error(`✗ ${response.status}`, result);
      return;
    }
    console.log(`✓ ${observation.camera.id} ${observation.type} → ${result.priority}`);
  } catch (error) {
    // The dashboard restarting is expected and must not kill the simulator.
    console.error(`✗ ingest unreachable: ${error.message}`);
  }
}

/*
 * Poisson-ish rather than a fixed metronome: real detections arrive in clusters
 * and lulls, and a perfectly regular beat lets a reviewer predict the next
 * event — the one thing a triage demo should not do.
 */
function scheduleNext() {
  const delay = Math.max(2000, -Math.log(1 - Math.random()) * INTERVAL_MS);
  setTimeout(async () => {
    await emit();
    scheduleNext();
  }, delay);
}

console.log(`detector-sim → ${DASHBOARD_URL}, mean interval ${INTERVAL_MS}ms`);
scheduleNext();
