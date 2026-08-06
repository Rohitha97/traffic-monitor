'use client';

import { Button } from '@/components/Button';
import {
  DismissReasonMenu,
  type DismissReason,
} from '@/components/DismissReasonMenu';

interface ActionBarProps {
  /** Set once acknowledged — the owner line replaces the acknowledge control. */
  acknowledgedBy?: string;
  /** Set once dispatched — the decision is made and the bar goes quiet. */
  dispatched?: { unit: string; etaMinutes: number };
  onAcknowledge?: () => void;
  onDispatchRequest?: () => void;
  onDismiss?: (reason: DismissReason) => void;
  dismissOpen?: boolean;
  onDismissOpenChange?: (open: boolean) => void;
}

/**
 * Three actions, always in the same place, always the same width. Primary is
 * Dispatch. (Pass A note 5)
 *
 * The copy is the design's, not the brief's: "Dispatch" rather than "Dispatch
 * response", and "Dismiss, not real" rather than "Dismiss" — Pass C's copy rule
 * is that a control's verb becomes its confirmation, so the word on the button
 * is the word in the audit trail.
 *
 * Acknowledging is not undone here: once the lock is taken, the control is
 * replaced by who holds it and Dispatch stays the one live decision.
 */
export function ActionBar({
  acknowledgedBy,
  dispatched,
  onAcknowledge,
  onDispatchRequest,
  onDismiss,
  dismissOpen = false,
  onDismissOpenChange,
}: ActionBarProps) {
  return (
    <div className="flex h-11 flex-none items-center gap-2.5 border-t border-border-hairline pt-3">
      {dispatched ? (
        <p className="text-caption font-semibold text-text-primary">
          ✓ Dispatched · unit {dispatched.unit}, ETA {dispatched.etaMinutes} min
        </p>
      ) : (
        <Button variant="primary" onClick={onDispatchRequest}>
          Dispatch
        </Button>
      )}

      {acknowledgedBy ? (
        <p className="text-kicker font-medium text-text-secondary">
          ✓ Acknowledged · {acknowledgedBy}
        </p>
      ) : (
        <Button variant="secondary" onClick={onAcknowledge}>
          Acknowledge only
        </Button>
      )}

      <span className="flex-1" />

      {/*
       * Dismissing always states a reason — the reason is how the detection
       * model improves. Reachable from new or acknowledged, never from
       * dispatched: a team already on its way is not a false positive.
       * (Pass A, dismissed state)
       */}
      {!dispatched && (
        <DismissReasonMenu
          open={dismissOpen}
          onOpenChange={onDismissOpenChange ?? (() => {})}
          onSelect={(reason) => onDismiss?.(reason)}
        >
          <Button variant="quiet">Dismiss, not real ▾</Button>
        </DismissReasonMenu>
      )}
    </div>
  );
}
