import { lookup as dnsLookup } from "node:dns/promises";
import { setTimeout as delayFor } from "node:timers/promises";
import type { ScrapeError } from "../errors";
import { silentLogger, type Logger } from "../logger";
import { redactUrl } from "../redact";
import { err, ok, type Result } from "../result";
import { checkTarget, isPublicAddress } from "./host-guard";
import { createRateLimiter, type HostLimit, type RateLimiter } from "./rate-limiter";
import { isPathAllowed, parseRobots, type RobotsRules } from "./robots";

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

/** A sent request: the response, its URL, and the timeout that also bounds reading its body. */
type Hop = { readonly response: Response; readonly url: URL; readonly timeout: AbortSignal };

/** Cleanup must never replace the result already chosen: a broken stream rejects on cancel. */
async function discard(stream: { cancel(): Promise<void> } | null): Promise<void> {
  try {
    await stream?.cancel();
  } catch {
    // Best effort: the stream is already broken or closed.
  }
}

/** Rejects when `signal` aborts; lets a promise that ignores signals (DNS) honor the timeout. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

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

    const dnsDeadline = AbortSignal.timeout(timeoutMs);
    let addresses: readonly string[];
    try {
      addresses = await untilAborted(lookup(url.hostname), dnsDeadline);
    } catch {
      if (dnsDeadline.aborted) {
        return failure(
          "timeout",
          url,
          `Resolving ${url.hostname} took longer than ${timeoutMs} ms.`,
        );
      }
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

    try {
      await limiter.acquire(url.hostname, limitFor(url.hostname), signal);
    } catch {
      return failure("network_error", url, `The request to ${url.hostname} was cancelled.`);
    }

    // The deadline covers the request and its body, not the polite wait before it.
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetchImpl(url.href, {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": options.userAgent, accept },
        signal: signal === undefined ? timeout : AbortSignal.any([timeout, signal]),
      });
      return ok({ response, url, timeout });
    } catch (error) {
      if (timeout.aborted) {
        return failure("timeout", url, `${url.hostname} did not answer within ${timeoutMs} ms.`);
      }
      // The underlying message is not echoed: it can carry a URL with credentials.
      const reason = error instanceof Error ? error.name : "unknown error";
      return failure("network_error", url, `Request to ${url.hostname} failed (${reason}).`);
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
        await discard(response.body);
        return failure("upstream_error", start, `Stopped after ${maxRedirects} redirects.`);
      }
      await discard(response.body);
      const next = URL.parse(location, url);
      if (next === null) {
        return failure("upstream_error", url, `${url.hostname} sent an invalid redirect location.`);
      }
      url = next;
    }
  }

  async function readBody(hop: Hop): Promise<Result<Uint8Array, ScrapeError>> {
    try {
      return await readBodyUnguarded(hop.response, hop.url);
    } catch {
      if (hop.timeout.aborted) {
        return failure(
          "timeout",
          hop.url,
          `${hop.url.hostname} did not finish the response within ${timeoutMs} ms.`,
        );
      }
      return failure(
        "network_error",
        hop.url,
        `The connection to ${hop.url.hostname} broke while reading the response.`,
      );
    }
  }

  async function readBodyUnguarded(
    response: Response,
    url: URL,
  ): Promise<Result<Uint8Array, ScrapeError>> {
    const tooLarge = () =>
      failure("upstream_error", url, `The response is larger than the ${maxBytes}-byte limit.`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await discard(response.body);
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
        await discard(reader);
        return failure("upstream_error", url, "The response body is not a byte stream.");
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await discard(reader);
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

  /** Shared by every caller for the host, so it is bounded only by its own timeouts. */
  async function fetchRobots(host: string): Promise<Result<RobotsRules, ScrapeError>> {
    const url = new URL(`https://${host}/robots.txt`);
    const sent = await follow(url, "text/plain", undefined, () =>
      Promise.resolve(ok<Access>("web")),
    );
    if (!sent.ok) return sent;
    const { response } = sent.value;

    if (response.status >= 500) {
      await discard(response.body);
      return failure(
        "upstream_error",
        url,
        `robots.txt for ${host} returned ${response.status}; not continuing with this host.`,
      );
    }
    if (response.status >= 400) {
      await discard(response.body);
      logger.debug({ host, status: response.status }, "No robots.txt; every path is allowed.");
      return ok([]);
    }
    const body = await readBody(sent.value);
    if (!body.ok) return body;
    return ok(parseRobots(new TextDecoder().decode(body.value), options.robotsToken));
  }

  /** Reads robots.txt once per host, before its first request; a failure is retried next time. */
  function sharedRobots(host: string): Promise<Result<RobotsRules, ScrapeError>> {
    const cached = robotsCache.get(host);
    if (cached !== undefined) return cached;
    const url = new URL(`https://${host}/robots.txt`);
    const pending = fetchRobots(host).then(
      (result) => {
        if (!result.ok) robotsCache.delete(host);
        return result;
      },
      (error: unknown) => {
        // fetchRobots returns Results; a rejection here is a bug, so it is logged, not hidden.
        robotsCache.delete(host);
        logger.warn({ host, error: String(error) }, "Unexpected failure while reading robots.txt.");
        return failure("network_error", url, `Reading robots.txt for ${host} failed.`);
      },
    );
    robotsCache.set(host, pending);
    return pending;
  }

  /** A caller that cancels stops waiting; the shared read goes on for the others. */
  async function robotsFor(
    host: string,
    signal?: AbortSignal,
  ): Promise<Result<RobotsRules, ScrapeError>> {
    const cancelled = () =>
      failure(
        "network_error",
        new URL(`https://${host}/robots.txt`),
        `The request to ${host} was cancelled.`,
      );
    if (signal?.aborted === true) return cancelled();
    const shared = sharedRobots(host);
    if (signal === undefined) return shared;
    try {
      return await untilAborted(shared, signal);
    } catch {
      return failure(
        "network_error",
        new URL(`https://${host}/robots.txt`),
        `The request to ${host} was cancelled.`,
      );
    }
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
        await discard(response.body);
        return failed;
      }
      const body = await readBody(sent.value);
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
