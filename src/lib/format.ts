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
export function formatLatency(detectedAt: string, receivedAt: string): string {
  const ms = Math.max(0, Date.parse(receivedAt) - Date.parse(detectedAt));
  return `${(ms / 1000).toFixed(1)}s`;
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const TIME_UTC = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatClock(date: Date | number = Date.now()): string {
  return TIME.format(date);
}

/** A motorway incident log is kept in UTC, so both clocks are on screen. */
export function formatClockUtc(date: Date | number = Date.now()): string {
  return TIME_UTC.format(date);
}

/** "02:14:07" — the burned-in OSD time on a snapshot, and audit-trail rows. */
export function formatTimestamp(iso: string): string {
  return TIME.format(Date.parse(iso));
}
