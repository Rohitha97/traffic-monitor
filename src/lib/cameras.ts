import type { Camera } from '@/lib/schema';

/*
 * The fixed camera estate this sector watches — 18 feeds, which is the number
 * the status bar reports in Pass C ("18 / 18 feeds live").
 *
 * Real coordinates on real British motorways, so the mile markers increase
 * monotonically along each roadway and the nearby-cameras schematic shows a
 * plausible ordering rather than noise. CAM-014 is the wrong-way driver from
 * Pass C frames 2 and 3; CAM-062, CAM-108, CAM-231, CAM-019, CAM-077 and
 * CAM-091 all appear in the frames too, with the same roadways.
 */
export const CAMERAS: readonly Camera[] = [
  {
    id: 'CAM-011',
    name: 'M6 northbound, junction 8 approach',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 41.0',
    laneCount: 3,
    lat: 52.5063,
    lng: -1.9838,
  },
  {
    id: 'CAM-014',
    name: 'M6 northbound, junction 8–9',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 42.3',
    laneCount: 3,
    lat: 52.5218,
    lng: -1.9765,
  },
  {
    id: 'CAM-017',
    name: 'M6 northbound, junction 9 exit',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 43.6',
    laneCount: 3,
    lat: 52.5371,
    lng: -1.9692,
  },
  {
    id: 'CAM-023',
    name: 'M6 northbound, junction 10 approach',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 46.1',
    laneCount: 4,
    lat: 52.5688,
    lng: -1.9904,
  },
  {
    id: 'CAM-038',
    name: 'M42 southbound, junction 1',
    roadway: 'M42',
    direction: 'SB',
    marker: 'MM 12.4',
    laneCount: 3,
    lat: 52.3712,
    lng: -1.9021,
  },
  {
    id: 'CAM-045',
    name: 'M42 southbound, junction 2 approach',
    roadway: 'M42',
    direction: 'SB',
    marker: 'MM 14.8',
    laneCount: 3,
    lat: 52.3498,
    lng: -1.8834,
  },
  {
    id: 'CAM-062',
    name: 'M6 northbound, junction 10a',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 34.7',
    laneCount: 3,
    lat: 52.5901,
    lng: -2.0143,
  },
  {
    id: 'CAM-077',
    name: 'M42 northbound, junction 8',
    roadway: 'M42',
    direction: 'NB',
    marker: 'MM 21.9',
    laneCount: 3,
    lat: 52.4477,
    lng: -1.7812,
  },
  {
    id: 'CAM-091',
    name: 'M25 anti-clockwise, junction 9',
    roadway: 'M25',
    direction: 'WB',
    marker: 'MM 62.3',
    laneCount: 4,
    lat: 51.3211,
    lng: -0.3457,
  },
  {
    id: 'CAM-108',
    name: 'M42 southbound, junction 3a–4',
    roadway: 'M42',
    direction: 'SB',
    marker: 'MM 18.2',
    laneCount: 3,
    lat: 52.3865,
    lng: -1.8299,
  },
  {
    id: 'CAM-119',
    name: 'M25 clockwise, junction 5',
    roadway: 'M25',
    direction: 'EB',
    marker: 'MM 48.7',
    laneCount: 4,
    lat: 51.2896,
    lng: 0.1204,
  },
  {
    id: 'CAM-145',
    name: 'M6 southbound, junction 15',
    roadway: 'M6',
    direction: 'SB',
    marker: 'MM 71.4',
    laneCount: 3,
    lat: 52.9812,
    lng: -2.1734,
  },
  {
    id: 'CAM-152',
    name: 'M6 northbound, junction 9–10',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 44.8',
    laneCount: 3,
    lat: 52.5514,
    lng: -1.9821,
  },
  {
    id: 'CAM-156',
    name: 'M6 southbound, junction 4',
    roadway: 'M6',
    direction: 'SB',
    marker: 'MM 29.6',
    laneCount: 4,
    lat: 52.4433,
    lng: -1.7256,
  },
  {
    id: 'CAM-168',
    name: 'M25 clockwise, junction 6–7',
    roadway: 'M25',
    direction: 'EB',
    marker: 'MM 51.2',
    laneCount: 4,
    lat: 51.2703,
    lng: -0.0871,
  },
  {
    id: 'CAM-203',
    name: 'M6 northbound, junction 11a–12',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 52.9',
    laneCount: 3,
    lat: 52.6712,
    lng: -2.0918,
  },
  {
    id: 'CAM-219',
    name: 'M42 northbound, junction 9',
    roadway: 'M42',
    direction: 'NB',
    marker: 'MM 24.3',
    laneCount: 3,
    lat: 52.4691,
    lng: -1.7604,
  },
  {
    id: 'CAM-231',
    name: 'M6 Toll, junction T1–T2',
    roadway: 'M6 Toll',
    direction: 'NB',
    marker: 'MM 8.5',
    laneCount: 2,
    lat: 52.5934,
    lng: -1.8377,
  },
];

export const FEED_COUNT = CAMERAS.length;

const BY_ID = new Map(CAMERAS.map((camera) => [camera.id, camera]));

export function cameraById(id: string): Camera | undefined {
  return BY_ID.get(id);
}

/**
 * Cameras either side of this one on the same roadway, nearest first —
 * what the detail pane's schematic plots. Parsing the marker rather than
 * storing a separate number keeps one source of truth for position.
 */
export function nearbyCameras(camera: Camera, span = 1): Camera[] {
  const onRoadway = CAMERAS.filter(
    (c) => c.roadway === camera.roadway && c.direction === camera.direction,
  ).sort((a, b) => markerValue(a) - markerValue(b));

  const index = onRoadway.findIndex((c) => c.id === camera.id);
  if (index === -1) return [camera];

  return onRoadway.slice(Math.max(0, index - span), index + span + 1);
}

export function markerValue(camera: Camera): number {
  return Number.parseFloat(camera.marker.replace(/[^\d.]/g, '')) || 0;
}
