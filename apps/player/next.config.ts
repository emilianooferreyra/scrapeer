import path from 'node:path';
import type { NextConfig } from 'next';

// User keys (SCRAPEER_YOUTUBE_API_KEY) live in the repo-root .env, shared by every app;
// Next itself only reads apps/player/.env. Existing variables are not overridden.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  // No root .env: YouTube search answers with a clear error instead.
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  // @scrapeer/core ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@scrapeer/core'],
  // Covers come from the Cover Art Archive, which redirects to archive.org mirrors;
  // the browser loads them directly instead of through the image optimizer.
  images: { unoptimized: true },
};

export default nextConfig;
