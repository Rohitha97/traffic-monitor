import type { Metadata } from 'next';

import { BufferedEventsBar } from '@/components/BufferedEventsBar';
import { CameraSnapshot } from '@/components/CameraSnapshot';
import { CriticalBanner } from '@/components/CriticalBanner';
import { DismissedStrip } from '@/components/DismissedStrip';
import { EmptyQueue } from '@/components/EmptyQueue';
import {
  IncidentDetail,
  type IncidentDetailData,
} from '@/components/IncidentDetail';
import { IncidentRow } from '@/components/IncidentRow';
import { LowConfidenceCard } from '@/components/LowConfidenceCard';
import { OfflineNotice } from '@/components/OfflineNotice';
import { PriorityChip } from '@/components/PriorityChip';
import { StatusBar } from '@/components/StatusBar';
import { PRIORITIES } from '@/lib/priority';

import { DialogDemos } from './DialogDemos';

export const metadata: Metadata = {
  title: 'Component states — Incident Monitor',
};

/*
 * The component state matrix.
 *
 * Every state drawn in Pass C, rendered from the real components with no
 * mocking of their internals — so a reviewer with Pass C frame 4 open can diff
 * this page against it directly. The captions are the design's own.
 *
 * Development-only: next.config.ts rewrites /dev/* to 404 in production.
 *
 * Sample data is lifted verbatim from Pass C (CAM-014's wrong-way driver runs
 * through frames 1–3) so the values match the frames as well as the layout.
 */

function Section({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 border-b border-border-hairline pb-2">
        <h2 className="text-title font-semibold text-text-primary">{title}</h2>
        <span className="text-micro tracking-field font-semibold text-text-secondary uppercase">
          {source}
        </span>
      </div>
      {children}
    </section>
  );
}

function State({
  id,
  label,
  caption,
  width = 'w-108 flex-none',
  children,
}: {
  /**
   * Stable anchor for the visual-regression suite, which screenshots this
   * element rather than the page. Screenshotting the component alone keeps
   * the dev-server overlay, the section headings and the neighbouring states
   * out of the frame, so a diff can only be caused by the component itself.
   *
   * The list of ids is asserted in e2e/visual.spec.ts: adding a state here
   * without adding a test there fails the suite rather than silently going
   * uncovered.
   */
  id: string;
  label: string;
  caption?: string;
  /** Pass 'flex-1 min-w-0' for components that should take the full row. */
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-kicker w-38 flex-none font-medium text-text-secondary">
        {label}
      </span>
      <div data-vrt={id} className={`${width} bg-ground`}>
        {children}
      </div>
      {caption && (
        <p className="text-kicker w-80 flex-none font-medium text-text-secondary">
          {caption}
        </p>
      )}
    </div>
  );
}

const INCIDENT: IncidentDetailData = {
  priority: 'critical',
  summary: 'Wrong-way driver',
  camera: 'CAM-014',
  location: 'M6 northbound, Jct 8–9',
  mileMarker: 'MM 42.3',
  priorityReason: 'Critical — live lane 2 of 3, junction approach',
  description:
    'vehicle travelling against traffic flow in live lane 2 of 3, approaching Jct 9.',
  detectionLatency: '0.6s',
  confidence: 0.96,
  capturedAt: '02:14:07',
  snapshotState: 'empty',
  detection: { x: 0.36, y: 0.28, w: 0.24, h: 0.36, confidence: 0.96 },
  nearbyCameras: [
    { id: 'CAM-011', mileMarker: 41.0 },
    { id: 'CAM-014', mileMarker: 42.3, isIncident: true },
    { id: 'CAM-017', mileMarker: 43.6 },
  ],
  flowNote: '↓ flow\n↑ wrong-way',
  audit: [
    { at: '02:14:07', action: 'Detected · confidence 96% (system)' },
    { at: '02:14:07', action: 'Priority set Critical (system)' },
    {
      at: '02:14:19',
      action:
        'Unacknowledged 20s — banner re-fired, pushed to supervisor (system)',
    },
    { at: '02:14:41', action: 'Acknowledged (Position 3)' },
  ],
};

