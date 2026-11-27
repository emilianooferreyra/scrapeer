import type { ScrapeError } from "./errors";
import type { Logger } from "./logger";
import type { Result } from "./result";
import type { ProviderId, Resource } from "./schema";
import type { HttpTransport, OfficialApi } from "./transport/http";

/**
 * What a provider can do (docs/02-arquitectura.md). "search" joins when `Provider` gains `search`,
 * so no provider can announce a capability the contract cannot call.
 */
export type Capability = "track" | "collection";

/**
 * Outcome of the terms gate (ADR-020). Closed by default: `export: false` until reviewed.
 * Opening export requires the review date and the terms link, so an unreviewed source cannot export.
 */
export type ProviderPolicy =
  | {
      readonly export: false;
      /** ISO date the terms were read at the primary source; `null` while pending. */
      readonly reviewedAt: string | null;
      readonly termsUrl: string | null;
    }
  | {
      readonly export: true;
      readonly reviewedAt: string;
      readonly termsUrl: string;
    };

/** What a provider receives per call. It never calls `fetch` itself: all network goes through `transport`. */
export type Ctx = {
  readonly transport: HttpTransport;
  readonly logger: Logger;
  readonly signal?: AbortSignal;
};

export interface Provider {
  readonly id: ProviderId;
  /** Exact hosts the transport may contact (ADR-018). */
  readonly hosts: readonly string[];
  /** Documented official API routes: there robots.txt is logged, not blocking (ADR-024). */
  readonly officialApi: readonly OfficialApi[];
  readonly policy: ProviderPolicy;
  readonly capabilities: ReadonlySet<Capability>;

  /** Does this URL belong to me? Pure, no network. */
  match(url: URL): boolean;

  /** URL → track or collection, validated with zod before returning. */
  resolve(url: URL, ctx: Ctx): Promise<Result<Resource, ScrapeError>>;
}
