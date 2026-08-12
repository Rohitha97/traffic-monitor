import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALES,
  localeCookie,
  localeFromAcceptLanguage,
} from '@/i18n/locale';

/*
 * Locale negotiation.
 *
 * Only ever consulted for a workstation that has not chosen — after that the
 * cookie wins. Which makes this the code path that decides what an operator
 * sees on their first shift at a new desk, and the one nobody will exercise by
 * hand.
 */

describe('isLocale', () => {
  it('accepts what this build ships', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  it('rejects everything else, including undefined', () => {
    for (const value of ['de', 'en-GB', 'JA', '', undefined]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe('localeFromAcceptLanguage', () => {
  it('is null when there is no header', () => {
    expect(localeFromAcceptLanguage(null)).toBeNull();
    expect(localeFromAcceptLanguage('')).toBeNull();
  });

  it('matches a plain tag', () => {
    expect(localeFromAcceptLanguage('ja')).toBe('ja');
    expect(localeFromAcceptLanguage('en')).toBe('en');
  });

  it('matches a regional tag to its base language', () => {
    // A control room's browsers will say ja-JP and en-GB, not ja and en.
    expect(localeFromAcceptLanguage('ja-JP')).toBe('ja');
    expect(localeFromAcceptLanguage('en-GB')).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(localeFromAcceptLanguage('JA-jp')).toBe('ja');
  });

  it('honours quality values over header order', () => {
    // `en;q=0.8, ja;q=0.9` means Japanese, however it is written down.
    expect(localeFromAcceptLanguage('en;q=0.8, ja;q=0.9')).toBe('ja');
    expect(localeFromAcceptLanguage('ja;q=0.2, en;q=0.7')).toBe('en');
  });

  it('treats an absent q as the highest preference', () => {
    expect(localeFromAcceptLanguage('ja, en;q=0.9')).toBe('ja');
  });

  it('skips languages it does not ship and takes the next best', () => {
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,ja;q=0.8')).toBe('ja');
  });

  it('treats q=0 as a refusal rather than a weak preference', () => {
    // `ja;q=0` is the browser saying explicitly *not* Japanese.
    expect(localeFromAcceptLanguage('ja;q=0, en;q=0.5')).toBe('en');
    expect(localeFromAcceptLanguage('ja;q=0')).toBeNull();
  });

  it('is null when nothing in the header is supported', () => {
    // The caller then falls back to English, which is where the design was
    // drawn — not to whatever happened to be first in the header.
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.9')).toBeNull();
  });

  it('tolerates the malformed headers real clients send', () => {
    expect(localeFromAcceptLanguage('  ja  ,  ')).toBe('ja');
    expect(localeFromAcceptLanguage(',,,')).toBeNull();
    expect(localeFromAcceptLanguage('*')).toBeNull();
  });

  it('ignores an unparseable q rather than discarding the language', () => {
    /*
     * The tag is the signal and the qualifier is a refinement of it. A client
     * that says "Japanese, and something unreadable about how much" has still
     * said Japanese, and dropping it would fall back to English on the
     * strength of a broken parameter.
     */
    expect(localeFromAcceptLanguage('ja;q=notanumber')).toBe('ja');
    expect(localeFromAcceptLanguage('ja;q=, en;q=0.9')).toBe('ja');
  });

  it('never returns a locale this build cannot render', () => {
    for (const header of ['zh-CN', 'ko', 'en-US', 'ja-JP-u-ca-japanese']) {
      const result = localeFromAcceptLanguage(header);
      expect(result === null || isLocale(result)).toBe(true);
    }
  });
});

describe('localeCookie', () => {
  it('carries the locale and persists past a shift', () => {
    const cookie = localeCookie('ja');
    expect(cookie.startsWith(`${LOCALE_COOKIE}=ja;`)).toBe(true);
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=\d{6,}/);
    expect(cookie).toContain('SameSite=Lax');
  });

  it('is readable from script, unlike the position cookie', () => {
    // The switcher is a client component and writes this itself.
    expect(localeCookie('en')).not.toContain('HttpOnly');
  });
});

describe('the default', () => {
  it('is the language the design was drawn in', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(isLocale(DEFAULT_LOCALE)).toBe(true);
  });
});
