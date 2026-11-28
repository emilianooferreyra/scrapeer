import { z } from "zod";
import type { ScrapeError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import { redactUrl } from "../../core/redact";
import { err, ok, type Result } from "../../core/result";
import type { HttpTransport, OfficialApi } from "../../core/transport/http";

const ID = "youtube";
const HOST = "www.googleapis.com";
/** A video within this many seconds of the track counts as the same recording. */
const DURATION_TOLERANCE_SEC = 15;

/** Hosts and API routes the transport needs for YouTube Data API v3 (ADR-018, ADR-024). */
export const YOUTUBE_API: {
  readonly hosts: readonly string[];
  readonly officialApi: readonly OfficialApi[];
} = {
  hosts: [HOST],
  officialApi: [
    { host: HOST, pathPrefix: "/youtube/v3/", docsUrl: "https://developers.google.com/youtube/v3" },
  ],
};

export type TrackQuery = {
  readonly artist: string;
  readonly title: string;
  readonly durationSec: number | null;
};

export type YouTubeMatch = {
  readonly videoId: string;
  readonly title: string;
  readonly durationSec: number | null;
  readonly url: string;
  /** False when no result was within the duration tolerance and the first one was taken. */
  readonly exact: boolean;
};

export type YouTubeCtx = {
  readonly transport: HttpTransport;
  readonly logger: Logger;
  /** The user's own key, from env only (docs/04-pipeline.md). Travels in the query; transport and errors redact it. */
  readonly apiKey: string;
  readonly signal?: AbortSignal;
};

const SearchResponse = z.object({
  items: z.array(
    z.object({ id: z.object({ videoId: z.string() }), snippet: z.object({ title: z.string() }) }),
  ),
});
const VideosResponse = z.object({
  items: z.array(z.object({ id: z.string(), contentDetails: z.object({ duration: z.string() }) })),
});

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** ISO 8601 duration (`PT5M21S`) to seconds; zero (live streams report `P0D`) or malformed is `null`. */
export function parseIsoDuration(iso: string): number | null {
  const parts = ISO_DURATION.exec(iso);
  if (parts === null) return null;
  const [days = 0, hours = 0, minutes = 0, seconds = 0] = parts
    .slice(1)
    .map((part) => Number(part ?? 0));
  const total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return total > 0 ? total : null;
}

function failure(kind: ScrapeError["kind"], message: string): ScrapeError {
  return { kind, message, provider: ID };
}

async function getJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  ctx: YouTubeCtx,
): Promise<Result<T, ScrapeError>> {
  const response = await ctx.transport.get(url, {
    accept: "application/json",
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  });
  if (!response.ok) return err({ ...response.error, provider: ID });
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.value.body));
  } catch {
    return err(
      failure(
        "parse_failed",
        `YouTube answered ${redactUrl(url)} with something that is not JSON.`,
      ),
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    return err(failure("parse_failed", `YouTube ${url.pathname} JSON changed shape.`));
  return ok(parsed.data);
}

function apiUrl(path: "search" | "videos", params: Record<string, string>, apiKey: string): URL {
  const url = new URL(`https://${HOST}/youtube/v3/${path}`);
  for (const [name, value] of Object.entries({ ...params, key: apiKey }))
    url.searchParams.set(name, value);
  return url;
}

/**
 * Finds the YouTube video for a track: one `search.list` (100 quota units) for embeddable videos,
 * then one `videos.list` (1 unit) to compare durations. `null` when the search finds nothing.
 */
export async function findYouTubeVideo(
  track: TrackQuery,
  ctx: YouTubeCtx,
): Promise<Result<YouTubeMatch | null, ScrapeError>> {
  if (ctx.apiKey === "") {
    return err(failure("auth_required", "Set SCRAPEER_YOUTUBE_API_KEY to search YouTube."));
  }
  const query = [track.artist, track.title].filter((part) => part !== "").join(" ");
  const search = await getJson(
    apiUrl(
      "search",
      { part: "snippet", type: "video", videoEmbeddable: "true", maxResults: "5", q: query },
      ctx.apiKey,
    ),
    SearchResponse,
    ctx,
  );
  if (!search.ok) return search;
  const results = search.value.items;
  const first = results[0];
  if (first === undefined) return ok(null);

  const videos = await getJson(
    apiUrl(
      "videos",
      { part: "contentDetails", id: results.map((item) => item.id.videoId).join(",") },
      ctx.apiKey,
    ),
    VideosResponse,
    ctx,
  );
  if (!videos.ok) return videos;
  const durations = new Map(
    videos.value.items.map((video) => [video.id, parseIsoDuration(video.contentDetails.duration)]),
  );
  const candidates = results.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    durationSec: durations.get(item.id.videoId) ?? null,
  }));

  const target = track.durationSec;
  const distance = (seconds: number | null) =>
    target === null || seconds === null ? Number.POSITIVE_INFINITY : Math.abs(seconds - target);
  const closest = candidates.reduce((best, candidate) =>
    distance(candidate.durationSec) < distance(best.durationSec) ? candidate : best,
  );
  const exact = distance(closest.durationSec) <= DURATION_TOLERANCE_SEC;
  const chosen = exact ? closest : (candidates[0] ?? closest);
  return ok({ ...chosen, url: `https://www.youtube.com/watch?v=${chosen.videoId}`, exact });
}
