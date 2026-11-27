import { lookup as dnsLookup } from "node:dns/promises";
import { setTimeout as delayFor } from "node:timers/promises";
import type { ScrapeError } from "../errors.js";
import { silentLogger, type Logger } from "../logger.js";
import { redactUrl } from "../redact.js";
import { err, ok, type Result } from "../result.js";
import { checkTarget, isPublicAddress } from "./host-guard.js";
import { createRateLimiter, type HostLimit, type RateLimiter } from "./rate-limiter.js";
import { isPathAllowed, parseRobots, type RobotsRules } from "./robots.js";

/** A host and path prefix a provider declares as its documented API (ADR-024). */
export type OfficialApi = {
  readonly host: string;
  readonly pathPrefix: string;
  readonly docsUrl: string;
};

export type Access = "official_api" | "web";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type HttpTransportOptions = {
  /** Exact hosts this transport may contact, on the first request and on every redirect (ADR-018). */
  readonly hosts: readonly string[];
  readonly officialApi: readonly OfficialApi[];
  /** Identifies the tool and a contact; never a browser string (ADR-017). */
  readonly userAgent: string;
  /** Product token looked up in robots.txt groups. */
  readonly robotsToken: string;
  /** Per-host limits; hosts not listed use `defaultLimit`. */
  readonly limits?: Readonly<Record<string, HostLimit>>;
  readonly defaultLimit?: HostLimit;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly fetch?: FetchLike;
  readonly lookup?: (hostname: string) => Promise<readonly string[]>;
  readonly rateLimiter?: RateLimiter;
  readonly now?: () => Date;
  readonly logger?: Logger;
};

export type TransportResponse = {
  readonly status: number;
  readonly requestUrl: URL;
  readonly finalUrl: URL;
  readonly headers: Headers;
  readonly body: Uint8Array;
  /** ISO 8601 UTC. */
  readonly fetchedAt: string;
  /** Access type of the final hop; decides how robots.txt applied. */
  readonly access: Access;
};

export type GetOptions = { readonly accept?: string; readonly signal?: AbortSignal };

export type HttpTransport = {
  readonly id: "http";
  get(url: URL, options?: GetOptions): Promise<Result<TransportResponse, ScrapeError>>;
};

/** docs/04-pipeline.md defaults. */
const DEFAULT_LIMIT: HostLimit = { capacity: 5, refillPerSec: 1, jitterMs: 2000 };
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

async function defaultLookup(hostname: string): Promise<readonly string[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return delayFor(ms, undefined, signal === undefined ? {} : { signal });
}

