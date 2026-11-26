import { z } from "zod";
import { HttpUrl, Text } from "./primitives.js";

/**
 * Structured license (ADR-014). `null` at the track level means the source
 * does not declare one, and a missing license never grants a permission.
 */
export const License = z.strictObject({
  family: z.enum(["cc", "public-domain", "all-rights-reserved", "other"]),
  code: Text.nullable(),
  version: Text.nullable(),
  jurisdiction: Text.nullable(),
  url: HttpUrl.nullable(),
  /** The exact value the source declared. */
  raw: Text,
});
export type License = z.infer<typeof License>;
