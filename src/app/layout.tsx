import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Public_Sans } from 'next/font/google';

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