/** Retry-After as whole seconds: delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: Date): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

type Hop = { readonly response: Response; readonly url: URL };

function failure(
  kind: ScrapeError["kind"],
  url: URL,
  message: string,
  retryAfterSec?: number,
): Result<never, ScrapeError> {
  return err({
    kind,
    message,
    url: redactUrl(url),
    ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
  });
}

export function createHttpTransport(options: HttpTransportOptions): HttpTransport {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const lookup = options.lookup ?? defaultLookup;
  const limiter =
    options.rateLimiter ??
    createRateLimiter({ now: () => Date.now(), sleep: defaultSleep, random: Math.random });
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? silentLogger;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const robotsCache = new Map<string, Promise<Result<RobotsRules, ScrapeError>>>();

  const limitFor = (host: string): HostLimit =>
    options.limits?.[host] ?? options.defaultLimit ?? DEFAULT_LIMIT;

  const officialApiFor = (url: URL): OfficialApi | undefined =>
    options.officialApi.find(
      (api) => api.host === url.hostname && url.pathname.startsWith(api.pathPrefix),
    );

  /** One request, no redirects followed: guard, DNS check, rate limit, timeout. */
  async function send(
    url: URL,
    accept: string,
    signal?: AbortSignal,
  ): Promise<Result<Hop, ScrapeError>> {
    const target = checkTarget(url, options.hosts);
    if (!target.ok) return target;

    let addresses: readonly string[];
    try {
      addresses = await lookup(url.hostname);
    } catch {
      return failure(
        "network_error",
        url,
        `Could not resolve ${url.hostname}; check your connection.`,
      );
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      return failure(
        "host_not_allowed",
        url,
        `Refused ${url.hostname}: it resolves to a private or reserved address.`,
      );
    }

    await limiter.acquire(url.hostname, limitFor(url.hostname), signal);

    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": options.userAgent, accept },
        signal: signal === undefined ? timeout : AbortSignal.any([timeout, signal]),
      });
      return ok({ response, url });
    } catch (error) {
      if (timeout.aborted) {
        return failure("timeout", url, `${url.hostname} did not answer within ${timeoutMs} ms.`);
      }
      const reason = error instanceof Error ? error.message : "unknown error";
      return failure("network_error", url, `Request to ${url.hostname} failed: ${reason}.`);
    }
  }

  /** Follows redirects by hand; `beforeHop` runs for every URL, including the first. */
  async function follow(
    start: URL,
    accept: string,
    signal: AbortSignal | undefined,
    beforeHop: (url: URL) => Promise<Result<Access, ScrapeError>>,
  ): Promise<Result<Hop & { readonly access: Access }, ScrapeError>> {
    let url = start;
    for (let hop = 0; ; hop += 1) {
      const target = checkTarget(url, options.hosts);
      if (!target.ok) return target;
      const access = await beforeHop(url);
      if (!access.ok) return access;

      const sent = await send(url, accept, signal);
      if (!sent.ok) return sent;
      const { response } = sent.value;

      const location = response.headers.get("location");
      if (!REDIRECTS.has(response.status) || location === null) {
        return ok({ ...sent.value, access: access.value });
      }
      if (hop >= maxRedirects) {
        return failure("upstream_error", start, `Stopped after ${maxRedirects} redirects.`);
      }
      await response.body?.cancel();
      url = new URL(location, url);
    }
  }

  async function readBody(response: Response, url: URL): Promise<Result<Uint8Array, ScrapeError>> {
    const tooLarge = () =>
      failure("upstream_error", url, `The response is larger than the ${maxBytes}-byte limit.`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel();
      return tooLarge();
    }
    if (response.body === null) return ok(new Uint8Array());

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader: ReadableStreamDefaultReader<unknown> = response.body.getReader();
    for (;;) {
      const next: { readonly done: boolean; readonly value?: unknown } = await reader.read();
      if (next.done) break;
      const value = next.value;
      if (!(value instanceof Uint8Array)) {
        await reader.cancel();
        return failure("upstream_error", url, "The response body is not a byte stream.");
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return ok(body);
  }

  async function fetchRobots(
    host: string,
    signal?: AbortSignal,
  ): Promise<Result<RobotsRules, ScrapeError>> {
    const url = new URL(`https://${host}/robots.txt`);
    const sent = await follow(url, "text/plain", signal, () => Promise.resolve(ok<Access>("web")));
    if (!sent.ok) return sent;
    const { response } = sent.value;

    if (response.status >= 500) {
      await response.body?.cancel();
      return failure(
        "upstream_error",
        url,
        `robots.txt for ${host} returned ${response.status}; not continuing with this host.`,
      );
    }
    if (response.status >= 400) {
      await response.body?.cancel();
      logger.debug({ host, status: response.status }, "No robots.txt; every path is allowed.");
      return ok([]);
    }
    const body = await readBody(response, url);
    if (!body.ok) return body;
    return ok(parseRobots(new TextDecoder().decode(body.value), options.robotsToken));
  }

  /** Reads robots.txt once per host, before its first request; a failure is retried next time. */
  function robotsFor(
    host: string,
    signal?: AbortSignal,
  ): Promise<Result<RobotsRules, ScrapeError>> {
    const cached = robotsCache.get(host);
    if (cached !== undefined) return cached;
    const pending = fetchRobots(host, signal).then((result) => {
      if (!result.ok) robotsCache.delete(host);
      return result;
    });
    robotsCache.set(host, pending);
    return pending;
  }

  /** ADR-024: on a declared official API robots.txt is recorded; on web pages it binds. */
  async function decideAccess(
    url: URL,
    signal?: AbortSignal,
  ): Promise<Result<Access, ScrapeError>> {
    const rules = await robotsFor(url.hostname, signal);
    if (!rules.ok) return rules;
    const path = `${url.pathname}${url.search}`;
    const api = officialApiFor(url);
    if (isPathAllowed(rules.value, path)) return ok(api === undefined ? "web" : "official_api");
    if (api !== undefined) {
      logger.info(
        { host: url.hostname, path: url.pathname, docsUrl: api.docsUrl },
        "robots.txt disallows this path; allowed as a documented official API (ADR-024).",
      );
      return ok("official_api");
    }
    return failure(
      "robots_disallowed",
      url,
      `robots.txt on ${url.hostname} disallows ${url.pathname}; scrapeer does not fetch it.`,
    );
  }

  function statusError(response: Response, url: URL): Result<never, ScrapeError> | null {
    const { status } = response;
    if (status >= 200 && status < 300) return null;
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"), now());
    const host = url.hostname;
    if (status === 404 || status === 410)
      return failure("not_found", url, `${host} has nothing at this URL (${status}).`);
    if (status === 401 || status === 403) {
      return failure(
        "auth_required",
        url,
        `${host} refused the request (${status}); it may need credentials.`,
      );
    }
    if (status === 429 || status === 503) {
      return failure(
        "rate_limited",
        url,
        `${host} is rate limiting or overloaded (${status}); wait and retry.`,
        retryAfter,
      );
    }
    return failure("upstream_error", url, `${host} answered ${status}.`, retryAfter);
  }

  return {
    id: "http",
    async get(url, getOptions = {}) {
      const accept = getOptions.accept ?? "application/json";
      const sent = await follow(url, accept, getOptions.signal, (hop) =>
        decideAccess(hop, getOptions.signal),
      );
      if (!sent.ok) return sent;
      const { response, url: finalUrl, access } = sent.value;

      const failed = statusError(response, finalUrl);
      if (failed !== null) {
        await response.body?.cancel();
        return failed;
      }
      const body = await readBody(response, finalUrl);
      if (!body.ok) return body;

      return ok({
        status: response.status,
        requestUrl: url,
        finalUrl,
        headers: response.headers,
        body: body.value,
        fetchedAt: now().toISOString(),
        access,
      });
    },
  };
}
