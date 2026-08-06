import { PRIORITY, type Priority } from '@/lib/priority';

const GLYPH_SIZE = {
  xs: 'size-2', //   8px — status-bar open counts
  sm: 'size-2.5', // 10px — queue row
  md: 'size-3', //  12px — detail-pane chip
  lg: 'size-4', //  16px — critical banner
} as const;

interface PriorityGlyphProps {
  priority: Priority;
  size?: keyof typeof GLYPH_SIZE;
  /**
   * Set when a visible priority label sits beside the glyph, so the label is
   * not announced twice. Left unset the glyph carries its own screen-reader
   * text — in the queue row it is the *only* priority signal, and "never
   * colour alone" has to hold for assistive technology too.
   */
  decorative?: boolean;
}

export function PriorityGlyph({
  priority,
  size = 'sm',
  decorative = false,
}: PriorityGlyphProps) {
  const { fill, shape, label, meaning } = PRIORITY[priority];

  return (
    <span className="flex-none">
      <span
        aria-hidden="true"
        className={`block ${GLYPH_SIZE[size]} ${fill} ${shape}`}
      />
      {!decorative && (
        <span className="sr-only">
          {label} priority — {meaning}
        </span>
      )}
    </span>
  );
}
