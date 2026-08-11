import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // Traces exactly the dependencies the server needs into .next/standalone,
  // which is what takes the runner image from ~1.2GB to under 200MB.
  output: 'standalone',

  /*
   * The state-matrix route is development-only scaffolding, and this is how it
   * is genuinely excluded rather than merely hidden.
   *
   * `src/app/dev/states/page.dev.tsx` is only recognised as a page when
   * `dev.tsx` is an allowed page extension. In a production build it is not, so
   * the directory has no page, the route does not exist, and Next returns a
   * real 404 — the component is never compiled and never enters the bundle.
   *
   * The first attempt here was a rewrite to /404, which does not work: a
   * plain `rewrites()` array runs *after* filesystem routes, so a rewrite can
   * never shadow a real page. It appeared to work only because the route did
   * not exist yet when it was first checked.
   */
  pageExtensions: isProduction
    ? ['ts', 'tsx']
    : ['ts', 'tsx', 'dev.ts', 'dev.tsx'],

  /*
   * The visual-regression suite drives the dev server over 127.0.0.1 rather
   * than the localhost the server reports, which Next flags as a cross-origin
   * dev request and warns will need declaring in a future major. Declaring it
   * now keeps the capture logs clean — a warning nobody has read is a warning
   * nobody will notice changing.
   */
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
