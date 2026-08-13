import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Noto_Sans_JP, Public_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';

import { resolveLocale } from '@/i18n/request';
import '@/styles/globals.css';

/*
 * Both families are self-hosted by next/font at build time — no runtime
 * request to Google, so the dashboard renders correctly on an air-gapped
 * control-room machine. (Pass B §03 for why these two.)
 */
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-public-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

/*
 * The Japanese face, in **both** locales.
 *
 * Not switched on the locale: a camera name or an operator note can be Japanese
 * on an English screen, and a font stack that only carries kanji when the UI
 * language is Japanese would render those as tofu. Per-glyph fallback does the
 * work — Public Sans has no kanji, so kanji reach this face; this face never
 * gets a Latin character or a digit, because Public Sans already answered.
 *
 * **Noto Sans JP rather than BIZ UDPGothic**, which the phase brief suggested.
 * BIZ UD is a genuinely good universal-design face and the better answer on
 * legibility grounds alone — but it ships only 400 and 700. This design encodes
 * meaning in the 500 and 600 steps (an unread row is 600 where a read one is
 * 500; a breaching age counter gains weight rather than a hue), and a face that
 * cannot set them would either synthesise or collapse them, losing an encoding
 * the interface reads at a glance. ADR-0011.
 */
const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

/*
 * The title is the operator's ambient alert channel: a critical event
 * rewrites it to "(1) CRITICAL · Incident Monitor" so the alert survives
 * the operator working on another monitor. (Pass C frame 2)
 */
export const metadata: Metadata = {
  title: 'Incident Monitor — Sector 4',
  description:
    'Highway traffic incident monitoring — detection triage for control-room operators.',
};

/*
 * No themeColor: it would have to be a literal hex here, duplicating
 * --color-ground outside the token layer, and it only tints mobile browser
 * chrome — which a 1440px+ control-room position never renders.
 */
export const viewport: Viewport = {
  colorScheme: 'dark',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveLocale();

  return (
    /*
     * `lang` is the resolved locale, not a constant.
     *
     * Screen readers switch synthesiser voice on this attribute — left at "en"
     * a Japanese interface is read aloud as English phonemes, which is not
     * merely wrong but unusable. It is also what the `[lang="ja"]` token block
     * hangs off, so the typography adjustments key on the same one fact.
     */
    <html
      lang={locale}
      className={`${publicSans.variable} ${ibmPlexMono.variable} ${notoSansJp.variable}`}
    >
      <body>
        {/*
         * Server Components below this read messages directly from the request
         * config; this provider exists for the client components that cannot.
         * The queue and the detail pane — the two largest render surfaces — do
         * not cross a client boundary to be translated.
         */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
