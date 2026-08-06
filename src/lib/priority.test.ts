import { describe, expect, it } from 'vitest';

import { derivePriority, LOW_CONFIDENCE_THRESHOLD } from '@/lib/priority';
import { EVENT_TYPES, LANE_POSITIONS, PRIORITIES } from '@/lib/schema';
import type { EventType, LanePosition } from '@/lib/schema';

/*
 * derivePriority is the one piece of domain logic in the build, so it is tested
 * exhaustively rather than by example: every type × lane-position cell is
 * covered, plus the confidence rule and the reason strings the detail pane
 * renders verbatim.
 */

const CONFIDENT = 0.92;
const UNSURE = 0.41;

const at = (
  type: EventType,
  lanePosition: LanePosition,
  confidence = CONFIDENT,
  extra: Partial<Parameters<typeof derivePriority>[0]> = {},
) => derivePriority({ type, lanePosition, confidence, ...extra });

describe('derivePriority — the rules the brief specifies', () => {
  it('always makes a wrong-way driver critical, wherever it is seen', () => {
    for (const lane of LANE_POSITIONS) {
      expect(at('wrong_way_driver', lane).priority).toBe('critical');
    }
  });

  it('makes a pedestrian critical in a live lane and high on the hard shoulder', () => {
    expect(at('pedestrian', 'live_lane').priority).toBe('critical');
    expect(at('pedestrian', 'hard_shoulder').priority).toBe('high');
  });

  it('grades a stopped vehicle by how much of the carriageway it blocks', () => {
    expect(at('stopped_vehicle', 'live_lane').priority).toBe('critical');
    expect(at('stopped_vehicle', 'hard_shoulder').priority).toBe('medium');
    expect(at('stopped_vehicle', 'off_carriageway').priority).toBe('low');
  });

  it('makes smoke or fire critical in a live lane and high anywhere else', () => {
    expect(at('smoke_fire', 'live_lane').priority).toBe('critical');
    expect(at('smoke_fire', 'hard_shoulder').priority).toBe('high');
    expect(at('smoke_fire', 'off_carriageway').priority).toBe('high');
  });

  it('makes debris high in a live lane and medium elsewhere', () => {
    expect(at('debris', 'live_lane').priority).toBe('high');
    expect(at('debris', 'hard_shoulder').priority).toBe('medium');
    expect(at('debris', 'off_carriageway').priority).toBe('medium');
  });

  it('makes congestion medium, or high when the same camera repeats inside 10 minutes', () => {
    expect(at('congestion', 'live_lane').priority).toBe('medium');
    expect(
      at('congestion', 'live_lane', CONFIDENT, { repeatWithinWindow: true })
        .priority,
    ).toBe('high');
  });
});

describe('derivePriority — the confidence rule', () => {
  it('demotes one level below the threshold and flags for verification', () => {
    const sure = at('stopped_vehicle', 'live_lane', CONFIDENT);
    const unsure = at('stopped_vehicle', 'live_lane', UNSURE);

    expect(sure.priority).toBe('critical');
    expect(unsure.priority).toBe('high');
    expect(unsure.lowConfidence).toBe(true);
    expect(unsure.reason).toContain('Low confidence — verify');
    expect(sure.reason).not.toContain('Low confidence');
  });

  it('never demotes a wrong-way driver, however unsure the model is', () => {
    // The one asymmetry in the model: under-reacting here is unrecoverable,
    // over-reacting is cheap.
    const unsure = at('wrong_way_driver', 'live_lane', 0.05);
    expect(unsure.priority).toBe('critical');
    expect(unsure.lowConfidence).toBe(false);
    expect(unsure.reason).not.toContain('Low confidence');
  });

  it('treats the threshold as exclusive — exactly 0.6 does not demote', () => {
    expect(
      at('stopped_vehicle', 'live_lane', LOW_CONFIDENCE_THRESHOLD).priority,
    ).toBe('critical');
    expect(
      at('stopped_vehicle', 'live_lane', LOW_CONFIDENCE_THRESHOLD - 0.001)
        .priority,
    ).toBe('high');
  });

  it('cannot demote below low', () => {
    const result = at('stopped_vehicle', 'off_carriageway', UNSURE);
    expect(result.priority).toBe('low');
    expect(result.lowConfidence).toBe(true);
  });

  it('demotes a repeat congestion detection back to medium', () => {
    const result = at('congestion', 'live_lane', UNSURE, {
      repeatWithinWindow: true,
    });
    expect(result.priority).toBe('medium');
  });
});

describe('derivePriority — the unspecified cells, decided by asymmetry of cost', () => {
  it('treats a pedestrian with an unconfirmed lane as if in a live lane', () => {
    expect(at('pedestrian', 'unknown').priority).toBe('critical');
  });

  it('places a stopped vehicle with an unconfirmed lane between its two outcomes', () => {
    expect(at('stopped_vehicle', 'unknown').priority).toBe('high');
    expect(at('stopped_vehicle', 'live_lane').priority).toBe('critical');
    expect(at('stopped_vehicle', 'hard_shoulder').priority).toBe('medium');
  });

  it('does not escalate debris or congestion on an unconfirmed lane', () => {
    // Neither has an unrecoverable outcome; escalating them would manufacture
    // the alert fatigue Pass A names as a failure mode.
    expect(at('debris', 'unknown').priority).toBe('medium');
    expect(at('congestion', 'unknown').priority).toBe('medium');
  });
});

describe('derivePriority — the reason, which is rendered verbatim', () => {
  it('names the lane and the total when the detector localised it', () => {
    const result = at('wrong_way_driver', 'live_lane', CONFIDENT, {
      laneNumber: 2,
      laneCount: 3,
    });
    expect(result.reason).toBe(
      'Critical — vehicle against traffic flow, live lane 2 of 3',
    );
  });

  it('omits the total when the camera lane count is unknown', () => {
    const result = at('debris', 'live_lane', CONFIDENT, { laneNumber: 1 });
    expect(result.reason).toBe('High — debris in live lane 1');
  });

  it('falls back to the bare lane position when nothing was localised', () => {
    expect(at('stopped_vehicle', 'hard_shoulder').reason).toBe(
      'Medium — stopped on the hard shoulder, live lanes clear',
    );
  });

  it('always opens with the derived level, so the level and its argument agree', () => {
    for (const type of EVENT_TYPES) {
      for (const lane of LANE_POSITIONS) {
        for (const confidence of [UNSURE, CONFIDENT]) {
          const { priority, reason } = at(type, lane, confidence);
          expect(reason.startsWith(`${title(priority)} — `)).toBe(true);
        }
      }
    }
  });
});

describe('derivePriority — total and pure', () => {
  it('returns a valid priority and a non-empty reason for every input cell', () => {
    for (const type of EVENT_TYPES) {
      for (const lane of LANE_POSITIONS) {
        for (const confidence of [0, 0.3, 0.59, 0.6, 0.95, 1]) {
          const result = at(type, lane, confidence);
          expect(PRIORITIES).toContain(result.priority);
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('is deterministic', () => {
    const input = {
      type: 'smoke_fire',
      lanePosition: 'live_lane',
      confidence: 0.77,
      laneNumber: 1,
      laneCount: 4,
    } as const;
    expect(derivePriority(input)).toEqual(derivePriority(input));
  });
});

function title(priority: string) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
