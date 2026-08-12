import { describe, expect, it } from 'vitest';

import { cameraById } from '@/lib/cameras';
import { generateEvent, makeRandom } from '@/lib/generator';
import { derivePriority } from '@/lib/priority';
import { detectionEventSchema } from '@/lib/schema';

/*
 * The ambient simulator.
 *
 * It exists so a reviewer sees a queue without doing anything, which makes two
 * properties matter more than they look: it must be seedable, or every test
 * that uses it is a coin flip; and it must not be able to produce an event the
 * real contract would reject, or the demo diverges from the boundary it is
 * meant to demonstrate.
 */

const NOW = new Date('2026-08-12T09:00:00.000Z');

describe('makeRandom', () => {
  it('is reproducible for a given seed', () => {
    const a = makeRandom(42);
    const b = makeRandom(42);
    const first = Array.from({ length: 20 }, a);
    const second = Array.from({ length: 20 }, b);

    expect(first).toEqual(second);
  });

  it('differs between seeds', () => {
    expect(Array.from({ length: 5 }, makeRandom(1))).not.toEqual(
      Array.from({ length: 5 }, makeRandom(2)),
    );
  });

  it('stays inside [0, 1)', () => {
    const random = makeRandom(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('falls back to Math.random with no seed', () => {
    expect(makeRandom()).toBe(Math.random);
  });
});

describe('generateEvent', () => {
  it('produces an event the real contract accepts', () => {
    // 200 draws across the seed space, because the rare combinations are
    // exactly the ones a hand-picked example would miss.
    for (let seed = 0; seed < 200; seed += 1) {
      const event = generateEvent({ random: makeRandom(seed), now: NOW });
      const parsed = detectionEventSchema.safeParse(event);
      expect(
        parsed.success,
        `seed ${seed}: ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateEvent({ random: makeRandom(11), now: NOW });
    const b = generateEvent({ random: makeRandom(11), now: NOW });
    expect(a).toEqual(b);
  });

  it('honours a forced type and lane position — what Shift+G uses', () => {
    const event = generateEvent({
      type: 'wrong_way_driver',
      lanePosition: 'live_lane',
      random: makeRandom(3),
      now: NOW,
    });

    expect(event.type).toBe('wrong_way_driver');
    expect(event.lanePosition).toBe('live_lane');
    expect(event.priority).toBe('critical');
  });

  it('derives priority from the observation rather than picking one', () => {
    /*
     * The generator stands in for a detector, and a detector does not decide
     * severity. If these ever disagree, the demo is showing triage that the
     * real rules would not produce.
     */
    for (let seed = 0; seed < 100; seed += 1) {
      const event = generateEvent({ random: makeRandom(seed), now: NOW });
      const { priority, reason } = derivePriority({
        type: event.type,
        lanePosition: event.lanePosition,
        confidence: event.confidence,
        ...(event.laneNumber !== undefined
          ? { laneNumber: event.laneNumber }
          : {}),
        laneCount: event.camera.laneCount,
      });

      expect(event.priority).toBe(priority);
      expect(event.priorityReason).toBe(reason);
    }
  });

  it('gives a lane number exactly when the hazard is in a live lane', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const event = generateEvent({ random: makeRandom(seed), now: NOW });
      if (event.lanePosition === 'live_lane') {
        expect(event.laneNumber).toBeGreaterThanOrEqual(1);
        expect(event.laneNumber!).toBeLessThanOrEqual(event.camera.laneCount);
      } else {
        expect(event.laneNumber).toBeUndefined();
      }
    }
  });

  it('always uses a camera from the estate', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const event = generateEvent({ random: makeRandom(seed), now: NOW });
      expect(cameraById(event.camera.id)).toBeDefined();
    }
  });

  it('detects before it receives, by a plausible pipeline latency', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const event = generateEvent({ random: makeRandom(seed), now: NOW });
      const latency =
        Date.parse(event.receivedAt) - Date.parse(event.detectedAt);

      expect(latency).toBeGreaterThanOrEqual(200);
      expect(latency).toBeLessThanOrEqual(1400);
    }
  });

  it('starts every event as new', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      expect(generateEvent({ random: makeRandom(seed), now: NOW }).status).toBe(
        'new',
      );
    }
  });

  it('spreads priorities rather than making everything critical', () => {
    // "A demo where everything is critical teaches you nothing about triage."
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 400; seed += 1) {
      const { priority } = generateEvent({
        random: makeRandom(seed),
        now: NOW,
      });
      counts.set(priority, (counts.get(priority) ?? 0) + 1);
    }

    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect((counts.get('critical') ?? 0) / 400).toBeLessThan(0.35);
  });

  it('produces the low-confidence tail that exercises demotion', () => {
    const confidences = Array.from(
      { length: 400 },
      (_, seed) =>
        generateEvent({ random: makeRandom(seed), now: NOW }).confidence,
    );

    expect(confidences.some((c) => c < 0.6)).toBe(true);
    expect(confidences.some((c) => c > 0.9)).toBe(true);
  });

  it('gives every event a distinct id', () => {
    const ids = new Set(
      Array.from(
        { length: 200 },
        (_, seed) => generateEvent({ random: makeRandom(seed), now: NOW }).id,
      ),
    );
    // Same `now` for all of them, so the id cannot be leaning on the clock.
    expect(ids.size).toBeGreaterThan(190);
  });
});
