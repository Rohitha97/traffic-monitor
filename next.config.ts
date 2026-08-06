import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Traces exactly the dependencies the server needs into .next/standalone,
  // which is what takes the runner image from ~1.2GB to under 200MB.
  output: 'standalone',

  // The state-matrix route exists so a reviewer can verify every component
  // state against Pass C. It is development-only scaffolding, so it is
  // rewritten to a 404 in production rather than shipped.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [{ source: '/dev/:path*', destination: '/404' }];
    }
    return [];
  },
};

export default nextConfig;
