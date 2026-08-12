import { describe, expect, it } from 'vitest';

import {
  CAMERAS,
  cameraById,
  FEED_COUNT,
  markerValue,
  nearbyCameras,
} from '@/lib/cameras';
import { cameraSchema, type Camera } from '@/lib/schema';

/*
 * The camera estate, and the schematic built from it.
 *
 * `nearbyCameras` feeds the detail pane's mile-marker strip — the thing that
 * replaced a map, and the one place an operator reads geography. Its ordering
 * is the whole content of that panel, so it is worth pinning rather than
 * trusting to the order the array happens to be written in.
 */

const CAM_014 = cameraById('CAM-014')!;

describe('the estate', () => {
  it('is the 18 feeds the status bar reports', () => {
    // Pass C draws "18 / 18 feeds live". If this list grows, that caption is
    // wrong on every frame.
    expect(FEED_COUNT).toBe(18);
    expect(CAMERAS).toHaveLength(18);
  });

  it('has unique ids', () => {
    expect(new Set(CAMERAS.map((c) => c.id)).size).toBe(CAMERAS.length);
  });

  it('satisfies the schema every event carries', () => {
    // These are embedded verbatim into detection events, so a camera that
    // fails validation here fails at the ingest boundary later.
    for (const camera of CAMERAS) {
      expect(cameraSchema.safeParse(camera).success).toBe(true);
    }
  });

  it('has markers that parse to a number', () => {
    for (const camera of CAMERAS) {
      expect(Number.isFinite(markerValue(camera))).toBe(true);
      expect(markerValue(camera)).toBeGreaterThan(0);
    }
  });
});

describe('cameraById', () => {
  it('finds a known camera', () => {
    expect(cameraById('CAM-014')?.roadway).toBe('M6');
  });

  it('is undefined for an unknown id rather than throwing', () => {
    expect(cameraById('CAM-000')).toBeUndefined();
  });
});

describe('markerValue', () => {
  it('parses the number out of the printed marker', () => {
    expect(markerValue({ marker: 'MM 42.3' } as Camera)).toBe(42.3);
    expect(markerValue({ marker: 'MP 114' } as Camera)).toBe(114);
  });

  it('is 0 for a marker with no number, rather than NaN', () => {
    // NaN would sort the schematic into nonsense silently; 0 puts it at one end
    // where it is visible.
    expect(markerValue({ marker: 'unknown' } as Camera)).toBe(0);
  });
});

describe('nearbyCameras', () => {
  it('returns the incident camera with one either side, in marker order', () => {
    const near = nearbyCameras(CAM_014);

    expect(near.map((c) => c.id)).toEqual(['CAM-011', 'CAM-014', 'CAM-017']);
    const markers = near.map(markerValue);
    expect([...markers].sort((a, b) => a - b)).toEqual(markers);
  });

  it('includes the incident camera itself', () => {
    for (const camera of CAMERAS) {
      expect(nearbyCameras(camera).map((c) => c.id)).toContain(camera.id);
    }
  });

  it('stays on the same roadway and direction', () => {
    // A "nearby" camera on the opposite carriageway is not nearby in any sense
    // that helps someone deciding where to send a unit.
    for (const camera of CAMERAS) {
      for (const neighbour of nearbyCameras(camera)) {
        expect(neighbour.roadway).toBe(camera.roadway);
        expect(neighbour.direction).toBe(camera.direction);
      }
    }
  });

  it('truncates at the ends of a roadway rather than wrapping', () => {
    const onM6NB = CAMERAS.filter(
      (c) => c.roadway === 'M6' && c.direction === 'NB',
    ).sort((a, b) => markerValue(a) - markerValue(b));

    const first = nearbyCameras(onM6NB[0]!);
    expect(first[0]!.id).toBe(onM6NB[0]!.id);
    expect(first).toHaveLength(2);

    const last = nearbyCameras(onM6NB.at(-1)!);
    expect(last.at(-1)!.id).toBe(onM6NB.at(-1)!.id);
    expect(last).toHaveLength(2);
  });

  it('widens with span — n either side, plus the camera itself', () => {
    expect(nearbyCameras(CAM_014, 1)).toHaveLength(3);
    expect(nearbyCameras(CAM_014, 2).map((c) => c.id)).toEqual([
      'CAM-062',
      'CAM-011',
      'CAM-014',
      'CAM-017',
      'CAM-152',
    ]);
  });

  it('returns just the camera when it is not in the estate', () => {
    // An event can carry a camera this build has never heard of — the detector
    // owns that list, not the dashboard.
    const stranger: Camera = {
      id: 'CAM-999',
      name: 'A road nobody here knows',
      roadway: 'A38',
      direction: 'NB',
      marker: 'MM 3.0',
      laneCount: 2,
      lat: 0,
      lng: 0,
    };

    expect(nearbyCameras(stranger).map((c) => c.id)).toEqual(['CAM-999']);
  });

  it('returns only itself when it is alone on its roadway', () => {
    const solo = CAMERAS.find(
      (c) =>
        CAMERAS.filter(
          (o) => o.roadway === c.roadway && o.direction === c.direction,
        ).length === 1,
    );
    if (solo) expect(nearbyCameras(solo).map((c) => c.id)).toEqual([solo.id]);
  });
});
