import { describe, expect, it } from "vitest";
import { isRetryable, ScrapeError, SCRAPE_ERROR_KINDS, describeError } from "./errors";

const RETRYABLE = new Set(["rate_limited", "upstream_error", "timeout", "network_error"]);

describe("ScrapeError", () => {
  it.each(SCRAPE_ERROR_KINDS.map((kind) => [kind, RETRYABLE.has(kind)] as const))(
    "%s is retryable: %s",
    (kind, expected) => {
      expect(isRetryable(kind)).toBe(expected);
    },
  );

  it("lists the 15 documented kinds", () => {
    expect(SCRAPE_ERROR_KINDS).toHaveLength(15);
  });

  it("carries an actionable message and optional context", () => {
    const error = {
      kind: "rate_limited",
      message: "rate_limited: provider=deezer retryAfter=12s",
      provider: "deezer",
      retryAfterSec: 12,
    };
    expect(ScrapeError.safeParse(error).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(ScrapeError.safeParse({ kind: "oops", message: "x" }).success).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(ScrapeError.safeParse({ kind: "not_found", message: "" }).success).toBe(false);
  });
});

describe("describeError", () => {
  it("is kind and message alone when nothing else is known", () => {
    expect(describeError({ kind: "invalid_input", message: "That is not a link." })).toBe(
      "invalid_input: That is not a link.",
    );
  });

  it("adds provider, retryAfter and url, in that order", () => {
    expect(
      describeError({
        kind: "rate_limited",
        message: "MusicBrainz is busy.",
        url: "https://musicbrainz.org/release/x",
        retryAfterSec: 12,
        provider: "musicbrainz",
      }),
    ).toBe(
      "rate_limited: MusicBrainz is busy. provider=musicbrainz retryAfter=12s url=https://musicbrainz.org/release/x",
    );
  });
});
