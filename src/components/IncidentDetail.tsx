import { ActionBar } from '@/components/ActionBar';
import { AuditTrail, type AuditEntry } from '@/components/AuditTrail';
import type { DismissReason } from '@/components/DismissReasonMenu';
import { CameraSnapshot } from '@/components/CameraSnapshot';
import { FactsPanel } from '@/components/FactsPanel';
import { NearbyCameras, type NearbyCamera } from '@/components/NearbyCameras';
import { PriorityChip } from '@/components/PriorityChip';
import { PRIORITY, type Priority } from '@/lib/priority';

export interface IncidentDetailData {
  priority: Priority;
  /** "Wrong-way driver" */
  summary: string;
  camera: string;
  location: string;
  mileMarker: string;
  /** Why this priority — "Critical — live lane 2 of 3, junction approach". */
  priorityReason: string;
  /** One plain-English sentence from the detector. */
  description: string;
  detectionLatency: string;
  confidence: number;
  snapshotUrl?: string;
  capturedAt: string;
  snapshotState?: 'loaded' | 'failed' | 'empty';
  detection?: {
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
  };
  nearbyCameras: readonly NearbyCamera[];
  flowNote?: string;
  audit: readonly AuditEntry[];
  acknowledgedBy?: string;
  /** "34s after arrival" */
  acknowledgedAfter?: string;
  dispatched?: { unit: string; etaMinutes: number };
}

interface IncidentDetailProps {
  incident?: IncidentDetailData;
  onAcknowledge?: () => void;
  onDispatchRequest?: () => void;
  onDismiss?: (reason: DismissReason) => void;
  dismissOpen?: boolean;
  onDismissOpenChange?: (open: boolean) => void;
}

/**
 * The detail pane.
 *
 * DOM order is Pass A's eye path for this frame: priority and its stated
 * reason first, then the snapshot, then the four facts that change the
 * decision, then the action bar. The audit trail and the camera schematic are
 * reference, not path — they come last in the reading order too.
 *
 * The reason is rendered in the priority's own colour and is the only
 * saturated text on the frame. Rendering "critical" without "live lane 2 of 3,
 * junction approach" would be showing the conclusion and hiding the argument.
 */
export function IncidentDetail({
  incident,
  onAcknowledge,
  onDispatchRequest,
  onDismiss,
  dismissOpen,
  onDismissOpenChange,
}: IncidentDetailProps) {
  if (!incident) {
    return (
      <main
        aria-label="Incident detail"
        className="flex min-w-0 flex-1 items-center justify-center p-5"
      >
        <p className="text-micro tracking-label max-w-70 text-center font-semibold text-text-tertiary uppercase">
          Select an incident to review it
        </p>
      </main>
    );
  }

  return (
    <main
      aria-label="Incident detail"
      aria-live="polite"
      className="flex min-w-0 flex-1 flex-col gap-3 p-5"
    >
      <header className="flex items-start gap-3.5">
        <PriorityChip priority={incident.priority} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-panel font-semibold text-text-primary">
            {incident.summary}
          </h2>
          <p className="text-kicker font-medium text-text-secondary">
            {incident.camera} · {incident.location}
          </p>
        </div>
        {incident.acknowledgedBy && (
          <div className="flex-none text-right">
            <p className="text-kicker font-semibold text-text-primary">
              ✓ Acknowledged
            </p>
            <p className="text-micro font-medium text-text-secondary">
              {incident.acknowledgedBy}
              {incident.acknowledgedAfter && ` · ${incident.acknowledgedAfter}`}
            </p>
          </div>
        )}
      </header>

      <p
        className={`text-body font-semibold ${PRIORITY[incident.priority].text}`}
      >
        &ldquo;{incident.priorityReason}&rdquo;
      </p>
      <p className="text-caption max-w-205 font-medium text-text-body">
        Detector description: {incident.description}
      </p>

      <div className="flex min-h-0 flex-1 gap-3.5">
        <div className="min-w-0 flex-[1.3]">
          <CameraSnapshot
            camera={incident.camera}
            capturedAt={incident.capturedAt}
            {...(incident.snapshotUrl ? { src: incident.snapshotUrl } : {})}
            {...(incident.detection ? { detection: incident.detection } : {})}
            {...(incident.snapshotState
              ? { state: incident.snapshotState }
              : {})}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <FactsPanel
            location={incident.location}
            mileMarker={incident.mileMarker}
            detectionLatency={incident.detectionLatency}
            confidence={incident.confidence}
          />
          <NearbyCameras
            cameras={incident.nearbyCameras}
            {...(incident.flowNote ? { flowNote: incident.flowNote } : {})}
          />
          <AuditTrail entries={incident.audit} />
        </div>
      </div>

      <ActionBar
        {...(incident.acknowledgedBy
          ? { acknowledgedBy: incident.acknowledgedBy }
          : {})}
        {...(incident.dispatched ? { dispatched: incident.dispatched } : {})}
        {...(onAcknowledge ? { onAcknowledge } : {})}
        {...(onDispatchRequest ? { onDispatchRequest } : {})}
        {...(onDismiss ? { onDismiss } : {})}
        {...(dismissOpen !== undefined ? { dismissOpen } : {})}
        {...(onDismissOpenChange ? { onDismissOpenChange } : {})}
      />
    </main>
  );
}
