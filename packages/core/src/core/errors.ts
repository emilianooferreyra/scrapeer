import { z } from "zod";

/** Error taxonomy from docs/03-schema.md. Order matches the documentation table. */
export const SCRAPE_ERROR_KINDS = [
  "not_found",
  "geo_blocked",
  "auth_required",
  "rate_limited",
  "upstream_error",
  "timeout",
  "parse_failed",
  "validation_failed",
  "unsupported",
  "budget_exceeded",
  "invalid_input",
  "host_not_allowed",
  "robots_disallowed",
  "network_error",
  "upstream_down",
] as const;

export const ScrapeErrorKind = z.enum(SCRAPE_ERROR_KINDS);
export type ScrapeErrorKind = z.infer<typeof ScrapeErrorKind>;

export const ScrapeError = z.strictObject({
  kind: ScrapeErrorKind,
  /** Actionable, one line, safe to show to a person or an LLM. Never contains credentials. */
  message: z.string().min(1),
  provider: z.string().min(1).optional(),
  url: z.url().optional(),
  /** Seconds to wait before retrying, when the source says so (Retry-After). */
  retryAfterSec: z.number().int().nonnegative().optional(),
});
export type ScrapeError = z.infer<typeof ScrapeError>;

const RETRYABLE: ReadonlySet<ScrapeErrorKind> = new Set<ScrapeErrorKind>([
  "rate_limited",
  "upstream_error",
  "timeout",
  "network_error",
]);

export function isRetryable(kind: ScrapeErrorKind): boolean {
  return RETRYABLE.has(kind);
}
