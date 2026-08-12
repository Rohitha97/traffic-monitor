/*
 * Who is at the keyboard — as much identity as a lock needs, and no more.
 *
 * This is deliberately **not** authentication. A control room's positions are
 * physical desks behind a locked door; the question a dispatch lock has to
 * answer is "which desk is this", not "who is this person and can they prove
 * it". Building a login to unblock a compare-and-set would have meant a session
 * store, a password policy and a token lifetime — a large, security-sensitive
 * subsystem, invented rather than specified, sitting underneath a feature that
 * needed one string.
 *
 * So: a workstation number, assigned by the server when the stream opens, kept
 * in an httpOnly cookie. Enough to make the lock meaningful, enough for the
 * audit trail to name who acted, and it leaves real authentication as a clean
 * later addition rather than something half-built to be unpicked.
 *
 * What it is not: proof. Anything that can send an HTTP request can send a
 * cookie, and a position can be impersonated by anyone who can reach the
 * server. That is an accurate description of the threat model this deployment
 * has — an internal tool on an internal network — and it is written down in the
 * README rather than left to be discovered. (ADR-0008)
 */

export const POSITION_COOKIE = 'position';

/** A year: a workstation's identity should outlive a shift and a browser restart. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** "3" → "Position 3", for the audit trail and the rejection message. */
export function positionLabel(position: string): string {
  return `Position ${position}`;
}

/**
 * The position this request is coming from, if it has been assigned one.
 *
 * Parsed from the raw header rather than `next/headers` so it works from a
 * route handler that already has the `Request` — and so the stream route, which
 * assigns the cookie, can read it back in the same pass.
 */
export function positionFrom(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== POSITION_COOKIE) continue;
    const value = decodeURIComponent(rest.join('='));
    // Digits only. The value reaches an audit trail and a rendered rejection,
    // and neither should be able to say whatever a client felt like sending.
    return /^\d+$/.test(value) ? value : null;
  }

  return null;
}

export function positionCookie(position: string): string {
  return [
    `${POSITION_COOKIE}=${position}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    // The client never needs to read this — it is told its own position in the
    // stream's opening frame — so it does not need to be reachable from script.
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
}
