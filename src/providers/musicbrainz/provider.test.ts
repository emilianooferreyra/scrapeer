import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ScrapeError } from "../../core/errors";
import type { Ctx } from "../../core/provider";
import { err, ok, type Result } from "../../core/result";
import { Resource } from "../../core/schema";
import { silentLogger } from "../../core/logger";
import type { HttpTransport, TransportResponse } from "../../core/transport/http";
import { musicbrainz } from "./provider";

const IN_RAINBOWS = "200f0a5a-41c4-49f3-b997-1ef5f975f060";
const CREEP = "40359441-199d-48c1-9b4f-f89ddd579c41";
const ROLLING_STONE = "26244520-0e1d-4d42-b101-ce6b83299d33";
const FETCHED_AT = "2026-11-27T22:06:51.312Z";
const HASH: unknown = expect.stringMatching(/^sha256:[0-9a-f]{64}$/);

function fixture(name: string): string {
  return readFileSync(new URL(`../../../fixtures/musicbrainz/${name}`, import.meta.url), "utf8");
}

function answer(body: string, fetchedAt = FETCHED_AT) {
  return (url: URL): Result<TransportResponse, ScrapeError> =>
    ok({
      status: 200,
      requestUrl: url,
      finalUrl: url,
      headers: new Headers({ "content-type": "application/json" }),
      body: new TextEncoder().encode(body),
      fetchedAt,
      access: "official_api",
    });
}

function ctxWith(
  reply: (url: URL) => Result<TransportResponse, ScrapeError>,
  signal?: AbortSignal,
) {
  const get = vi.fn<HttpTransport["get"]>(async (url) => reply(url));
  const ctx: Ctx = {
    transport: { id: "http", get },
    logger: silentLogger,
    ...(signal === undefined ? {} : { signal }),
  };
  return { ctx, get };
}

