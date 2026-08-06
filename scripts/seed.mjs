/*
 * A deterministic 90-second scenario: quiet, a debris call, a stopped vehicle
 * escalating to critical, then a wrong-way driver.
 *
 * Run against a dashboard that is already up:  pnpm seed
 *
 * Plain JavaScript with its own copy of the camera details, deliberately: this
 * stands in for an external detection system, and an external system does not
 * import the dashboard's types. It talks over HTTP like the real thing would,
 * which is also what makes it a fair test of the ingest route's validation.
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:3000';

const CAMERAS = {
  'CAM-014': {
    id: 'CAM-014',
    name: 'M6 northbound, junction 8–9',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 42.3',
    laneCount: 3,
    lat: 52.5218,
    lng: -1.9765,
  },
  'CAM-062': {
    id: 'CAM-062',
    name: 'M6 northbound, junction 10a',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 34.7',
    laneCount: 3,
    lat: 52.5901,
    lng: -2.0143,
  },
  'CAM-091': {
    id: 'CAM-091',
    name: 'M25 anti-clockwise, junction 9',
    roadway: 'M25',
    direction: 'WB',
    marker: 'MM 62.3',
    laneCount: 4,
    lat: 51.3211,
    lng: -0.3457,
  },
  'CAM-108': {
    id: 'CAM-108',
    name: 'M42 southbound, junction 3a–4',
    roadway: 'M42',
    direction: 'SB',
    marker: 'MM 18.2',
    laneCount: 3,
    lat: 52.3865,
    lng: -1.8299,
  },
  'CAM-168': {
    id: 'CAM-168',
    name: 'M25 clockwise, junction 6–7',
    roadway: 'M25',
    direction: 'EB',
    marker: 'MM 51.2',
    laneCount: 4,
    lat: 51.2703,
    lng: -0.0871,
  },
};

/*
 * The scenario. Each entry is what the detector observed — never a priority.
 * The dashboard derives that, which is the whole point of the boundary: you
 * can read this file and still not know what the queue will look like without
 * applying the triage rules.
 */
const SCRIPT = [
  {
    atSeconds: 8,
    camera: 'CAM-091',
    type: 'debris',
    lanePosition: 'hard_shoulder',
    confidence: 0.88,
    description: 'Object on the hard shoulder, roughly 1m across.',
  },
  {
    atSeconds: 22,
    camera: 'CAM-168',
    type: 'congestion',
    lanePosition: 'live_lane',
    laneNumber: 2,
    confidence: 0.94,
    description: 'Average speed below 20mph across lane 2 of 4, queue building.',
  },
  {
    atSeconds: 35,
    camera: 'CAM-062',
    type: 'stopped_vehicle',
    lanePosition: 'hard_shoulder',
    confidence: 0.92,
    description:
      'Vehicle stationary on the hard shoulder for over 6 minutes. Hazard lights not detected.',
  },
  {
    // The escalation: the same class of event, one lane over, is critical.
    atSeconds: 50,
    camera: 'CAM-108',
    type: 'stopped_vehicle',
    lanePosition: 'live_lane',
    laneNumber: 1,
    confidence: 0.9,
    description: 'Vehicle stationary in lane 1 of 3, traffic diverting around it.',
  },
  {
    atSeconds: 68,
    camera: 'CAM-014',
    type: 'wrong_way_driver',
    lanePosition: 'live_lane',
    laneNumber: 2,
    confidence: 0.96,
    description:
      'Vehicle travelling against traffic flow in live lane 2 of 3, approaching Jct 9.',
  },
  {
    // Low confidence: demoted a level and flagged for verification.
    atSeconds: 82,
    camera: 'CAM-091',
    type: 'debris',
    lanePosition: 'live_lane',
    laneNumber: 1,
    confidence: 0.41,
    description: 'Possible debris in lane 1. Low-confidence detection — image contrast was poor.',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(step) {
  const camera = CAMERAS[step.camera];
  const body = {
    type: step.type,
    confidence: step.confidence,
    camera,
    lanePosition: step.lanePosition,
    snapshotUrl: `/snapshots/${step.type}.svg`,
    description: step.description,
    detectedAt: new Date(Date.now() - 600).toISOString(),
    ...(step.laneNumber !== undefined ? { laneNumber: step.laneNumber } : {}),
  };

  const response = await fetch(`${DASHBOARD_URL}/api/events/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!response.ok) {
    console.error(`  ✗ ${step.camera} ${step.type} → ${response.status}`, result);
    return;
  }
  console.log(
    `  ✓ ${String(step.atSeconds).padStart(2)}s  ${step.camera}  ${step.type.padEnd(16)} → ${result.priority}`,
  );
}

async function main() {
  console.log(`Seeding a 90-second scenario against ${DASHBOARD_URL}`);
  console.log('Priorities below are derived by the dashboard, not sent by this script.\n');

  let elapsed = 0;
  for (const step of SCRIPT) {
    await sleep((step.atSeconds - elapsed) * 1000);
    elapsed = step.atSeconds;
    await post(step);
  }

  await sleep(8000);
  console.log('\nScenario complete.');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  console.error(`Is the dashboard running at ${DASHBOARD_URL}?`);
  process.exitCode = 1;
});
