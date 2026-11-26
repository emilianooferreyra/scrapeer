import { describe, expect, it } from "vitest";
import { Track } from "./index.js";

const HASH = `sha256:${"a".repeat(64)}`;

const PROVENANCE = {
  sourceUrl: "https://www.deezer.com/playlist/908622995",
  requestUrl: "https://api.deezer.com/playlist/908622995/tracks",
  fetchedAt: "2026-11-26T18:02:11Z",
  transport: "api",
  rawHash: HASH,
  contentHash: HASH,
  providerVersion: "0.1.0",
};

function validTrack(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    provider: "deezer",
    id: "3135556",
    url: "https://www.deezer.com/track/3135556",
    artist: "Artist Name",
    title: "Track Title",
    durationSec: 214,
    plays: null,
    popularity: { value: 812345, scale: "deezer-rank" },
    isrcs: ["GBDUW0000059"],
    availability: "available",
    publishedAt: "2026-02-11T00:00:00Z",
    license: null,
    collection: { id: "908622995", position: 3 },
    tags: [],
    artworkUrl: "https://cdn.example.com/cover.jpg",
    downloadable: false,
    description: null,
    provenance: PROVENANCE,
  };
}

/** Paths of every issue, so a rejection is proven to come from the field under test. */
function issuePaths(input: unknown): string[] {
  const result = Track.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...validTrack(), [field]: value };
}

function withProvenance(field: string, value: unknown): Record<string, unknown> {
  return { ...validTrack(), provenance: { ...PROVENANCE, [field]: value } };
}

describe("Track", () => {
  it("accepts the documented Deezer example", () => {
    expect(Track.safeParse(validTrack()).success).toBe(true);
  });

  it("rejects fields that are not part of the canonical schema", () => {
    const result = Track.safeParse(withField("deezerRank", 1));
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["deezerRank"] }),
    ]);
  });

  it("only accepts schemaVersion 1", () => {
    expect(issuePaths(withField("schemaVersion", 2))).toEqual(["schemaVersion"]);
  });

  it.each([
    ["title", ""],
    ["artist", ""],
    ["description", ""],
  ])("rejects an empty string in %s: unknown values are null", (field, value) => {
    expect(issuePaths(withField(field, value))).toEqual([field]);
  });

  it("accepts null for every unknown optional value", () => {
    const track = {
      ...validTrack(),
      artist: null,
      durationSec: null,
      plays: null,
      popularity: null,
      availability: null,
      publishedAt: null,
      collection: null,
      artworkUrl: null,
    };
    expect(Track.safeParse(track).success).toBe(true);
  });

  it.each([0, -1, 3.5, "3:34"])(
    "rejects durationSec %s: whole positive seconds or null",
    (value) => {
      expect(issuePaths(withField("durationSec", value))).toEqual(["durationSec"]);
    },
  );

  it.each([-1, 1.5, "12.8K"])("rejects plays %s: a count is a non-negative integer", (value) => {
    expect(issuePaths(withField("plays", value))).toEqual(["plays"]);
  });

  it("accepts zero plays", () => {
    expect(Track.safeParse(withField("plays", 0)).success).toBe(true);
  });

  it.each([["House"], ["house", "house"], [""]])(
    "rejects tags %j: lowercase, unique, non-empty",
    (...tags) => {
      const paths = issuePaths(withField("tags", tags));
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.every((path) => path.startsWith("tags"))).toBe(true);
    },
  );

  it.each(["GB-DUW-00-00059", "gbduw0000059", "GBDUW00000"])(
    "rejects the malformed ISRC %s",
    (isrc) => {
      expect(issuePaths(withField("isrcs", [isrc]))).toEqual(["isrcs.0"]);
    },
  );

  it("keeps every ISRC the source reports for one recording", () => {
    const isrcs = ["GBN9Y1100088", "GBAYE0601690", "GBAYE7300001"];
    expect(Track.safeParse(withField("isrcs", isrcs)).success).toBe(true);
  });

  it("accepts an empty isrcs list when the source reports none", () => {
    expect(Track.safeParse(withField("isrcs", [])).success).toBe(true);
  });

  it("rejects duplicate ISRCs", () => {
    expect(issuePaths(withField("isrcs", ["GBDUW0000059", "GBDUW0000059"]))).toEqual(["isrcs"]);
  });

  it("rejects isrcs: null, an unknown list is empty", () => {
    expect(issuePaths(withField("isrcs", null))).toEqual(["isrcs"]);
  });

  it("rejects an unknown availability", () => {
    expect(issuePaths(withField("availability", "maybe"))).toEqual(["availability"]);
  });

  it("counts collection positions from 1", () => {
    expect(Track.safeParse(withField("collection", { id: "908622995", position: 0 })).success).toBe(
      false,
    );
  });

  it("requires UTC timestamps", () => {
    expect(Track.safeParse(withField("publishedAt", "2026-02-11T00:00:00+02:00")).success).toBe(
      false,
    );
    expect(issuePaths(withField("publishedAt", "2026-02-11"))).toEqual(["publishedAt"]);
  });

  it("rejects a description over 2000 characters", () => {
    expect(issuePaths(withField("description", "x".repeat(2001)))).toEqual(["description"]);
  });

  it.each(["key", "client_id", "api_key", "access_token"])(
    "rejects a requestUrl that carries the credential %s",
    (param) => {
      const url = `https://api.example.com/v1/tracks?${param}=secret`;
      expect(issuePaths(withProvenance("requestUrl", url))).toEqual(["provenance.requestUrl"]);
    },
  );

  it("rejects a hash without the sha256 prefix", () => {
    expect(issuePaths(withProvenance("rawHash", "a".repeat(64)))).toEqual(["provenance.rawHash"]);
  });

  it("rejects a transport outside the degradation ladder", () => {
    expect(issuePaths(withProvenance("transport", "proxy"))).toEqual(["provenance.transport"]);
  });
});
