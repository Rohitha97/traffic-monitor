import { describe, expect, it } from 'vitest';

import {
  POSITION_COOKIE,
  positionCookie,
  positionFrom,
  positionLabel,
} from '@/lib/position';

/*
 * The workstation identity.
 *
 * It is not authentication and does not pretend to be (ADR-0008), but it is
 * still the value the ownership lock compares and the audit trail prints — so
 * the parsing has to be exact about what it accepts. A position that can be any
 * string is a position that can be `Position 3` on purpose.
 */

function request(cookie?: string): Request {
  return new Request('http://localhost/api/events/claim', {
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

describe('positionLabel', () => {
  it('formats the number as the name everything else stores and renders', () => {
    expect(positionLabel('3')).toBe('Position 3');
  });
});

describe('positionFrom', () => {
  it('reads the cookie', () => {
    expect(positionFrom(request(`${POSITION_COOKIE}=7`))).toBe('7');
  });

  it('is null when there is no cookie header at all', () => {
    expect(positionFrom(request())).toBeNull();
  });

  it('is null when the header carries other cookies but not ours', () => {
    expect(positionFrom(request('theme=dark; muted=true'))).toBeNull();
  });

  it('finds it among other cookies, in any order', () => {
    expect(positionFrom(request(`theme=dark; ${POSITION_COOKIE}=4; a=b`))).toBe(
      '4',
    );
    expect(positionFrom(request(`${POSITION_COOKIE}=4; theme=dark`))).toBe('4');
  });

  it('tolerates the spacing browsers actually send', () => {
    expect(positionFrom(request(`theme=dark;${POSITION_COOKIE}=9`))).toBe('9');
    expect(positionFrom(request(`  ${POSITION_COOKIE}=9  `))).toBe('9');
  });

  /*
   * The value reaches an audit trail and a rendered rejection. Everything below
   * is a client deciding what those say — which a digits-only rule refuses
   * without needing to know what an attack would look like.
   */
  it('rejects anything that is not digits', () => {
    for (const value of [
      'admin',
      '3; role=admin',
      '<script>',
      '-1',
      '3.5',
      '',
      ' ',
      '٣',
      '3a',
      'Position 3',
    ]) {
      expect(
        positionFrom(
          request(`${POSITION_COOKIE}=${encodeURIComponent(value)}`),
        ),
      ).toBeNull();
    }
  });

  it('does not match a cookie whose name merely ends with ours', () => {
    // `myposition=9` is a different cookie, and a naive `includes` would take it.
    expect(positionFrom(request(`my${POSITION_COOKIE}=9`))).toBeNull();
  });

  it('decodes percent-encoding before validating', () => {
    // So an encoded non-digit is still caught rather than passing as literal.
    expect(positionFrom(request(`${POSITION_COOKIE}=%33`))).toBe('3');
    expect(positionFrom(request(`${POSITION_COOKIE}=%3Cscript%3E`))).toBeNull();
  });
});

describe('positionCookie', () => {
  const cookie = positionCookie('5');

  it('carries the value', () => {
    expect(cookie.startsWith(`${POSITION_COOKIE}=5;`)).toBe(true);
  });

  it('is httpOnly — the client is told its position over the stream instead', () => {
    expect(cookie).toContain('HttpOnly');
  });

  it('is site-wide and survives a browser restart', () => {
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=\d{6,}/);
  });

  it('is SameSite=Lax', () => {
    expect(cookie).toContain('SameSite=Lax');
  });

  it('round-trips through the parser', () => {
    // The pair that actually matters: what the stream sets is what the claim
    // route reads back.
    const header = positionCookie('12').split(';')[0]!;
    expect(positionFrom(request(header))).toBe('12');
  });
});
