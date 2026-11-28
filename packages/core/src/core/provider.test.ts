import { describe, expect, it } from "vitest";
import type { Capability, ProviderPolicy } from "./provider";

describe("ProviderPolicy", () => {
  it("allows export only with a reviewed date and terms link", () => {
    const closed: ProviderPolicy = { export: false, reviewedAt: null, termsUrl: null };
    const open: ProviderPolicy = {
      export: true,
      reviewedAt: "2026-11-26",
      termsUrl: "https://metabrainz.org/social-contract",
    };
    // @ts-expect-error: export cannot open before the terms are reviewed (ADR-020)
    const unreviewed: ProviderPolicy = { export: true, reviewedAt: null, termsUrl: null };
    expect([closed.export, open.export, unreviewed.export]).toStrictEqual([false, true, true]);
  });
});

describe("Capability", () => {
  it("does not offer search until the contract has a search method", () => {
    const supported: Capability[] = ["track", "collection"];
    // @ts-expect-error: "search" returns with Provider.search
    const search: Capability = "search";
    expect([...supported, search]).toHaveLength(3);
  });
});
