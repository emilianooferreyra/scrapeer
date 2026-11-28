import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { musicbrainz } from "../providers/musicbrainz/provider";
import { silentLogger } from "../core/logger";
import { ok } from "../core/result";
import type { Resource } from "../core/schema";
import { resourceToCsv } from "./csv";
import { attachmentHeader, exportResource, isExportFormat, partialNotice } from "./export";

async function resolveFixture(name: string, url: string): Promise<Resource> {
  const body = readFileSync(new URL(`../../fixtures/musicbrainz/${name}`, import.meta.url), "utf8");
  const result = await musicbrainz.resolve(new URL(url), {
    logger: silentLogger,
    transport: {
      id: "http",
      get: async (requestUrl) =>
        ok({
          status: 200,
          requestUrl,
          finalUrl: requestUrl,
          headers: new Headers({ "content-type": "application/json" }),
          body: new TextEncoder().encode(body),
          fetchedAt: "2026-11-27T22:06:51.312Z",
          access: "official_api",
        }),
    },
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const album = await resolveFixture(
  "release-in-rainbows.json",
  "https://musicbrainz.org/release/200f0a5a-41c4-49f3-b997-1ef5f975f060",
);

describe("exportResource", () => {
  it("csv: the album CSV, named after artist, title and id", () => {
    const file = exportResource(album, "csv");
    expect(file).toEqual({
      name: "Radiohead - In Rainbows (200f0a5a).csv",
      mediaType: "text/csv; charset=utf-8",
      text: resourceToCsv(album),
    });
  });

  it("json: the whole resource, indented, with a final newline", () => {
    const file = exportResource(album, "json");
    expect(file.name).toBe("Radiohead - In Rainbows (200f0a5a).json");
    expect(file.mediaType).toBe("application/json; charset=utf-8");
    expect(file.text).toBe(`${JSON.stringify(album, null, 2)}\n`);
    expect(JSON.parse(file.text)).toEqual(album);
  });
});

describe("isExportFormat", () => {
  it("accepts json and csv only", () => {
    expect(["json", "csv", "xml", "", "CSV"].map(isExportFormat)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("attachmentHeader", () => {
  it("ASCII names go in filename and filename*", () => {
    expect(attachmentHeader("Radiohead - In Rainbows (200f0a5a).csv")).toBe(
      "attachment; filename=\"Radiohead - In Rainbows (200f0a5a).csv\"; filename*=UTF-8''Radiohead%20-%20In%20Rainbows%20%28200f0a5a%29.csv",
    );
  });

  it("other names keep their UTF-8 form in filename* and fall back to _ in filename", () => {
    const name = `Bj${String.fromCodePoint(0xf6)}rk - It's ${String.fromCodePoint(0x5bbf)} (1234abcd).csv`;
    expect(attachmentHeader(name)).toBe(
      "attachment; filename=\"Bj_rk - It's _ (1234abcd).csv\"; filename*=UTF-8''Bj%C3%B6rk%20-%20It%27s%20%E5%AE%BF%20%281234abcd%29.csv",
    );
  });
});

const LONE_SURROGATE = String.fromCharCode(0xd800);

describe("names with a lone surrogate", () => {
  it("become _ in the file name, and the header does not throw", () => {
    if (album.kind !== "collection") throw new Error("bad fixture");
    const broken: Resource = {
      ...album,
      collection: { ...album.collection, title: `In Rainbows ${LONE_SURROGATE}` },
    };
    const { name } = exportResource(broken, "csv");
    expect(name).toBe("Radiohead - In Rainbows _ (200f0a5a).csv");
    expect(attachmentHeader(`a${LONE_SURROGATE}.csv`)).toBe(
      "attachment; filename=\"a_.csv\"; filename*=UTF-8''a_.csv",
    );
  });
});

describe("partialNotice", () => {
  it("is null when the source has no more pages", () => {
    expect(partialNotice(album)).toBeNull();
  });

  it("says how many tracks are in when the source has more pages", () => {
    if (album.kind !== "collection") throw new Error("bad fixture");
    const partial: Resource = { ...album, page: { ...album.page, nextCursor: "next" } };
    expect(partialNotice(partial)).toBe(
      `only the first ${album.page.items.length} tracks are included; the source has more pages (not fetched yet).`,
    );
  });
});
