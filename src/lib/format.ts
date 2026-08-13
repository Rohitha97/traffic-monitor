/*
 * Formatting for the numbers operators actually watch.
 *
 * All of it sets in tabular-lining figures at the call site, so a counter that
 * ticks once a second never reflows the characters beside it. (Pass B §03)
 */

/**
 * Live age as mm:ss, or h:mm:ss past an hour.
 *
 * Deliberately not date-fns's `formatDistanceToNowStrict`: "3 minutes ago"
 * loses the precision an operator triages on, and its width changes as the
 * words change, which is exactly the jitter tabular figures exist to prevent.
 */
export function formatAge(fromIso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ageInSeconds(
  fromIso: string,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.floor((now - Date.parse(fromIso)) / 1000));
}

/**
 * The gap between the model seeing something and the client having it.
 *
 * Shown as one line in the detail pane because it answers "how stale is this?"
 * before the operator has to ask — and because a monitoring tool that hides
 * its own latency is asking to be trusted on faith.
 */
export function latencySeconds(detectedAt: string, receivedAt: string): number {
  const ms = Math.max(0, Date.parse(receivedAt) - Date.parse(detectedAt));
  return Number((ms / 1000).toFixed(1));
}

/*
 * Clocks, cached per locale.
 *
 * `Intl.DateTimeFormat` is expensive to construct and these run on the shared
 * one-second tick across every visible row — building one inside a render is a
 * real cost at five hundred incidents, which is why the instances are held
 * rather than made on demand.
 *
 * The locale is a parameter rather than a module constant because it is a
 * workstation setting that can change without a reload. `en-GB` is the default
 * because it is the language the design was drawn in.
 */
const CLOCKS = new Map<string, Intl.DateTimeFormat>();

function clock(locale: string, timeZone?: string): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone ?? 'local'}`;
  let formatter = CLOCKS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    });
    CLOCKS.set(key, formatter);
  }
  return formatter;
}

export function formatClock(
  date: Date | number = Date.now(),
  locale = 'en-GB',
): string {
  return clock(locale).format(date);
}

/** A motorway incident log is kept in UTC, so both clocks are on screen. */
export function formatClockUtc(
  date: Date | number = Date.now(),
  locale = 'en-GB',
): string {
  return clock(locale, 'UTC').format(date);
}

/** "02:14:07" — the burned-in OSD time on a snapshot, and audit-trail rows. */
export function formatTimestamp(iso: string, locale = 'en-GB'): string {
  return clock(locale).format(Date.parse(iso));
}

/*
 * No date formatter here, deliberately.
 *
 * Nothing in this interface renders a date — every timestamp on screen is a
 * time within the shift — and `HH:mm:ss` is identical in `en-GB` and `ja`,
 * which is why the locale makes no visible difference above.
 *
 * When a date does appear it must be locale-driven and not hand-assembled:
 * Japanese writes `2026/08/12` where `en-GB` writes `12/08/2026`, and the two
 * are indistinguishable for the first twelve days of a month and silently
 * wrong after. Adding an unused formatter now would be dead code; this note is
 * the reminder. (ADR-0013)
 */