async function resolveOk(url: string, body: string, fetchedAt = FETCHED_AT) {
  const { ctx } = ctxWith(answer(body, fetchedAt));
  const result = await musicbrainz.resolve(new URL(url), ctx);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}: ${result.error.message}`);
  return result.value;
}

describe("musicbrainz provider", () => {
  it("declares its host, official API, capabilities and a closed export policy", () => {
    expect(musicbrainz.id).toBe("musicbrainz");
    expect(musicbrainz.hosts).toStrictEqual(["musicbrainz.org"]);
    expect(musicbrainz.officialApi).toStrictEqual([
      {
        host: "musicbrainz.org",
        pathPrefix: "/ws/2/",
        docsUrl: "https://musicbrainz.org/doc/MusicBrainz_API",
      },
    ]);
    expect([...musicbrainz.capabilities]).toStrictEqual(["track", "collection"]);
    expect(musicbrainz.policy.export).toBe(false);
    expect(musicbrainz.match(new URL(`https://musicbrainz.org/release/${IN_RAINBOWS}`))).toBe(true);
  });

  it("requests the release lookup with recordings, artist credits and ISRCs", async () => {
    const signal = new AbortController().signal;
    const { ctx, get } = ctxWith(answer(fixture("release-in-rainbows.json")), signal);
    await musicbrainz.resolve(
      new URL(`http://www.musicbrainz.org/release/${IN_RAINBOWS}?x=1`),
      ctx,
    );
    expect(get).toHaveBeenCalledOnce();
    const [url, options] = get.mock.calls[0] ?? [];
    expect(url?.href).toBe(
      `https://musicbrainz.org/ws/2/release/${IN_RAINBOWS}?inc=recordings+artist-credits+isrcs&fmt=json`,
    );
    expect(options).toStrictEqual({ accept: "application/json", signal });
  });

  it("requests the recording lookup with artist credits and ISRCs", async () => {
    const { ctx, get } = ctxWith(answer(fixture("recording-several-isrcs.json")));
    await musicbrainz.resolve(new URL(`https://musicbrainz.org/recording/${ROLLING_STONE}`), ctx);
    expect(get.mock.calls[0]?.[0].href).toBe(
      `https://musicbrainz.org/ws/2/recording/${ROLLING_STONE}?inc=artist-credits+isrcs&fmt=json`,
    );
  });

  it("resolves a release as an album with its tracks in order", async () => {
    const source = `https://musicbrainz.org/release/${IN_RAINBOWS}`;
    const value = await resolveOk(source, fixture("release-in-rainbows.json"));
    expect(Resource.safeParse(value).success).toBe(true);
    if (value.kind !== "collection") throw new Error("expected a collection");

    const requestUrl = `https://musicbrainz.org/ws/2/release/${IN_RAINBOWS}?inc=recordings+artist-credits+isrcs&fmt=json`;
    expect(value.collection).toStrictEqual({
      schemaVersion: 1,
      provider: "musicbrainz",
      id: IN_RAINBOWS,
      url: source,
      title: "In Rainbows",
      type: "album",
      artist: "Radiohead",
      license: null,
      trackCount: 10,
      provenance: {
        sourceUrl: source,
        requestUrl,
        fetchedAt: FETCHED_AT,
        transport: "api",
        rawHash: HASH,
        contentHash: HASH,
        providerVersion: "0.1.0",
      },
    });
    expect(value.page.nextCursor).toBeNull();
    expect(
      value.page.items.map((track) => [track.collection?.position, track.title]),
    ).toStrictEqual([
      [1, "15 Step"],
      [2, "Bodysnatchers"],
      [3, "Nude"],
      [4, "Weird Fishes/Arpeggi"],
      [5, "All I Need"],
      [6, "Faust Arp"],
      [7, "Reckoner"],
      [8, "House of Cards"],
      [9, "Jigsaw Falling Into Place"],
      [10, "Videotape"],
    ]);
    expect(value.page.items[0]).toStrictEqual({
      schemaVersion: 1,
      provider: "musicbrainz",
      id: "faea2aa0-80a9-41be-9b1e-3b994f4f76ac",
      url: "https://musicbrainz.org/recording/faea2aa0-80a9-41be-9b1e-3b994f4f76ac",
      artist: "Radiohead",
      title: "15 Step",
      durationSec: 238,
      plays: null,
      popularity: null,
      isrcs: ["GBSTK0700001"],
      availability: null,
      publishedAt: "2008-01-01T00:00:00Z",
      license: null,
      collection: { id: IN_RAINBOWS, position: 1 },
      tags: [],
      artworkUrl: null,
      downloadable: false,
      description: null,
      provenance: {
        sourceUrl: source,
        requestUrl,
        fetchedAt: FETCHED_AT,
        transport: "api",
        rawHash: HASH,
        contentHash: HASH,
        providerVersion: "0.1.0",
      },
    });
  });

  it("leaves publishedAt null for a partial release date and isrcs empty when none is known", async () => {
    const value = await resolveOk(
      `https://musicbrainz.org/release/${CREEP}`,
      fixture("release-partial-date.json"),
    );
    if (value.kind !== "collection") throw new Error("expected a collection");
    expect(value.page.items.map((track) => [track.publishedAt, track.isrcs])).toStrictEqual([
      [null, ["GBAYE9200070"]],
      [null, []],
      [null, []],
      [null, []],
    ]);
  });

  it("resolves a recording as a track with every ISRC and its first release date", async () => {
    const value = await resolveOk(
      `https://musicbrainz.org/recording/${ROLLING_STONE}`,
      fixture("recording-several-isrcs.json"),
    );
    expect(Resource.safeParse(value).success).toBe(true);
    if (value.kind !== "track") throw new Error("expected a track");
    expect(value.track).toMatchObject({
      id: ROLLING_STONE,
      artist: "Bob Dylan",
      title: "Like a Rolling Stone",
      durationSec: 370,
      isrcs: ["USSM10307542", "USSM16500146", "USSM16501022", "USSM16501137", "USSM19922509"],
      publishedAt: "1965-08-30T00:00:00Z",
      collection: null,
      plays: null,
      popularity: null,
      license: null,
      tags: [],
    });
  });

  it("uses null for a missing duration", async () => {
    const body = fixture("recording-several-isrcs.json").replace(
      '"length":369733',
      '"length":null',
    );
    const value = await resolveOk(`https://musicbrainz.org/recording/${ROLLING_STONE}`, body);
    if (value.kind !== "track") throw new Error("expected a track");
    expect(value.track.durationSec).toBeNull();
  });

  it("keeps contentHash when only the fetch time changes, and changes it with the data", async () => {
    const url = `https://musicbrainz.org/recording/${ROLLING_STONE}`;
    const body = fixture("recording-several-isrcs.json");
    const first = await resolveOk(url, body);
    const later = await resolveOk(url, body, "2026-12-01T00:00:00.000Z");
    const renamed = await resolveOk(
      url,
      body.replace('"title":"Like a Rolling Stone"', '"title":"Renamed"'),
    );
    if (first.kind !== "track" || later.kind !== "track" || renamed.kind !== "track") {
      throw new Error("expected tracks");
    }
    expect(later.track.provenance.contentHash).toBe(first.track.provenance.contentHash);
    expect(renamed.track.provenance.contentHash).not.toBe(first.track.provenance.contentHash);
  });

  it("rejects a URL it does not match without touching the network", async () => {
    const { ctx, get } = ctxWith(answer("{}"));
    const result = await musicbrainz.resolve(new URL("https://musicbrainz.org/artist/x"), ctx);
    expect(result).toStrictEqual(
      err({
        kind: "invalid_input",
        message: "Not a MusicBrainz release or recording link: https://musicbrainz.org/artist/x",
        provider: "musicbrainz",
        url: "https://musicbrainz.org/artist/x",
      }),
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("passes a transport error through, tagged with the provider", async () => {
    const limited: ScrapeError = {
      kind: "rate_limited",
      message: "musicbrainz.org is rate limiting or overloaded (503); wait and retry.",
      retryAfterSec: 1,
    };
    const { ctx } = ctxWith(() => err(limited));
    const result = await musicbrainz.resolve(
      new URL(`https://musicbrainz.org/release/${IN_RAINBOWS}`),
      ctx,
    );
    expect(result).toStrictEqual(err({ ...limited, provider: "musicbrainz" }));
  });

  it.each([
    ["a body that is not JSON", "<html>maintenance</html>"],
    ["JSON without the release fields", '{"error":"nope"}'],
  ])("reports parse_failed for %s", async (_case, body) => {
    const { ctx } = ctxWith(answer(body));
    const result = await musicbrainz.resolve(
      new URL(`https://musicbrainz.org/release/${IN_RAINBOWS}`),
      ctx,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "parse_failed", provider: "musicbrainz" },
    });
  });

  it("reports validation_failed when the mapped record breaks the schema", async () => {
    const body = fixture("recording-several-isrcs.json").replace('"USSM10307542"', '"not-an-isrc"');
    const { ctx } = ctxWith(answer(body));
    const result = await musicbrainz.resolve(
      new URL(`https://musicbrainz.org/recording/${ROLLING_STONE}`),
      ctx,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "validation_failed", provider: "musicbrainz" },
    });
  });
});
