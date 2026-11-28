import { NextResponse, type NextRequest } from 'next/server';
import {
  createHttpTransport,
  findYouTubeVideo,
  silentLogger,
  USER_AGENT,
  YOUTUBE_API,
  type YouTubeMatch,
} from '@scrapeer/core';
import { findSong } from '@/lib/library';

/**
 * Finds the YouTube video for one library song, on click. Each search costs 101 of the
 * 10,000 daily quota units, so answers (including "not found") are cached per song.
 * The search uses the library's own artist, title and duration, never the request's,
 * so a caller cannot spend quota on arbitrary queries or cache a wrong match.
 */
const CACHE_LIMIT = 500;
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

function remember(id: string, match: YouTubeMatch | null) {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(id, match);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const song = findSong(id);
  if (song === null) {
    return NextResponse.json<YouTubeAnswer>(
      { error: 'That track is not in the library; load its album first.' },
      { status: 404 }
    );
  }
  const cached = cache.get(id);
  if (cached !== undefined) return NextResponse.json<YouTubeAnswer>({ match: cached });

  const found = await findYouTubeVideo(
    { artist: song.artist, title: song.name, durationSec: song.duration > 0 ? song.duration : null },
    { transport, logger: silentLogger, apiKey: process.env.SCRAPEER_YOUTUBE_API_KEY ?? '' }
  );
  if (!found.ok) {
    return NextResponse.json<YouTubeAnswer>({ error: found.error.message }, { status: 502 });
  }
  remember(id, found.value);
  return NextResponse.json<YouTubeAnswer>({ match: found.value });
}
