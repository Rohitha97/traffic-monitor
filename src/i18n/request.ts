import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  type Locale,
} from '@/i18n/locale';

/*
 * Where the server decides what language to render in.
 *
 * next-intl's "without i18n routing" setup: no `[locale]` segment, no
 * middleware rewriting URLs. This runs per request, resolves one locale, and
 * every Server Component below it translates without a client boundary.
 *
 * The resolution order is a preference ladder, most deliberate first:
 *
 *   1. the cookie — the operator chose this at this desk
 *   2. Accept-Language — the browser's opinion, for a desk that has not chosen
 *   3. `en` — the language the design was drawn in
 */

export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const negotiated = localeFromAcceptLanguage(
    (await headers()).get('accept-language'),
  );

  return negotiated ?? DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    /*
     * Loaded per request rather than imported at the top, so a build ships both
     * message files but a render only pays for the one it uses.
     */
    messages: (await import(`../../messages/${locale}.json`)).default,
    /*
     * Both clocks in the status bar are already rendered from explicit
     * timezones, and a control-room log is kept in UTC. Pinning this stops
     * `useFormatter` from silently adopting the server's zone, which in a
     * container is UTC and on a developer's laptop is not — a difference that
     * would show up as a visual-regression diff nobody could reproduce.
     */
    timeZone: 'UTC',
  };
});
