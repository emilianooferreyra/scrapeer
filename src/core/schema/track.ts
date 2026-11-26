import { z } from "zod";
import { CollectionId, ProviderId, TrackId } from "./ids.js";
import { License } from "./license.js";
import { HttpUrl, SchemaVersion, Text, UtcTimestamp } from "./primitives.js";
import { Provenance } from "./provenance.js";

const Tag = Text.refine((tag) => tag === tag.toLowerCase(), { message: "tags are lowercase" });

/** ISO 3901: country (2 letters), registrant (3 alphanumerics), year (2 digits), designation (5 digits). */
const Isrc = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, "expected a 12-character ISRC without dashes");

/** A platform's own popularity index. Not comparable across platforms, never converted to plays. */
export const Popularity = z.strictObject({
  value: z.number().nonnegative(),
  scale: Text,
});
export type Popularity = z.infer<typeof Popularity>;

export const Availability = z.enum(["available", "geo_blocked", "unavailable"]);
export type Availability = z.infer<typeof Availability>;

export const Track = z.strictObject({
  schemaVersion: SchemaVersion,
  provider: ProviderId,
  id: TrackId,
  url: HttpUrl,
  artist: Text.nullable(),
  title: Text,
  durationSec: z.number().int().positive().nullable(),
  /** Plays or views counted by the source. */
  plays: z.number().int().nonnegative().nullable(),
  popularity: Popularity.nullable(),
  /** Every ISRC the source reports; a recording can have several. Empty when none is known. */
  isrcs: z
    .array(Isrc)
    .refine((codes) => new Set(codes).size === codes.length, { message: "ISRCs are unique" }),
  availability: Availability.nullable(),
  publishedAt: UtcTimestamp.nullable(),
  license: License.nullable(),
  /** Origin collection and 1-based position in it; CSV rows are ordered by it. */
  collection: z
    .strictObject({ id: CollectionId, position: z.number().int().positive() })
    .nullable(),
  tags: z
    .array(Tag)
    .refine((tags) => new Set(tags).size === tags.length, { message: "tags are unique" }),
  artworkUrl: HttpUrl.nullable(),
  /** Detected, never downloaded. */
  downloadable: z.boolean(),
  description: Text.max(2000).nullable(),
  provenance: Provenance,
});
export type Track = z.infer<typeof Track>;
