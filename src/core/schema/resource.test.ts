import { describe, expect, it } from "vitest";
import { License, ProviderId, Resource } from "./index";

const HASH = `sha256:${"b".repeat(64)}`;
const provenance = {
  sourceUrl: "https://www.deezer.com/playlist/1",
  requestUrl: "https://api.deezer.com/playlist/1",
  fetchedAt: "2026-11-26T18:02:11Z",
  transport: "api",
  rawHash: HASH,
  contentHash: HASH,
  providerVersion: "0.1.0",
};
const collection = {
  schemaVersion: 1,
  provider: "deezer",
  id: "1",
  url: "https://www.deezer.com/playlist/1",
  title: "Hip Hop Hits",
  type: "playlist",
  artist: null,
  license: null,
  trackCount: 0,
  provenance,
};

describe("Resource", () => {
  it("accepts an empty collection: no tracks is a valid result", () => {
    const resource = { kind: "collection", collection, page: { items: [], nextCursor: null } };
    expect(Resource.safeParse(resource).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(Resource.safeParse({ kind: "artist", collection }).success).toBe(false);
  });

  it("rejects a collection type outside album and playlist", () => {
    const resource = {
      kind: "collection",
      collection: { ...collection, type: "station" },
      page: { items: [], nextCursor: null },
    };
    expect(Resource.safeParse(resource).success).toBe(false);
  });
});

describe("License", () => {
  it("accepts a structured CC license", () => {
    const license = {
      family: "cc",
      code: "by-nc",
      version: "3.0",
      jurisdiction: "de",
      url: "https://creativecommons.org/licenses/by-nc/3.0/de/",
      raw: "CC BY-NC 3.0 DE",
    };
    expect(License.safeParse(license).success).toBe(true);
  });

  it("requires the raw value the source declared", () => {
    const license = {
      family: "other",
      code: null,
      version: null,
      jurisdiction: null,
      url: null,
      raw: "",
    };
    expect(License.safeParse(license).success).toBe(false);
  });

  it("rejects an unknown family", () => {
    const license = {
      family: "free",
      code: null,
      version: null,
      jurisdiction: null,
      url: null,
      raw: "free",
    };
    expect(License.safeParse(license).success).toBe(false);
  });
});

describe("ProviderId", () => {
  it("rejects an empty id", () => {
    expect(ProviderId.safeParse("").success).toBe(false);
  });
});
