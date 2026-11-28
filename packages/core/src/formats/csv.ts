import type { Resource, Track } from "../core/schema";

/**
 * CSV view of a resource (docs/03-schema.md, "Paridad de formatos"): one row per track, the
 * Track fields flattened with dots in schema order. JSON stays the reference; this is for people.
 */
type Cell = string | number | boolean | null | readonly string[];

const COLUMNS: readonly (readonly [name: string, read: (track: Track) => Cell])[] = [
  ["schemaVersion", (t) => t.schemaVersion],
  ["provider", (t) => t.provider],
  ["id", (t) => t.id],
  ["url", (t) => t.url],
  ["artist", (t) => t.artist],
  ["title", (t) => t.title],
  ["durationSec", (t) => t.durationSec],
  ["plays", (t) => t.plays],
  ["popularity.value", (t) => t.popularity?.value ?? null],
  ["popularity.scale", (t) => t.popularity?.scale ?? null],
  ["isrcs", (t) => t.isrcs],
  ["availability", (t) => t.availability],
  ["publishedAt", (t) => t.publishedAt],
  ["license.family", (t) => t.license?.family ?? null],
  ["license.code", (t) => t.license?.code ?? null],
  ["license.version", (t) => t.license?.version ?? null],
  ["license.jurisdiction", (t) => t.license?.jurisdiction ?? null],
  ["license.url", (t) => t.license?.url ?? null],
  ["license.raw", (t) => t.license?.raw ?? null],
  ["collection.id", (t) => t.collection?.id ?? null],
  ["collection.position", (t) => t.collection?.position ?? null],
  ["tags", (t) => t.tags],
  ["artworkUrl", (t) => t.artworkUrl],
  ["downloadable", (t) => t.downloadable],
  ["description", (t) => t.description],
  ["provenance.sourceUrl", (t) => t.provenance.sourceUrl],
  ["provenance.requestUrl", (t) => t.provenance.requestUrl],
  ["provenance.fetchedAt", (t) => t.provenance.fetchedAt],
  ["provenance.transport", (t) => t.provenance.transport],
  ["provenance.rawHash", (t) => t.provenance.rawHash],
  ["provenance.contentHash", (t) => t.provenance.contentHash],
  ["provenance.providerVersion", (t) => t.provenance.providerVersion],
];

export const CSV_COLUMNS: readonly string[] = COLUMNS.map(([name]) => name);

/** Spreadsheets run a cell starting with one of these as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function text(cell: Cell): string {
  if (cell === null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return JSON.stringify(cell);
}

/** RFC 4180 quoting, after the formula guard so the guard's prefix is quoted too. */
function escape(cell: Cell): string {
  const raw = text(cell);
  const safe = FORMULA_START.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const line = (cells: readonly string[]) => `${cells.join(",")}\r\n`;

/** Header plus one row per track; an album's rows follow its track order (collection.position). */
export function resourceToCsv(resource: Resource): string {
  const tracks =
    resource.kind === "track"
      ? [resource.track]
      : resource.page.items.toSorted(
          (a, b) =>
            (a.collection?.position ?? Number.MAX_SAFE_INTEGER) -
            (b.collection?.position ?? Number.MAX_SAFE_INTEGER),
        );
  return [
    line(CSV_COLUMNS),
    ...tracks.map((track) => line(COLUMNS.map(([, read]) => escape(read(track))))),
  ].join("");
}
