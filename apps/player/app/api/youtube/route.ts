import { NextResponse, type NextRequest } from 'next/server';
import {
  createHttpTransport,
  findYouTubeVideo,
  silentLogger,
  USER_AGENT,
  YOUTUBE_API,
  type YouTubeMatch,
} from '@scrapeer/core';

/**
 * Finds the YouTube video for one track, on click. Each search costs 101 of the
 * 10,000 daily quota units, so answers (including "not found") are cached per track
 * for the server session.
 */
type Cache = Map<string, YouTubeMatch | null>;
const shared = globalThis as typeof globalThis & { scrapeerYouTube?: Cache };
const cache: Cache = (shared.scrapeerYouTube ??= new Map());

const transport = createHttpTransport({
  hosts: YOUTUBE_API.hosts,
  officialApi: YOUTUBE_API.officialApi,
  userAgent: USER_AGENT,
  robotsToken: 'scrapeer',
  limits: { 'www.googleapis.com': { capacity: 5, refillPerSec: 5, jitterMs: 100 } },
});

export type YouTubeAnswer = { match: YouTubeMatch | null } | { error: string };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get('id') ?? '';
  const title = params.get('title') ?? '';
  if (id === '' || title === '') {
    return NextResponse.json<YouTubeAnswer>({ error: 'id and title are required.' }, { status: 400 });
  }
  const cached = cache.get(id);
  if (cached !== undefined) return NextResponse.json<YouTubeAnswer>({ match: cached });

  const duration = Number(params.get('duration'));
  const found = await findYouTubeVideo(
    { artist: params.get('artist') ?? '', title, durationSec: duration > 0 ? duration : null },
    { transport, logger: silentLogger, apiKey: process.env.SCRAPEER_YOUTUBE_API_KEY ?? '' }
  );
  if (!found.ok) {
    return NextResponse.json<YouTubeAnswer>({ error: found.error.message }, { status: 502 });
  }
  cache.set(id, found.value);
  return NextResponse.json<YouTubeAnswer>({ match: found.value });
}
