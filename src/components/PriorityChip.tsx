import { PriorityGlyph } from '@/components/PriorityGlyph';
import { PRIORITY, type Priority } from '@/lib/priority';

interface PriorityChipProps {
  priority: Priority;
  /** 'md' in the detail header (Pass C frame 3), 'sm' in the compact header (frame 1). */
  size?: 'sm' | 'md';
  /**
   * Set when the chip sits on `--color-raised` rather than the ground — the
   * dialog and the banner.
   *
   * Pass B measured the priority ramps against the *ground*: critical is
   * 5.2:1 there. On the raised surface the same red is 4.16:1, under WCAG AA
   * for normal text — confirmed by an axe pass against the running build. On
   * that surface the label takes the primary text colour and severity is
   * carried by the glyph, the strip, the shape and the word itself, which is
   * still four cues. (DECISIONS 6.4)
   */
  onRaised?: boolean;
}

/**
 * The priority chip — a leading strip, the shape glyph, and the label, all in
 * the priority's own colour. Carries four of the five cues at once; the fifth,
 * border weight, is the strip.
 *
 * The strip is a sibling element rather than a border-left so its width comes
 * off the 4px scale (w-1 = 4px critical … w-0.25 = 1px low) instead of an
 * arbitrary value.
 */
export function PriorityChip({
  priority,
  size = 'md',
  onRaised = false,
}: PriorityChipProps) {
  const { label, text, fill, strip } = PRIORITY[priority];
  const labelColour = onRaised ? 'text-text-primary' : text;

  return (
    <div className="flex flex-none items-stretch gap-1.5">
      <span aria-hidden="true" className={`${strip} ${fill}`} />
      <span className="flex items-center gap-1.5 py-1 pr-2 pl-1">
        <PriorityGlyph
          priority={priority}
          size={size === 'md' ? 'md' : 'sm'}
          decorative
        />
        <span
          className={`${labelColour} tracking-label font-semibold ${
            size === 'md' ? 'text-kicker' : 'text-micro'
          }`}
        >
          {label}
        </span>
      </span>
    </div>
  );
}
