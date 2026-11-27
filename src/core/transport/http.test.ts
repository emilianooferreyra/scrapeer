import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../logger";
import { createHttpTransport, type FetchLike, type HttpTransportOptions } from "./http";
import type { RateLimiter } from "./rate-limiter";

type Route = Response | ((init: RequestInit) => Response | Promise<Response>);

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (route === undefined) return new Response("missing route", { status: 599 });
    if (typeof route === "function") return route(init);
    // A fresh Response per call: a clone tees the stream, and cancelling one branch waits for the other.
    const bytes = new Uint8Array(await route.clone().arrayBuffer());
    return new Response(bytes.byteLength === 0 ? null : bytes, {
      status: route.status,
      headers: route.headers,
    });
  };
  return { fetch, calls };
}

const ROBOTS_URL = "https://musicbrainz.org/robots.txt";
const API_URL = "https://musicbrainz.org/ws/2/release/abc?fmt=json";

function logger() {
  return {
    debug: vi.fn<Logger["debug"]>(),
    info: vi.fn<Logger["info"]>(),
    warn: vi.fn<Logger["warn"]>(),
  };
}

function transport(routes: Record<string, Route>, overrides: Partial<HttpTransportOptions> = {}) {
  const fake = fakeFetch(routes);
  const log = logger();
  const acquire = vi.fn<RateLimiter["acquire"]>(() => Promise.resolve());
  const limiter: RateLimiter = { acquire };
  const http = createHttpTransport({
    hosts: ["musicbrainz.org"],
    officialApi: [
      {
        host: "musicbrainz.org",
        pathPrefix: "/ws/2/",
        docsUrl: "https://musicbrainz.org/doc/MusicBrainz_API",
      },
    ],
    userAgent: "scrapeer/0.0.0 ( https://github.com/emilianooferreyra/scrapeer )",
    robotsToken: "scrapeer",
    fetch: fake.fetch,
    lookup: () => Promise.resolve(["138.201.227.205"]),
    rateLimiter: limiter,
    now: () => new Date("2026-11-27T12:00:00.000Z"),
    logger: log,
    ...overrides,
  });
  return { http, calls: fake.calls, log, acquire };
}

const robots = (text: string) => new Response(text, { status: 200 });

/** Sends one byte, then the stream breaks. */
const broken = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([1]));
        stream.error(new TypeError("terminated"));
      },
    }),
    { status: 200 },
  );

/** Sends one byte, then stalls until the request is aborted. */
const stalled = (init: RequestInit) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new Uint8Array([1]));
        init.signal?.addEventListener("abort", () => stream.error(init.signal?.reason));
      },
    }),
    { status: 200 },
  );

/** Never answers; rejects when the request is aborted. */
const hang = (init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });

