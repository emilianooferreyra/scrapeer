import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  // @scrapeer/core ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@scrapeer/core'],
};

export default nextConfig;
