import { describe, expect, it, vi } from "vitest";
import type { ScrapeError } from "../../core/errors";
import { silentLogger } from "../../core/logger";
import { err, ok, type Result } from "../../core/result";
import type { HttpTransport, TransportResponse } from "../../core/transport/http";
import { findYouTubeVideo, parseIsoDuration, YOUTUBE_API } from "./search";

const KEY = "test-key";

function json(url: URL, body: unknown): Result<TransportResponse, ScrapeError> {
  return ok({
    status: 200,
    requestUrl: url,
    finalUrl: url,
    headers: new Headers(),
    body: new TextEncoder().encode(JSON.stringify(body)),
    fetchedAt: "2026-11-28T00:00:00.000Z",
    access: "official_api",
  });
}

const SEARCH = {
  items: [
    { id: { videoId: "clip1" }, snippet: { title: "Daft Punk - One More Time (Official Video)" } },
    { id: { videoId: "topic1" }, snippet: { title: "One More Time" } },
  ],
};
const VIDEOS = {
  items: [
    { id: "clip1", contentDetails: { duration: "PT5M50S" } },
    { id: "topic1", contentDetails: { duration: "PT5M21S" } },
  ],
};

function transportWith(reply: (url: URL) => Result<TransportResponse, ScrapeError>) {
  const get = vi.fn<HttpTransport["get"]>(async (url) => reply(url));
  return { transport: { id: "http" as const, get }, get };
}

function api(url: URL): Result<TransportResponse, ScrapeError> {
  return json(url, url.pathname.endsWith("/search") ? SEARCH : VIDEOS);
}

describe("parseIsoDuration", () => {
  it.each([
    ["PT5M21S", 321],
    ["PT1H2M3S", 3723],
    ["PT45S", 45],
    ["P1DT1S", 86_401],
    ["P0D", null],
    ["nonsense", null],
  ])("reads %s as %s seconds", (iso, seconds) => {
    expect(parseIsoDuration(iso)).toBe(seconds);
  });
});

describe("findYouTubeVideo", () => {
  const track = { artist: "Daft Punk", title: "One More Time", durationSec: 320 };

  it("declares the Data API host as an official API", () => {
    expect(YOUTUBE_API.hosts).toStrictEqual(["www.googleapis.com"]);
    expect(YOUTUBE_API.officialApi[0]?.pathPrefix).toBe("/youtube/v3/");
  });

  it("searches embeddable videos, then reads their durations", async () => {
    const { transport, get } = transportWith(api);
    await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: KEY });
    const [search, videos] = get.mock.calls.map(([url]) => url);
    expect(search?.origin + (search?.pathname ?? "")).toBe(
      "https://www.googleapis.com/youtube/v3/search",
    );
    expect(Object.fromEntries(search?.searchParams ?? [])).toStrictEqual({
      part: "snippet",
      type: "video",
      videoEmbeddable: "true",
      maxResults: "5",
      q: "Daft Punk One More Time",
      key: KEY,
    });
    expect(videos?.pathname).toBe("/youtube/v3/videos");
    expect(Object.fromEntries(videos?.searchParams ?? [])).toStrictEqual({
      part: "contentDetails",
      id: "clip1,topic1",
      key: KEY,
    });
  });

  it("picks the video whose duration is closest to the track", async () => {
    const { transport } = transportWith(api);
    const found = await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: KEY });
    expect(found).toStrictEqual(
      ok({
        videoId: "topic1",
        title: "One More Time",
        durationSec: 321,
        url: "https://www.youtube.com/watch?v=topic1",
        exact: true,
      }),
    );
  });

  it("falls back to the first result, marked not exact, when no duration is close", async () => {
    const { transport } = transportWith(api);
    const found = await findYouTubeVideo(
      { ...track, durationSec: 100 },
      { transport, logger: silentLogger, apiKey: KEY },
    );
    expect(found).toMatchObject({ ok: true, value: { videoId: "clip1", exact: false } });
  });

  it("takes the first result when the track has no duration", async () => {
    const { transport } = transportWith(api);
    const found = await findYouTubeVideo(
      { ...track, durationSec: null },
      { transport, logger: silentLogger, apiKey: KEY },
    );
    expect(found).toMatchObject({ ok: true, value: { videoId: "clip1", exact: false } });
  });

  it("returns null without a second request when the search finds nothing", async () => {
    const { transport, get } = transportWith((url) => json(url, { items: [] }));
    const found = await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: KEY });
    expect(found).toStrictEqual(ok(null));
    expect(get).toHaveBeenCalledOnce();
  });

  it("passes a transport error through, tagged with the provider", async () => {
    const quota: ScrapeError = {
      kind: "auth_required",
      message: "www.googleapis.com refused (403).",
    };
    const { transport } = transportWith(() => err(quota));
    const found = await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: KEY });
    expect(found).toStrictEqual(err({ ...quota, provider: "youtube" }));
  });

  it("reports parse_failed for an unexpected body", async () => {
    const { transport } = transportWith((url) => json(url, { nope: true }));
    const found = await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: KEY });
    expect(found).toMatchObject({
      ok: false,
      error: { kind: "parse_failed", provider: "youtube" },
    });
  });

  it("refuses to search without an API key", async () => {
    const { transport, get } = transportWith(api);
    const found = await findYouTubeVideo(track, { transport, logger: silentLogger, apiKey: "" });
    expect(found).toMatchObject({
      ok: false,
      error: { kind: "auth_required", provider: "youtube" },
    });
    expect(get).not.toHaveBeenCalled();
  });
});
