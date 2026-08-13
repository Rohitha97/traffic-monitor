'use client';

/*
 * A client island.
 *
 * Its accessible name is translated, and `useTranslations` is a hook. Every
 * surface that renders this in the running app is already inside the console's
 * client tree — only `/dev/states` renders it from a Server Component, and a
 * hook there blanks the state matrix. (ADR-0014)
 */

import { useTranslations } from 'next-intl';

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
  /**
   * The operator's earlier verdict on this same call, when the camera has
   * re-reported something inside the reopen window.
   */
  seenBefore?: { reason: string; at: string };
  /** One plain-English sentence from the detector. */
  description: string;
  detectionLatency: string;
  /** Field labels for the facts panel, resolved upstream by `toDetailView`. */
  factLabels: {
    location: string;
    marker: string;
    latency: string;
    confidence: string;
  };
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
  /** This position's attempt to take the incident. See IncidentRow. */
  claim?: { state: 'pending' } | { state: 'rejected'; by: string };
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
  const t = useTranslations('a11y');
  if (!incident) {
    /*
     * The live region is on both branches, not only the populated one. A live
     * region created at the same moment as its content does not reliably
     * announce — the region has to already exist for the change to be a change.
     */
    return (
      <main
        aria-label={t('incidentDetail')}
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center justify-center p-5"
      >
        <p className="text-micro tracking-label max-w-70 text-center font-semibold text-text-secondary uppercase">
          {t('emptyDetail')}
        </p>
      </main>
    );
  }

  return (
    <main
      aria-label={t('incidentDetail')}
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
        {/*
         * The claim outcome outranks the acknowledgement badge in the same
         * slot: if this position was refused, "✓ Acknowledged — Position 3" is
         * technically true and reads as though *they* had it.
         */}
        {incident.claim?.state === 'rejected' ? (
          <div className="flex-none text-right">
            <p className="text-kicker font-semibold text-text-primary">
              Taken by {incident.claim.by.toLowerCase()}
            </p>
            <p className="text-micro font-medium text-text-secondary">
              Already being handled
            </p>
          </div>
        ) : incident.claim?.state === 'pending' ? (
          <div className="flex-none text-right">
            <p className="text-kicker font-semibold text-text-secondary">
              Claiming…
            </p>
          </div>
        ) : (
          incident.acknowledgedBy && (
            <div className="flex-none text-right">
              <p className="text-kicker font-semibold text-text-primary">
                ✓ Acknowledged
              </p>
              <p className="text-micro font-medium text-text-secondary">
                {incident.acknowledgedBy}
                {incident.acknowledgedAfter &&
                  ` · ${incident.acknowledgedAfter}`}
              </p>
            </div>
          )
        )}
      </header>

      <p
        className={`text-body font-semibold ${PRIORITY[incident.priority].text}`}
      >
        &ldquo;{incident.priorityReason}&rdquo;
      </p>

      {/*
       * Directly under the priority argument, above the detector's own
       * description, because it changes how that description should be read:
       * the operator has already looked at this camera reporting this thing and
       * said what it was. Deliberately not styled as a warning — it is not a
       * correction, it is the operator's own prior call handed back to them.
       */}
      {incident.seenBefore && (
        <p className="text-caption rounded-control border border-border-component bg-raised px-2.5 py-1.5 font-medium text-text-body">
          <span className="font-semibold text-text-primary">Seen before</span> ·
          dismissed as &ldquo;{incident.seenBefore.reason}&rdquo; at{' '}
          {incident.seenBefore.at}
        </p>
      )}

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
            labels={incident.factLabels}
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
