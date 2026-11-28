import type { ScrapeError } from "./core/errors";
import { silentLogger, type Logger } from "./core/logger";
import type { Provider } from "./core/provider";
import { err, type Result } from "./core/result";
import type { Resource } from "./core/schema";
import { createHttpTransport, type HttpTransport } from "./core/transport/http";
import { musicbrainz } from "./providers/musicbrainz/provider";

/** Identifies scrapeer and a contact on every request (ADR-017); never a browser string. */
export const USER_AGENT = "scrapeer/0.0.0 ( https://github.com/emilianooferreyra/scrapeer )";

/** Providers `resolve` can route a link to, in match order. */
const PROVIDERS: readonly Provider[] = [musicbrainz];

/** Longest wait honored before the single retry of a rate-limited lookup. */
const MAX_RETRY_WAIT_SEC = 5;

export type ScrapeerOptions = {
  readonly logger?: Logger;
  /** Replaces the HTTP transport; tests use it to answer without the network. */
  readonly transport?: HttpTransport;
  /** Replaces the wait before a retry; tests use it to skip real time. */
  readonly sleep?: (ms: number) => Promise<void>;
};

export type ResolveOptions = { readonly signal?: AbortSignal };

/**
 * The service layer every surface shares (docs/07-superficies.md): the CLI and the player
 * call it, so a link resolves, fails and reads the same everywhere.
 */
export type Scrapeer = {
  resolve(input: string, options?: ResolveOptions): Promise<Result<Resource, ScrapeError>>;
};

function defaultTransport(logger: Logger): HttpTransport {
  return createHttpTransport({
    hosts: PROVIDERS.flatMap((provider) => provider.hosts),
    officialApi: PROVIDERS.flatMap((provider) => provider.officialApi),
    userAgent: USER_AGENT,
    robotsToken: "scrapeer",
    // MusicBrainz allows 1 request per second (docs/05-providers.md).
    limits: { "musicbrainz.org": { capacity: 1, refillPerSec: 1, jitterMs: 250 } },
    logger,
  });
}

const realSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export function createScrapeer(options: ScrapeerOptions = {}): Scrapeer {
  const logger = options.logger ?? silentLogger;
  const transport = options.transport ?? defaultTransport(logger);
  const sleep = options.sleep ?? realSleep;

  return {
    async resolve(input, { signal } = {}) {
      const url = URL.parse(input.trim());
      if (url === null) return err({ kind: "invalid_input", message: "That is not a link." });
      const provider = PROVIDERS.find((candidate) => candidate.match(url));
      if (provider === undefined) {
        return err({
          kind: "unsupported",
          message: "For now only MusicBrainz release or recording links work.",
        });
      }
      const ctx = { transport, logger, ...(signal === undefined ? {} : { signal }) };
      const first = await provider.resolve(url, ctx);
      // MusicBrainz often answers 503 to the first lookup right after robots.txt; one retry,
      // after the wait it asks for (capped), is enough. General backoff is Phase 4.
      if (first.ok || first.error.kind !== "rate_limited") return first;
      const waitSec = Math.min(first.error.retryAfterSec ?? 1, MAX_RETRY_WAIT_SEC);
      await sleep(waitSec * 1000);
      return provider.resolve(url, ctx);
    },
  };
}
