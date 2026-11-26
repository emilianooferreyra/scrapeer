import { z } from "zod";

/** Every canonical record starts at version 1; it only goes up on breaking changes. */
export const SCHEMA_VERSION = 1;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

/** Unknown values are null, never "" (docs/03-schema.md, normalization rules). */
export const Text = z.string().min(1);

/** ISO 8601 in UTC with a Z suffix. */
export const UtcTimestamp = z.iso.datetime();

export const HttpUrl = z.url({ protocol: /^https?$/ });

export const Sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<64 hex chars>");