describe("createHttpTransport", () => {
  it("returns the body, final URL, access type and fetch time", async () => {
    const { http, calls } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response('{"id":"abc"}', { status: 200 }),
    });
    const result = await http.get(new URL(API_URL), { accept: "application/json" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new TextDecoder().decode(result.value.body)).toBe('{"id":"abc"}');
    expect(result.value).toMatchObject({
      status: 200,
      access: "official_api",
      fetchedAt: "2026-11-27T12:00:00.000Z",
    });
    expect(result.value.finalUrl.href).toBe(API_URL);
    const headers = new Headers(calls.at(-1)?.init.headers);
    expect(headers.get("user-agent")).toBe(
      "scrapeer/0.0.0 ( https://github.com/emilianooferreyra/scrapeer )",
    );
    expect(headers.get("accept")).toBe("application/json");
    expect(calls.at(-1)?.init.redirect).toBe("manual");
  });

  it("reads robots.txt once per host, before the first request", async () => {
    const { http, calls } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response("{}", { status: 200 }),
    });
    await http.get(new URL(API_URL));
    await http.get(new URL(API_URL));
    expect(calls.map((call) => call.url)).toEqual([ROBOTS_URL, API_URL, API_URL]);
  });

  it("records, but does not block, a robots.txt disallow on a declared official API", async () => {
    const { http, log } = transport({
      [ROBOTS_URL]: robots("User-agent: *\nDisallow: /ws"),
      [API_URL]: new Response("{}", { status: 200 }),
    });
    const result = await http.get(new URL(API_URL));
    expect(result.ok).toBe(true);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "musicbrainz.org",
        docsUrl: "https://musicbrainz.org/doc/MusicBrainz_API",
      }),
      expect.stringContaining("ADR-024"),
    );
  });

  it("blocks a web page that robots.txt disallows, without requesting it", async () => {
    const page = "https://musicbrainz.org/release/abc";
    const { http, calls } = transport({
      [ROBOTS_URL]: robots("User-agent: *\nDisallow: /release"),
      [page]: new Response("<html>", { status: 200 }),
    });
    const result = await http.get(new URL(page));
    expect(result).toMatchObject({ ok: false, error: { kind: "robots_disallowed" } });
    expect(calls.map((call) => call.url)).toEqual([ROBOTS_URL]);
  });

  it("treats a missing robots.txt (4xx) as allowing everything", async () => {
    const page = "https://musicbrainz.org/release/abc";
    const { http } = transport({
      [ROBOTS_URL]: new Response("nope", { status: 404 }),
      [page]: new Response("<html>", { status: 200 }),
    });
    expect((await http.get(new URL(page))).ok).toBe(true);
  });

  it("stops with a host whose robots.txt fails with 5xx", async () => {
    const { http, calls } = transport({ [ROBOTS_URL]: new Response("down", { status: 500 }) });
    const result = await http.get(new URL(API_URL));
    expect(result).toMatchObject({ ok: false, error: { kind: "upstream_error" } });
    expect(calls.map((call) => call.url)).toEqual([ROBOTS_URL]);
  });

  it("follows a redirect inside the allowlist and reports the final URL", async () => {
    const moved = "https://musicbrainz.org/ws/2/release/def?fmt=json";
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response(null, {
        status: 301,
        headers: { location: "/ws/2/release/def?fmt=json" },
      }),
      [moved]: new Response("{}", { status: 200 }),
    });
    const result = await http.get(new URL(API_URL));
    expect(result.ok && result.value.finalUrl.href).toBe(moved);
  });

  it("refuses a redirect to a host outside the allowlist", async () => {
    const { http, calls } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response(null, { status: 302, headers: { location: "https://evil.test/x" } }),
    });
    const result = await http.get(new URL(API_URL));
    expect(result).toMatchObject({ ok: false, error: { kind: "host_not_allowed" } });
    expect(calls.some((call) => call.url.startsWith("https://evil.test"))).toBe(false);
  });

  it("gives up after too many redirects", async () => {
    const { http } = transport(
      {
        [ROBOTS_URL]: robots(""),
        [API_URL]: new Response(null, { status: 302, headers: { location: API_URL } }),
      },
      { maxRedirects: 3 },
    );
    const result = await http.get(new URL(API_URL));
    expect(result).toMatchObject({ ok: false, error: { kind: "upstream_error" } });
  });

  it("refuses a host that resolves to a private address, before any request", async () => {
    const { http, calls } = transport(
      { [ROBOTS_URL]: robots("") },
      { lookup: () => Promise.resolve(["138.201.227.205", "10.0.0.5"]) },
    );
    const result = await http.get(new URL(API_URL));
    expect(result).toMatchObject({ ok: false, error: { kind: "host_not_allowed" } });
    expect(calls).toEqual([]);
  });

  it("refuses a host outside the allowlist before any request", async () => {
    const { http, calls } = transport({});
    const result = await http.get(new URL("https://example.com/"));
    expect(result).toMatchObject({ ok: false, error: { kind: "host_not_allowed" } });
    expect(calls).toEqual([]);
  });

  it.each([
    [404, "not_found"],
    [410, "not_found"],
    [401, "auth_required"],
    [403, "auth_required"],
    [500, "upstream_error"],
    [503, "rate_limited"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response("x", { status }),
    });
    expect(await http.get(new URL(API_URL))).toMatchObject({ ok: false, error: { kind } });
  });

  it("maps 429 to rate_limited and keeps Retry-After", async () => {
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response("slow down", { status: 429, headers: { "retry-after": "12" } }),
    });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "rate_limited", retryAfterSec: 12 },
    });
  });

  it("rejects a body larger than maxBytes", async () => {
    const { http } = transport(
      { [ROBOTS_URL]: robots(""), [API_URL]: new Response("x".repeat(100), { status: 200 }) },
      { maxBytes: 10 },
    );
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "upstream_error" },
    });
  });

  it("times out a request that does not answer", async () => {
    const { http } = transport({ [ROBOTS_URL]: robots(""), [API_URL]: hang }, { timeoutMs: 20 });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "timeout" },
    });
  });

  it("returns an error, not an exception, for a malformed redirect location", async () => {
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: new Response(null, { status: 302, headers: { location: "https://[bad" } }),
    });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "upstream_error" },
    });
  });

  it("returns an error when the caller cancels during the rate-limit wait", async () => {
    const controller = new AbortController();
    const { http } = transport(
      { [ROBOTS_URL]: robots(""), [API_URL]: new Response("{}", { status: 200 }) },
      { rateLimiter: { acquire: () => Promise.reject(new DOMException("aborted", "AbortError")) } },
    );
    controller.abort();
    expect(await http.get(new URL(API_URL), { signal: controller.signal })).toMatchObject({
      ok: false,
      error: { kind: "network_error" },
    });
  });

  it("returns network_error when the body stream breaks", async () => {
    const { http } = transport({ [ROBOTS_URL]: robots(""), [API_URL]: broken });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "network_error" },
    });
  });

  it("times out while reading a body that stalls", async () => {
    const { http } = transport({ [ROBOTS_URL]: robots(""), [API_URL]: stalled }, { timeoutMs: 30 });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "timeout" },
    });
  });

  it("times out a DNS lookup that never answers", async () => {
    const { http } = transport({}, { lookup: () => new Promise(() => undefined), timeoutMs: 30 });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "timeout" },
    });
  });

  it("does not echo the underlying network error, which can carry credentials", async () => {
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: () => Promise.reject(new TypeError("failed https://x.test/?api_key=SECRET")),
    });
    const result = await http.get(new URL(API_URL));
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("maps a network failure to network_error", async () => {
    const { http } = transport({
      [ROBOTS_URL]: robots(""),
      [API_URL]: () => Promise.reject(new TypeError("fetch failed")),
    });
    expect(await http.get(new URL(API_URL))).toMatchObject({
      ok: false,
      error: { kind: "network_error" },
    });
  });

  it("waits for the rate limiter before every request, including robots.txt", async () => {
    const limit = { capacity: 1, refillPerSec: 1, jitterMs: 250 };
    const { http, acquire } = transport(
      { [ROBOTS_URL]: robots(""), [API_URL]: new Response("{}", { status: 200 }) },
      { limits: { "musicbrainz.org": limit } },
    );
    await http.get(new URL(API_URL));
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenCalledWith("musicbrainz.org", limit, undefined);
  });
});