export default function ComponentStatesPage() {
  return (
    <div className="flex min-h-dvh flex-col gap-12 bg-ground p-10">
      <header className="flex flex-col gap-2">
        <p className="text-micro tracking-kicker font-semibold text-text-secondary uppercase">
          Development only · excluded from the production build
        </p>
        <h1 className="text-dialog font-semibold text-text-primary">
          Component state matrix
        </h1>
        <p className="text-caption max-w-205 font-medium text-text-secondary">
          Every state drawn in Pass C, rendered from the real components.
          Captions are the design&rsquo;s own, so this page can be diffed
          directly against the frames. Snapshot stills arrive in phase 3; the
          evidence frame shows its empty and failed states here.
        </p>
      </header>

      <Section title="Status bar" source="Pass C frames 1–2">
        <div className="flex flex-col gap-3">
          {(['live', 'reconnecting', 'offline'] as const).map((state) => (
            <State
              key={state}
              id={`status-bar/${state}`}
              label={state}
              width="flex-1 min-w-0"
            >
              <StatusBar
                connection={state}
                feeds={{ online: 18, total: 18 }}
                counts={{ critical: 1, high: 2, medium: 5, low: 4 }}
                localTime="02:19:44"
                utcTime="01:19:44"
                muted
              />
            </State>
          ))}
          <State
            id="status-bar/history-local"
            label="history local"
            width="flex-1 min-w-0"
          >
            <StatusBar
              connection="live"
              history="local"
              feeds={{ online: 18, total: 18 }}
              counts={{ critical: 1, high: 2, medium: 5, low: 4 }}
              localTime="02:19:44"
              utcTime="01:19:44"
              muted
            />
          </State>

          <State id="status-bar/unmuted" label="unmuted" width="flex-1 min-w-0">
            <StatusBar
              connection="live"
              feeds={{ online: 18, total: 18 }}
              counts={{ critical: 1, high: 2, medium: 5, low: 4 }}
              localTime="02:19:44"
              utcTime="01:19:44"
              muted={false}
            />
          </State>
        </div>
      </Section>

      <Section title="Priority chip" source="Pass B §02 · four ramps">
        <div className="flex flex-col gap-3">
          {PRIORITIES.map((priority) => (
            <State
              key={priority}
              id={`priority-chip/${priority}`}
              label={priority}
              width="w-40"
              caption="Colour, border weight, shape, glyph and label — five cues, so a colour-blind operator on a badly calibrated monitor still reads severity."
            >
              <PriorityChip priority={priority} />
            </State>
          ))}
        </div>
      </Section>

      <Section title="Queue row" source="Pass C frame 4 · state matrix">
        <div
          role="listbox"
          aria-label="Queue row states"
          className="flex flex-col gap-3"
        >
          <State
            id="queue-row/default"
            label="Default"
            caption="Baseline row — no special state."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-077"
              summary="Debris, hard shoulder"
              location="M42 N · Jct 8"
              age="18:09"
            />
          </State>

          <State
            id="queue-row/hovered"
            label="Hovered"
            caption="Pointer over the row — background lifts one step, no colour added."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-077"
              summary="Debris, hard shoulder"
              location="M42 N · Jct 8"
              age="18:09"
              className="shadow-row-hover"
            />
          </State>

          <State
            id="queue-row/focused"
            label="Keyboard-focused"
            caption="↑↓ focus ring — 2px inset, neutral, never the priority colour."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-077"
              summary="Debris, hard shoulder"
              location="M42 N · Jct 8"
              age="18:09"
              className="shadow-row-focus"
            />
          </State>

          <State
            id="queue-row/selected"
            label="Selected"
            caption="Persistent highlight — stays while the detail pane shows it."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-062"
              summary="Stopped vehicle, hard shoulder"
              location="M6 N · Jct 10a"
              age="06:41"
              selected
            />
          </State>

          <State
            id="queue-row/unread"
            label="New & unread"
            caption="Unread dot, bolder text. Clears the moment it’s opened."
          >
            <IncidentRow
              priority="high"
              camera="CAM-108"
              summary="Stopped vehicle, live lane"
              location="M42 S · Jct 3a–4"
              age="00:52"
              unread
            />
          </State>

          <State
            id="queue-row/sla"
            label="Ageing past SLA"
            caption="Age gains weight and an outline tag — contrast, not a new hue."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-019"
              summary="Congestion building"
              location="M25 clockwise · J6–7"
              age="07:42"
              slaBreached
            />
          </State>

          <State
            id="queue-row/acknowledged"
            label="Acknowledged"
            caption="Owner’s initials replace the unread dot. Clock keeps running."
          >
            <IncidentRow
              priority="critical"
              camera="CAM-014"
              summary="Wrong-way driver"
              location="M6 N · Jct 8–9"
              age="00:41"
              owner="JK"
            />
          </State>

          <State
            id="queue-row/dispatched"
            label="Dispatched"
            caption="Calm treatment — unit and ETA replace the raw description."
          >
            <IncidentRow
              priority="critical"
              camera="CAM-014"
              summary="Wrong-way driver"
              location="M6 N · Jct 8–9"
              age="04:12"
              dispatch={{ unit: '12', eta: '4 min' }}
            />
          </State>

          <State
            id="queue-row/arriving"
            label="Critical arriving"
            caption="The tint a critical row carries as it lands, before it settles."
          >
            <IncidentRow
              priority="critical"
              camera="CAM-014"
              summary="Wrong-way driver, live lane 2 of 3"
              location="M6 N · Jct 8–9"
              age="00:00"
              unread
              arriving
            />
          </State>

          <State
            id="queue-row/claiming"
            label="Claiming"
            caption="Enter pressed, server not yet answered. The optimistic beat, with somewhere to land if the answer is no."
          >
            <IncidentRow
              priority="critical"
              camera="CAM-014"
              summary="Wrong-way driver"
              location="M6 N · Jct 8–9"
              age="00:03"
              unread
              claim={{ state: 'pending' }}
            />
          </State>

          <State
            id="queue-row/taken"
            label="Taken by another position"
            caption="The rollback. Names the desk that got there first, so the operator moves on instead of pressing Enter again."
          >
            <IncidentRow
              priority="critical"
              camera="CAM-014"
              summary="Wrong-way driver"
              location="M6 N · Jct 8–9"
              age="00:05"
              claim={{ state: 'rejected', by: 'Position 3' }}
            />
          </State>

          <State
            id="queue-row/seen-before"
            label="Seen before"
            caption="Re-detected within 3 min of being dismissed. The tag carries the original reason, so the call isn’t re-litigated."
          >
            <IncidentRow
              priority="medium"
              camera="CAM-091"
              summary="Debris, live lane"
              location="M25 A/C · Jct 9"
              age="00:06"
              unread
              seenBefore={{ reason: 'shadow' }}
            />
          </State>

          <State
            id="queue-row/dismissed"
            label="Dismissed"
            caption="Collapses to a 20px strip with its reason and an undo, holds 8s, then leaves."
          >
            <DismissedStrip camera="CAM-091" reason="shadow" />
          </State>
        </div>
      </Section>

      <Section title="Critical banner" source="Pass C frame 2">
        <div className="flex flex-col gap-3">
          <State id="banner/present" label="Present" width="flex-1 min-w-0">
            <CriticalBanner
              headline="Wrong-way driver — CAM-014, M6 northbound, Jct 8–9"
              detail="Live lane 2 of 3 · detected 0.6s ago"
            />
          </State>
          <State
            id="banner/collapsed"
            label="Collapsed"
            width="flex-1 min-w-0"
            caption="Zero height when nothing is critical. It expands to 52px and pushes the app down — it never overlays what is being read."
          >
            <CriticalBanner
              headline="Wrong-way driver — CAM-014, M6 northbound, Jct 8–9"
              detail="Live lane 2 of 3 · detected 0.6s ago"
              present={false}
            />
          </State>
        </div>
      </Section>

      <Section title="Buffered new-events bar" source="Pass C frame 4">
        <div className="flex flex-col gap-3">
          <State id="buffered-bar/neutral" label="Neutral" width="w-fit">
            <BufferedEventsBar count={3} />
          </State>
          <State
            id="buffered-bar/critical"
            label="Critical escalated"
            width="w-fit"
            caption="Escalates even while the operator has scrolled away."
          >
            <BufferedEventsBar count={4} criticalCount={1} />
          </State>
        </div>
      </Section>

      <Section title="Evidence frame" source="Pass C frames 1, 3, 5">
        <div className="flex gap-4">
          <div className="h-50 w-80">
            <CameraSnapshot
              camera="CAM-014"
              capturedAt="02:14:07"
              state="empty"
            />
          </div>
          <div className="h-50 w-80">
            <CameraSnapshot
              camera="CAM-014"
              capturedAt="02:14:07"
              state="empty"
              detection={{
                x: 0.36,
                y: 0.28,
                w: 0.24,
                h: 0.36,
                confidence: 0.96,
              }}
            />
          </div>
          <div className="h-50 w-80">
            <CameraSnapshot
              camera="CAM-091"
              capturedAt="02:19:41"
              state="failed"
            />
          </div>
        </div>
      </Section>

      <Section title="Edge states" source="Pass C frame 5">
        <div className="flex flex-col gap-4">
          <State
            id="edge/offline"
            label="Connection lost"
            width="flex-1 min-w-0"
          >
            <OfflineNotice dataAsOf="02:19:44" />
          </State>
          <State id="edge/empty-queue" label="Empty queue" width="w-108">
            <EmptyQueue feeds={{ online: 18, total: 18 }} />
          </State>
          <State id="edge/low-confidence" label="Low confidence" width="w-108">
            <LowConfidenceCard
              camera="CAM-091"
              location="M25 anti-clockwise, J9"
              description="Possible debris in lane 1. Low-confidence detection — image contrast was poor."
              confidence={0.41}
              confirmAs="medium"
            />
          </State>
        </div>
      </Section>

      <Section title="Overlays" source="Radix · focus-trapped">
        <State
          id="overlays/triggers"
          label="Open each"
          width="flex-1 min-w-0"
          caption="Dismissing always states a reason — that reason is the training signal that improves the detector. Dispatch confirms, but with a single keypress: the confirm button takes focus on open, so D then Enter completes it."
        >
          <DialogDemos />
        </State>
      </Section>

      <Section title="Detail pane" source="Pass C frame 3">
        <div className="flex flex-col gap-6">
          <div className="flex h-190 border border-border-hairline">
            <IncidentDetail incident={INCIDENT} />
          </div>
          <div className="flex h-190 border border-border-hairline">
            <IncidentDetail
              incident={{
                ...INCIDENT,
                acknowledgedBy: 'Position 3',
                acknowledgedAfter: '34s after arrival',
              }}
            />
          </div>
          <div className="flex h-40 border border-border-hairline">
            <IncidentDetail />
          </div>
        </div>
      </Section>
    </div>
  );
}
