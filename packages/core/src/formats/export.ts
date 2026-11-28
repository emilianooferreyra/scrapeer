import type { Resource } from "../core/schema";
import { resourceToCsv } from "./csv";

/** The file formats every surface can export: the CLI saves them, the player downloads them. */
export const EXPORT_FORMATS = ["json", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const isExportFormat = (value: string): value is ExportFormat =>
  EXPORT_FORMATS.some((format) => format === value);

/** One exported file: its suggested name, its HTTP media type and its contents. */
export type ExportFile = {
  readonly name: string;
  readonly mediaType: string;
  readonly text: string;
};

const MEDIA_TYPES: Readonly<Record<ExportFormat, string>> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

/** Characters a file name cannot hold on common systems. */
const RESERVED = new Set(["/", "\\", ":", "*", "?", '"', "<", ">", "|"]);
/**
 * Control characters (C0, DEL, C1) become "_" too: invisible and hard to type in a shell.
 * So do lone surrogates: no file system or URL encoding accepts them.
 */
const UNSAFE = /^[\p{Cc}\p{Cs}]$/u;
const safeChar = (char: string) => (RESERVED.has(char) || UNSAFE.test(char) ? "_" : char);

/** File systems cap a name at 255 bytes; this leaves room for " (id8).json" and margin. */
const MAX_LABEL_BYTES = 200;
const encoder = new TextEncoder();

/** Cuts at whole code points, so a CJK character or an emoji is never split. */
function truncateUtf8(text: string, maxBytes: number): string {
  let out = "";
  let bytes = 0;
  for (const char of text) {
    bytes += encoder.encode(char).length;
    if (bytes > maxBytes) break;
    out += char;
  }
  return out;
}

/** "Artist - Title (id8).ext": readable, stable for the same link, unique across editions. */
function fileName(resource: Resource, extension: string): string {
  const { artist, title, id } = resource.kind === "track" ? resource.track : resource.collection;
  const label = artist === null ? title : `${artist} - ${title}`;
  const cleaned = label.replace(/./gsu, safeChar).replace(/^[.\s]+|[.\s]+$/g, "");
  const safe = truncateUtf8(cleaned, MAX_LABEL_BYTES).trimEnd() || "untitled";
  return `${safe} (${id.slice(0, 8)}).${extension}`;
}

/** A resource as a file: CSV in album order (docs/03-schema.md), or the full resource as JSON. */
export function exportResource(resource: Resource, format: ExportFormat): ExportFile {
  return {
    name: fileName(resource, format),
    mediaType: MEDIA_TYPES[format],
    text: format === "csv" ? resourceToCsv(resource) : `${JSON.stringify(resource, null, 2)}\n`,
  };
}

/** Printable ASCII except the two characters a quoted-string must escape. */
const PLAIN_ASCII = /^[\x20-\x7e]$/;
const asciiChar = (char: string) =>
  PLAIN_ASCII.test(char) && char !== '"' && char !== "\\" ? char : "_";

/**
 * A Content-Disposition value that downloads `name`: `filename*` carries it in UTF-8
 * (RFC 6266, RFC 8187) and `filename` an ASCII fallback for clients that ignore it.
 */
export function attachmentHeader(name: string): string {
  const fallback = name.replace(/./gsu, asciiChar);
  // encodeURIComponent leaves ' ( ) * as they are; RFC 8187 attr-char does not allow them.
  // encodeURIComponent throws on a lone surrogate, so those become "_" first.
  const encoded = encodeURIComponent(name.replace(/\p{Cs}/gu, "_")).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Set when a collection has pages not fetched yet: every surface shows it next to the
 * export, so a partial file is never mistaken for the whole album.
 */
export function partialNotice(resource: Resource): string | null {
  if (resource.kind !== "collection" || resource.page.nextCursor === null) return null;
  return `only the first ${resource.page.items.length} tracks are included; the source has more pages (not fetched yet).`;
}
