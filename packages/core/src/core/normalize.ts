/** Trims and collapses whitespace; empty means unknown, so it becomes `null` (docs/03-schema.md). */
export function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = value.replaceAll(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}
