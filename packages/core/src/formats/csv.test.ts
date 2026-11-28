import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { musicbrainz } from "../providers/musicbrainz/provider";
import { silentLogger } from "../core/logger";
import { ok } from "../core/result";
import { Track, type Resource } from "../core/schema";
import { CSV_COLUMNS, resourceToCsv } from "./csv";

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
const recording = await resolveFixture(
  "recording-several-isrcs.json",
  "https://musicbrainz.org/recording/26244520-0e1d-4d42-b101-ce6b83299d33",
);
if (album.kind !== "collection" || recording.kind !== "track") throw new Error("bad fixtures");
const first = album.page.items[0];
if (first === undefined) throw new Error("empty album");

/** Every leaf of the Track schema, dotted, in schema order: the parity rule of docs/03-schema.md. */
function leaves(schema: z.ZodType, prefix = ""): string[] {
  const inner = schema instanceof z.ZodNullable ? schema.unwrap() : schema;
  if (!(inner instanceof z.ZodObject)) return [prefix];
  return Object.entries(inner.shape).flatMap(([key, child]: [string, z.ZodType]) =>
    leaves(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

/** Splits the CSV back into rows of cells (RFC 4180), so tests read values, not bytes. */
function parse(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && csv[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += char;
  }
  return rows;
}

function rowOf(track: Track): Record<string, string> {
  const [header = [], values = []] = parse(resourceToCsv({ kind: "track", track }));
  return Object.fromEntries(header.map((column, i) => [column, values[i] ?? ""]));
}

describe("resourceToCsv", () => {
  it("has one column per Track leaf field, dotted, in schema order", () => {
    expect(CSV_COLUMNS).toStrictEqual(leaves(Track));
    expect(parse(resourceToCsv(recording))[0]).toStrictEqual(leaves(Track));
  });

  it("writes an album as one row per track, in album order, whatever order the page has", () => {
    if (album.kind !== "collection") throw new Error("album");
    const shuffled: Resource = {
      ...album,
      page: { ...album.page, items: album.page.items.toReversed() },
    };
    const rows = parse(resourceToCsv(shuffled)).slice(1);
    const position = CSV_COLUMNS.indexOf("collection.position");
    const title = CSV_COLUMNS.indexOf("title");
    expect(rows.map((row) => row[position])).toStrictEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(rows[0]?.[title]).toBe("15 Step");
  });

  it("writes a single track as the header and one row, ending every line with CRLF", () => {
    const csv = resourceToCsv(recording);
    expect(parse(csv)).toHaveLength(2);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("leaves null empty, writes arrays as JSON and nested objects as their leaves", () => {
    const row = rowOf({
      ...first,
      plays: null,
      license: null,
      tags: ["rock", "alt"],
      popularity: { value: 42, scale: "0-100" },
    });
    expect(row).toMatchObject({
      plays: "",
      "license.code": "",
      tags: '["rock","alt"]',
      "popularity.value": "42",
      "popularity.scale": "0-100",
      downloadable: "false",
      "provenance.fetchedAt": "2026-11-27T22:06:51.312Z",
    });
  });

  it("quotes cells with commas, quotes or line breaks so they survive a round trip", () => {
    const title = 'Hello, "World"\nagain';
    expect(rowOf({ ...first, title }).title).toBe(title);
    expect(resourceToCsv({ kind: "track", track: { ...first, title } })).toContain(
      '"Hello, ""World""\nagain"',
    );
  });

  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "prefixes a cell starting with %j with ' so spreadsheets do not run it as a formula",
    (start) => {
      const title = `${start}HYPERLINK("http://x")`;
      expect(rowOf({ ...first, title }).title).toBe(`'${title}`);
    },
  );
});
