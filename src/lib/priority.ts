/*
 * Priority presentation.
 *
 * Pass B §02 makes priority the only saturated signal in the system, and
 * encodes it five ways at once — colour, border weight, shape, icon and text
 * label. That redundancy is the accessibility spine of the whole design:
 * "assume a colour-blind operator on a badly calibrated monitor".
 *
 * All five cues live in this one map so a queue row, a detail chip and a
 * status-bar count can never disagree about what "high" looks like.
 *
 * The literal list is the single source of the priority values: phase 3's Zod
 * schema builds its enum from PRIORITIES rather than repeating the strings.
 */

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export type Priority = (typeof PRIORITIES)[number];

interface PriorityPresentation {
  /** Uppercase label for chips and legends. Never rendered alone — always beside the glyph. */
  readonly label: string;
  /** Sentence case, for use inside a sentence ("Confirm as Medium"). */
  readonly title: string;
  /** Sign-taxonomy meaning the shape borrows from. Used in the glyph's alt text. */
  readonly meaning: string;
  /** Text colour utility. */
  readonly text: string;
  /** Fill utility, for the glyph and the row's priority strip. */
  readonly fill: string;
  /** Border colour utility, for outlined treatments. */
  readonly border: string;
  /**
   * Width of the row's priority strip — 4px critical down to 1px low, so
   * severity is legible from the strip alone at the edge of vision. These are
   * fractional steps of the 4px scale, not arbitrary values.
   */
  readonly strip: string;
  /** Shape utility for the glyph. */
  readonly shape: string;
}

export const PRIORITY: Record<Priority, PriorityPresentation> = {
  critical: {
    label: 'CRITICAL',
    title: 'Critical',
    meaning: 'danger',
    text: 'text-critical',
    fill: 'bg-critical',
    border: 'border-critical',
    strip: 'w-1',
    shape: 'clip-triangle',
  },
  high: {
    label: 'HIGH',
    title: 'High',
    meaning: 'warning',
    text: 'text-high',
    fill: 'bg-high',
    border: 'border-high',
    strip: 'w-0.75',
    shape: 'clip-diamond',
  },
  medium: {
    label: 'MEDIUM',
    title: 'Medium',
    meaning: 'caution',
    text: 'text-medium',
    fill: 'bg-medium',
    border: 'border-medium',
    strip: 'w-0.5',
    shape: 'rounded-full',
  },
  low: {
    label: 'LOW',
    title: 'Low',
    meaning: 'info',
    text: 'text-low',
    fill: 'bg-low',
    border: 'border-low',
    strip: 'w-0.25',
    shape: 'rounded-chip',
  },
};

/** Descending severity — the queue's sort order and the status bar's count order. */
export const PRIORITY_ORDER: readonly Priority[] = PRIORITIES;
