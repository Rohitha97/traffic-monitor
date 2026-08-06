import { Button } from '@/components/Button';

interface ActionBarProps {
  /** Set once acknowledged — the owner line replaces the acknowledge control. */
  acknowledgedBy?: string;
}

/**
 * Three actions, always in the same place, always the same width. Primary is
 * Dispatch. (Pass A note 5)
 *
 * The copy is the design's, not the brief's: "Dispatch" rather than "Dispatch
 * response", and "Dismiss, not real" rather than "Dismiss" — Pass C's copy
 * rule is that a control's verb becomes its confirmation, so the word on the
 * button is the word in the audit trail.
 *
 * Acknowledging is not undone here: once the lock is taken the control is
 * replaced by who holds it, and Dispatch stays the one live decision.
 */
export function ActionBar({ acknowledgedBy }: ActionBarProps) {
  return (
    <div className="flex h-11 flex-none items-center gap-2.5 border-t border-border-hairline pt-3">
      <Button variant="primary">Dispatch</Button>

      {acknowledgedBy ? (
        <p className="text-kicker font-medium text-text-secondary">
          ✓ Acknowledged · {acknowledgedBy}
        </p>
      ) : (
        <Button variant="secondary">Acknowledge only</Button>
      )}

      <span className="flex-1" />

      {/*
       * The caret is the design's: dismissing always asks for a reason, and
       * the reason is how the detection model improves.
       */}
      <Button variant="quiet" aria-haspopup="menu">
        Dismiss, not real ▾
      </Button>
    </div>
  );
}
