import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ScrapeError } from "./core/errors";
import { err, ok, type Result } from "./core/result";
import type { HttpTransport, TransportResponse } from "./core/transport/http";
import { createScrapeer } from "./service";

const IN_RAINBOWS = "https://musicbrainz.org/release/200f0a5a-41c4-49f3-b997-1ef5f975f060";
const release = readFileSync(
  new URL("../fixtures/musicbrainz/release-in-rainbows.json", import.meta.url),
  "utf8",
);

function reply(url: URL): Result<TransportResponse, ScrapeError> {
  return ok({
    status: 200,
    requestUrl: url,
    finalUrl: url,
    headers: new Headers({ "content-type": "application/json" }),
    body: new TextEncoder().encode(release),
    fetchedAt: "2026-11-27T22:06:51.312Z",
    access: "official_api",
  });
}

const busy = (retryAfterSec?: number): Result<TransportResponse, ScrapeError> =>
  err({
    kind: "rate_limited",
    message: "MusicBrainz is busy.",
    ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
  });

function setup(...answers: ((url: URL) => Result<TransportResponse, ScrapeError>)[]) {
  const get = vi.fn<HttpTransport["get"]>(async (url) => {
    const next = answers.shift() ?? reply;
    return next(url);
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
  const scrapeer = createScrapeer({ transport: { id: "http", get }, sleep });
  return { scrapeer, get, sleep };
}

describe("createScrapeer().resolve", () => {
  it("resolves a MusicBrainz release link into its album, in order", async () => {
    const { scrapeer } = setup();
    const result = await scrapeer.resolve(`  ${IN_RAINBOWS}  `);
    if (!result.ok || result.value.kind !== "collection") throw new Error("expected an album");
    expect(result.value.collection.title).toBe("In Rainbows");
    expect(result.value.page.items.map((track) => track.collection?.position)).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("rejects text that is not a link, without touching the network", async () => {
    const { scrapeer, get } = setup();
    expect(await scrapeer.resolve("in rainbows")).toStrictEqual({
      ok: false,
      error: { kind: "invalid_input", message: "That is not a link." },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a link no provider handles, without touching the network", async () => {
    const { scrapeer, get } = setup();
    expect(await scrapeer.resolve("https://open.spotify.com/album/1")).toStrictEqual({
      ok: false,
      error: {
        kind: "unsupported",
        message: "For now only MusicBrainz release or recording links work.",
      },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("retries a rate-limited lookup once, after the wait the source asks for", async () => {
    const { scrapeer, get, sleep } = setup(() => busy(2));
    const result = await scrapeer.resolve(IN_RAINBOWS);
    expect(result.ok).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls).toStrictEqual([[2000]]);
  });

  it("waits 1 s without Retry-After and never more than 5 s", async () => {
    const short = setup(() => busy());
    await short.scrapeer.resolve(IN_RAINBOWS);
    const long = setup(() => busy(120));
    await long.scrapeer.resolve(IN_RAINBOWS);
    expect([short.sleep.mock.calls, long.sleep.mock.calls]).toStrictEqual([[[1000]], [[5000]]]);
  });

  it("gives up after the one retry and returns the rate limit", async () => {
    const { scrapeer, get } = setup(
      () => busy(),
      () => busy(3),
    );
    const result = await scrapeer.resolve(IN_RAINBOWS);
    expect(result).toMatchObject({ ok: false, error: { kind: "rate_limited", retryAfterSec: 3 } });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const { scrapeer, get, sleep } = setup(() =>
      err({ kind: "not_found", message: "No such release." }),
    );
    const result = await scrapeer.resolve(IN_RAINBOWS);
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(get).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
