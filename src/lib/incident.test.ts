import { describe, expect, it } from 'vitest';

import { cameraById } from '@/lib/cameras';
import {
  flowNoteFor,
  fullLocationOf,
  initialsOf,
  locationOf,
  summaryOf,
  toDetailView,
  toRowView,
} from '@/lib/incident';
import type { Camera, DetectionEvent } from '@/lib/schema';

/*
 * The mapping from a domain event to what the frames show.
 *
 * This module exists specifically so the mapping is testable and so no
 * component can quietly invent a label — every string it produces traces to a
 * caption in Pass C. Until now nothing held it to that.
 */

const CAM_014 = cameraById('CAM-014')!;

const T0 = '2026-08-12T09:00:00.000Z';
const NOW = Date.parse('2026-08-12T09:02:05.000Z');

function event(over: Partial<DetectionEvent> = {}): DetectionEvent {
  return {
    id: 'TEST-1',
    type: 'debris',
    camera: CAM_014,
    lanePosition: 'live_lane',
    laneNumber: 2,
    confidence: 0.9,
    description: 'Object in carriageway.',
    snapshotUrl: '/snapshots/debris.svg',
    detectedAt: T0,
    receivedAt: '2026-08-12T09:00:00.600Z',
    priority: 'high',
    priorityReason: 'High — live lane',
    status: 'new',
    history: [{ at: T0, actor: 'system', action: 'Detected' }],
    ...over,
  };
}

describe('summaryOf', () => {
  it('reads "<type>, <lane position>" the way the rows do', () => {
    expect(summaryOf(event())).toBe('Debris, live lane');
    expect(summaryOf(event({ lanePosition: 'hard_shoulder' }))).toBe(
      'Debris, hard shoulder',
    );
    expect(summaryOf(event({ type: 'stopped_vehicle' }))).toBe(
      'Stopped vehicle, live lane',
    );
  });

  it('renders a wrong-way driver bare', () => {
    // The frames do. The lane adds nothing to a hazard defined by direction.
    expect(summaryOf(event({ type: 'wrong_way_driver' }))).toBe(
      'Wrong-way driver',
    );
  });

  it('drops the lane clause when the position is unconfirmed', () => {
    // "Debris, lane unconfirmed" would read as a location. It is the absence of
    // one.
    expect(
      summaryOf(event({ lanePosition: 'unknown', laneNumber: undefined })),
    ).toBe('Debris');
  });
});

describe('locationOf', () => {
  it('shortens the camera name to the row form', () => {
    expect(locationOf(CAM_014)).toBe('M6 NB · Jct 8–9');
  });

  it('falls back to roadway and direction when there is no detail', () => {
    expect(locationOf({ ...CAM_014, name: 'M6 northbound' } as Camera)).toBe(
      'M6 NB',
    );
  });

  it('keeps the long form for the detail pane', () => {
    expect(fullLocationOf(CAM_014)).toBe('M6 northbound, junction 8–9');
  });
});

describe('initialsOf', () => {
  // The adherence lint scans string literals for raw pixel values, so the size
  // of the owner badge is described in words here rather than measured.
  it('reduces a position to the two characters the owner badge fits', () => {
    expect(initialsOf('Position 3')).toBe('P3');
    expect(initialsOf('Position 12')).toBe('P1');
  });

  it('handles a personal name, which is what a real deployment would carry', () => {
    expect(initialsOf('J. Kavanagh')).toBe('JK');
    expect(initialsOf('Rohitha')).toBe('R');
  });

  it('never exceeds two characters', () => {
    expect(initialsOf('one two three four')).toHaveLength(2);
  });

  it('is empty for an empty name rather than throwing', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});

describe('flowNoteFor', () => {
  it('earns its second line only for a wrong-way driver', () => {
    expect(flowNoteFor(event({ type: 'wrong_way_driver' }))).toBe(
      '↓ flow\n↑ wrong-way',
    );
    expect(flowNoteFor(event())).toBeUndefined();
    expect(flowNoteFor(event({ type: 'congestion' }))).toBeUndefined();
  });
});

describe('toRowView', () => {
  it('carries the four things the row always shows', () => {
    expect(toRowView(event(), NOW)).toMatchObject({
      priority: 'high',
      camera: 'CAM-014',
      summary: 'Debris, live lane',
      location: 'M6 NB · Jct 8–9',
      age: '02:04',
    });
  });

  it('is unread only while the incident is new', () => {
    expect(toRowView(event(), NOW).unread).toBe(true);
    expect(toRowView(event({ status: 'acknowledged' }), NOW).unread).toBe(
      false,
    );
    expect(toRowView(event({ status: 'dispatched' }), NOW).unread).toBe(false);
  });

  it('omits owner and dispatch entirely when there are none', () => {
    // Omitted rather than undefined: the props are spread onto a component with
    // exactOptionalPropertyTypes, where the two are not the same thing.
    const view = toRowView(event(), NOW);
    expect('owner' in view).toBe(false);
    expect('dispatch' in view).toBe(false);
    expect('seenBefore' in view).toBe(false);
  });

  it('reduces an owner to initials', () => {
    expect(toRowView(event({ assignedTo: 'Position 3' }), NOW).owner).toBe(
      'P3',
    );
  });

  it('formats a dispatch as unit and ETA', () => {
    expect(
      toRowView(event({ dispatch: { unit: '12', etaMinutes: 4 } }), NOW)
        .dispatch,
    ).toEqual({ unit: '12', eta: '4 min' });
  });

  it('lower-cases the seen-before reason so the tag reads as prose', () => {
    expect(
      toRowView(event({ seenBefore: { reason: 'Shadow', at: T0 } }), NOW)
        .seenBefore,
    ).toEqual({ reason: 'shadow' });
  });
});

describe('toDetailView', () => {
  it('carries the priority argument, not just the level', () => {
    // Rendering "critical" without the reasoning would be showing the
    // conclusion and hiding the argument.
    expect(toDetailView(event()).priorityReason).toBe('High — live lane');
  });

  it('shows the pipeline latency between detection and receipt', () => {
    expect(toDetailView(event()).detectionLatency).toBe('0.6s');
  });

  it('marks the incident camera within the nearby strip, once', () => {
    const nearby = toDetailView(event()).nearbyCameras;
    expect(nearby.filter((c) => c.isIncident)).toHaveLength(1);
    expect(nearby.find((c) => c.isIncident)?.id).toBe('CAM-014');
  });

  it('attributes each audit line to system or to a person', () => {
    const view = toDetailView(
      event({
        history: [
          { at: T0, actor: 'system', action: 'Detected · confidence 90%' },
          { at: T0, actor: 'Position 3', action: 'Acknowledged' },
        ],
      }),
    );

    expect(view.audit.map((entry) => entry.action)).toEqual([
      'Detected · confidence 90% (system)',
      'Acknowledged (Position 3)',
    ]);
  });

  it('passes the detection box through only when the detector sent one', () => {
    expect('detection' in toDetailView(event())).toBe(false);
    expect(
      toDetailView(event({ detectionBox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }))
        .detection,
    ).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4, confidence: 0.9 });
  });

  it('formats the seen-before note with its own timestamp', () => {
    const view = toDetailView(
      event({ seenBefore: { reason: 'Sensor glare', at: T0 } }),
    );
    expect(view.seenBefore?.reason).toBe('sensor glare');
    expect(view.seenBefore?.at).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('omits acknowledgement and dispatch until they happen', () => {
    const view = toDetailView(event());
    expect('acknowledgedBy' in view).toBe(false);
    expect('dispatched' in view).toBe(false);
  });
});
