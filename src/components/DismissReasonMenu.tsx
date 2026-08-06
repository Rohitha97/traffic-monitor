'use client';

/**
 * False-positive reasons, from Pass A's dismissed state.
 *
 * These are not decoration: a dismissal reason is the training signal that
 * makes the detection model better, so the picker is mandatory rather than
 * optional and the reason is written into the audit trail and shown on the
 * collapsed row.
 */
export const DISMISS_REASONS = [
  'Shadow',
  'Spray',
  'Parked on hard shoulder',
  'Camera artefact',
  'Already known',
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];

interface DismissReasonMenuProps {
  onSelect?: (reason: DismissReason) => void;
}

/**
 * The reason picker's panel.
 *
 * Presentational only — Pass C draws the trigger as "Dismiss, not real ▾", a
 * disclosure caret rather than the modal the brief describes. Phase 4 wraps
 * this in a Radix menu, which gives the focus trap and roving focus the brief
 * asks for while keeping the design's affordance.
 */
export function DismissReasonMenu({ onSelect }: DismissReasonMenuProps) {
  return (
    <div
      role="menu"
      aria-label="Dismiss as false positive"
      className="rounded-control flex w-fit flex-col border border-border-component bg-raised py-1 shadow-row-hover"
    >
      <p className="text-micro tracking-field px-3 py-1 font-semibold text-text-tertiary uppercase">
        Why is this not real?
      </p>
      {DISMISS_REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          role="menuitem"
          onClick={() => onSelect?.(reason)}
          className="text-caption cursor-pointer px-3 py-1.5 text-left font-medium text-text-body transition-colors duration-(--duration-state) hover:bg-text-primary/8 hover:text-text-primary"
        >
          {reason}
        </button>
      ))}
    </div>
  );
}
