import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CAMERAS } from '@/lib/cameras';
import { frameFor, hasFootage } from '@/lib/footage';
import { makeRandom } from '@/lib/generator';

import manifest from '../../public/footage/manifest.json';

/*
 * The manifest describes files. These assertions check that it describes files
 * that are actually there.
 *
 * That is the whole risk with a build-time pipeline whose output is committed:
 * the manifest and the stills are written by one script but reviewed as a diff,
 * and a rebuild that changes the frame count while somebody reverts half the
 * binaries leaves a manifest pointing at nothing. The app would then render a
 * broken image in the one panel whose job is to be evidence.
 */

const PUBLIC = join(process.cwd(), 'public');

describe('the footage manifest', () => {
  it('names the source, so attribution cannot drift from the assets', () => {
    // CC BY requires attribution, and an attribution file that disagrees with
    // what shipped is worse than none. ATTRIBUTION.md carries the same values.
    expect(manifest.source).toMatchObject({
      author: 'Karol Majek',
      license: 'CC BY 3.0',
      url: 'https://www.youtube.com/watch?v=MNn9qKG2UFI',
    });
  });

  it('describes six cameras', () => {
    expect(Object.keys(manifest.cameras)).toHaveLength(6);
  });

  it('only names cameras that exist in the seed data', () => {
    // A crop mapped to an id nothing renders is footage nobody will ever see.
    const known = new Set(CAMERAS.map((camera) => camera.id));
    for (const id of Object.keys(manifest.cameras)) {
      expect(known, `${id} is not a seed camera`).toContain(id);
    }
  });

  it('only maps cameras whose lane count matches the crop', () => {
    /*
     * `detection.ts` divides the carriageway by the camera's lane count to
     * place boxes. Every crop frames a three-lane view, so mapping a four-lane
     * camera onto one would put every box in the wrong lane — the exact
     * incoherence that module exists to prevent, reintroduced through data.
     */
    for (const id of Object.keys(manifest.cameras)) {
      const camera = CAMERAS.find((c) => c.id === id)!;
      expect(camera.laneCount, `${id}`).toBe(3);
    }
  });

  it('points at stills that are actually committed', () => {
    for (const [id, footage] of Object.entries(manifest.cameras)) {
      for (const frame of footage.frames) {
        const path = join(PUBLIC, frame.src);
        expect(existsSync(path), `${id} ${frame.src} is missing`).toBe(true);
      }
    }
  });

  it('points at loops that are actually committed, in both formats', () => {
    for (const [id, footage] of Object.entries(manifest.cameras)) {
      for (const src of [footage.loop.mp4, footage.loop.webm]) {
        expect(existsSync(join(PUBLIC, src)), `${id} ${src}`).toBe(true);
      }
    }
  });

  it('gives every camera 20–30 frames, indexed from zero without gaps', () => {
    for (const [id, footage] of Object.entries(manifest.cameras)) {
      expect(footage.frames.length, id).toBeGreaterThanOrEqual(20);
      expect(footage.frames.length, id).toBeLessThanOrEqual(30);
      expect(footage.frames.map((frame) => frame.index)).toEqual(
        footage.frames.map((_, index) => index),
      );
    }
  });

  it('keeps every frame inside the segment it was cut from', () => {
    // `offsetSeconds` is a position in the original clip. A frame claiming a
    // second the segment never covered would make the manifest a story rather
    // than a record.
    const { segmentStartSeconds, segmentDurationSeconds } = manifest.source;
    const end = segmentStartSeconds + segmentDurationSeconds;

    for (const [id, footage] of Object.entries(manifest.cameras)) {
      for (const frame of footage.frames) {
        expect(frame.offsetSeconds, id).toBeGreaterThanOrEqual(
          segmentStartSeconds,
        );
        expect(frame.offsetSeconds, id).toBeLessThanOrEqual(end);
      }
    }
  });

  it('gives each camera its own window, so the wall is not synchronised', () => {
    // Six tiles cutting at the same instant would give the whole thing away in
    // one frame.
    const starts = Object.values(manifest.cameras).map(
      (footage) => footage.frames[0]!.offsetSeconds,
    );
    expect(new Set(starts).size).toBe(starts.length);
  });
});

describe('hasFootage', () => {
  it('is true for the mapped cameras and false for the rest', () => {
    expect(hasFootage('CAM-014')).toBe(true);
    expect(hasFootage('CAM-091')).toBe(false);
  });

  it('is false rather than throwing for a camera that does not exist', () => {
    expect(hasFootage('CAM-000')).toBe(false);
  });
});

describe('frameFor', () => {
  it('returns a frame from the requested camera', () => {
    const frame = frameFor('CAM-014', makeRandom(3));
    expect(frame?.src).toMatch(/^\/footage\/CAM-014\/frames\/\d+\.jpg$/);
  });

  it('is undefined for a camera without footage, rather than borrowing one', () => {
    // Showing CAM-014's road as evidence for an incident on CAM-091 would be
    // fabricating the one thing an operator is being asked to trust.
    expect(frameFor('CAM-091', makeRandom(3))).toBeUndefined();
    expect(frameFor('CAM-000', makeRandom(3))).toBeUndefined();
  });

  it('picks the same frame twice from the same seed', () => {
    expect(frameFor('CAM-014', makeRandom(9))).toEqual(
      frameFor('CAM-014', makeRandom(9)),
    );
  });

  it('spreads across the window rather than returning one frame forever', () => {
    const seen = new Set(
      Array.from(
        { length: 60 },
        (_, seed) => frameFor('CAM-014', makeRandom(seed))?.index,
      ),
    );
    expect(seen.size).toBeGreaterThan(5);
  });
});
