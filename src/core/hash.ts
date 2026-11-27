import { createHash } from "node:crypto";

/** `sha256:<hex>` of raw bytes or a string (UTF-8). */
export function sha256(data: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

/** JSON with object keys sorted at every level; array order is kept. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  // Same as JSON.stringify: a Date (or anything with toJSON) is hashed by its JSON form.
  const toJSON: unknown = Reflect.get(value, "toJSON");
  if (typeof toJSON === "function") return sortKeys(Reflect.apply(toJSON, value, []));
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).toSorted()) {
    sorted[key] = sortKeys(Reflect.get(value, key));
  }
  return sorted;
}

/**
 * Hash of a normalized record without its volatile fields (ADR-016): equal data gives an equal hash,
 * whenever it was fetched.
 */
export function contentHash(
  record: Readonly<Record<string, unknown>>,
  volatile: readonly string[],
): string {
  const stable = Object.fromEntries(
    Object.entries(record).filter(([key]) => !volatile.includes(key)),
  );
  return sha256(canonicalJson(stable));
}
