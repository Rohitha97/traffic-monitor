/*
 * Which language this workstation is set to.
 *
 * Deliberately not a URL segment. Every next-intl tutorial reaches for
 * `app/[locale]/page.tsx`, which is the right shape for a public multilingual
 * site with SEO requirements and shareable links. This is a single-screen
 * internal dashboard with neither.
 *
 * Language here is a property of *the desk*, like the mute setting — not of
 * what is being looked at. A URL prefix would mean every route carrying a
 * segment for a value that never changes during a shift, the API routes and the
 * dev state matrix needing exclusion rules, and an operator who pastes an
 * incident link imposing their language on whoever opens it. (ADR-0009)
 */

export const LOCALES = ['en', 'ja'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The cookie the switcher writes and `getRequestConfig` reads.
 *
 * A cookie rather than `localStorage`, which is where the mute preference
 * lives, because the server has to know the locale before it renders — the
 * queue and the detail pane are the two largest render surfaces in the
 * application and both are server-rendered. A preference only the browser can
 * see would force the whole screen through a client boundary to read it.
 */
export const LOCALE_COOKIE = 'locale';

/** A year: a workstation's language should outlive a shift and a browser restart. */
export const LOCALE_MAX_AGE = 365 * 24 * 60 * 60;

export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best supported match for an `Accept-Language` header.
 *
 * Only consulted for a workstation that has never chosen — after that the
 * cookie wins, because a deliberate choice outranks a browser default. Quality
 * values are honoured so `ja;q=0.9, en;q=0.8` resolves the way the operator's
 * browser intends rather than by header order.
 */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params
        .map((param) => /^q=([\d.]+)$/.exec(param.trim())?.[1])
        .find((value) => value !== undefined);

      return {
        // `ja-JP` and `en-GB` should match `ja` and `en`.
        base: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '',
        quality: quality === undefined ? 1 : Number(quality),
      };
    })
    .filter((entry) => entry.base !== '' && Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const { base, quality } of ranked) {
    // q=0 is an explicit refusal, not a weak preference.
    if (quality === 0) continue;
    if (isLocale(base)) return base;
  }

  return null;
}

export function localeCookie(locale: Locale): string {
  return [
    `${LOCALE_COOKIE}=${locale}`,
    'Path=/',
    `Max-Age=${LOCALE_MAX_AGE}`,
    // Readable from script, unlike the position cookie: the switcher is a
    // client component and writes this itself.
    'SameSite=Lax',
  ].join('; ');
}
