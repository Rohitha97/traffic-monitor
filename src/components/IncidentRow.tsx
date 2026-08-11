'use client';

import { PriorityGlyph } from '@/components/PriorityGlyph';
import { PRIORITY, type Priority } from '@/lib/priority';

interface IncidentRowProps {
  priority: Priority;
  /** Camera ID — "CAM-014". */
  camera: string;
  /** What the detector saw — "Wrong-way driver". */
  summary: string;
  /** Where — "M6 N · Jct 8–9". */
  location: string;
  /** Live age, pre-formatted as mm:ss. */
  age: string;
  /** Never opened. Clears the moment it is. */
  unread?: boolean;
  /** The detail pane is showing this incident. */
  selected?: boolean;
  /** Past its priority's age threshold. */
  slaBreached?: boolean;
  /** Owner's initials once acknowledged — the lock is visible to every position. */
  owner?: string;
  /** Set once dispatched; unit and ETA replace the raw description. */
  dispatch?: { unit: string; eta: string };
  /** A critical that has just landed, before the tint settles. */
  arriving?: boolean;
  onSelect?: () => void;
  /**
   * How many incidents the queue holds, and this row's position in it.
   *
   * Required by a windowed list: only a handful of options are rendered out of
   * however many exist, so without these a screen reader announces the count it
   * can see rather than the count that is there.
   */
  setSize?: number;
  posInSet?: number;
  /**
   * False for a row that is on its way out — resolved and fading.
   *
   * It drops out of the listbox and the tab order entirely, because it is no
   * longer something the operator can choose.
   */
  interactive?: boolean;
  className?: string;
}

/**
 * A queue row: 40px, twelve visible at 1440×900 without scrolling.
 *
 * DOM order is the design's reading order — priority, then type, then
 * location, then age (Pass A note 3) — so the screen-reader order and the
 * visual scan order are the same thing.
 *
 * Two rules from the state matrix are easy to get wrong and both are
 * accessibility decisions: hover adds *no colour at all*, so colour stays
 * exclusively a priority signal; and the focus ring is neutral, never the
 * priority colour, so focus can never be mistaken for severity. Both states
 * are inset rings, which cost no layout — the row must never move under the
 * cursor.
 */
export function IncidentRow({
  priority,
  camera,
  summary,
  location,
  age,
  unread = false,
  selected = false,
  slaBreached = false,
  owner,
  dispatch,
  arriving = false,
  onSelect,
  setSize,
  posInSet,
  interactive = true,
  className = '',
}: IncidentRowProps) {
  const { strip, fill, label } = PRIORITY[priority];

  // Dispatched rows drop to a calm treatment: the location moves up to the
  // primary line and the responding unit takes the secondary one.
  const primaryLine = dispatch
    ? `${camera} · ${location}`
    : `${camera} · ${summary}`;
  const secondaryLine = dispatch
    ? `Unit ${dispatch.unit} · ETA ${dispatch.eta}`
    : location;

  const emphasised = unread || selected;

  return (
    <div
      {...(interactive
        ? {
            role: 'option',
            'aria-selected': selected,
            /*
             * Roving tabindex: only the selected row is in the tab order, so
             * Tab moves past the queue rather than through every incident in
             * it. Moving *within* the queue is ↑↓, handled globally — one
             * keyboard axis, no modes. (Pass A §04)
             */
            tabIndex: selected ? 0 : -1,
            ...(setSize !== undefined ? { 'aria-setsize': setSize } : {}),
            ...(posInSet !== undefined ? { 'aria-posinset': posInSet } : {}),
            onClick: onSelect,
            onKeyDown: (event: React.KeyboardEvent) => {
              // Space selects without acknowledging; Enter is bound globally
              // to acknowledge, so it is deliberately not handled here.
              if (event.key === ' ') {
                event.preventDefault();
                onSelect?.();
              }
            },
          }
        : { 'aria-hidden': true })}
      className={`flex h-10 items-center gap-2 border-b border-border-hairline px-2.5 outline-none transition-colors duration-(--duration-state) ${
        interactive
          ? 'cursor-pointer hover:shadow-row-hover focus-visible:shadow-row-focus'
          : ''
      } ${selected ? 'bg-raised' : arriving ? 'bg-critical-tint' : ''} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-full flex-none ${strip} ${fill}`}
      />

      <PriorityGlyph priority={priority} size="sm" />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-caption truncate text-text-primary ${
            emphasised ? 'font-semibold' : 'font-medium'
          }`}
        >
          {primaryLine}
        </span>
        <span className="text-micro truncate font-medium text-text-secondary">
          {secondaryLine}
        </span>
      </span>

      <span className="flex flex-none items-center gap-1.5">
        {slaBreached && (
          <span className="text-micro rounded-control border border-border-component px-1.25 py-0.5 font-semibold text-text-secondary">
            SLA
          </span>
        )}

        {/*
         * The owner's initials take the unread dot's place — acknowledging
         * takes the lock, and every other position needs to see that so two
         * operators never dispatch the same call. (Pass A, ownership)
         */}
        {owner ? (
          <span
            className="text-mono-micro flex size-5 items-center justify-center rounded-full bg-text-primary font-mono font-semibold text-ground"
            title={`Acknowledged by ${owner}`}
          >
            {owner}
          </span>
        ) : (
          unread && (
            <>
              <span
                aria-hidden="true"
                className="size-1.25 flex-none rounded-full bg-text-primary"
              />
              <span className="sr-only">Unread</span>
            </>
          )
        )}

        {/*
         * Age gains weight rather than a new hue when it breaches — contrast,
         * not colour, because colour belongs to priority. (Pass C frame 4)
         */}
        <span
          className={`text-mono-meta font-mono ${
            unread || slaBreached
              ? 'font-semibold text-text-primary'
              : 'font-medium text-text-secondary'
          }`}
        >
          {age}
        </span>
        <span className="sr-only">
          {label} priority, open {age}
        </span>
      </span>
    </div>
  );
}
