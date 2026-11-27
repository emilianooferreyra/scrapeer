import { z } from "zod";
import { CollectionId, ProviderId } from "./ids";
import { License } from "./license";
import { HttpUrl, SchemaVersion, Text } from "./primitives";
import { Provenance } from "./provenance";
import { Track } from "./track";

export const Collection = z.strictObject({
  schemaVersion: SchemaVersion,
  provider: ProviderId,
  id: CollectionId,
  url: HttpUrl,
  title: Text,
  type: z.enum(["album", "playlist"]),
  artist: Text.nullable(),
  /** A track inherits it only when the source declares it for the whole collection. */
  license: License.nullable(),
  trackCount: z.number().int().nonnegative().nullable(),
  provenance: Provenance,
});
export type Collection = z.infer<typeof Collection>;

export function pageOf<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    /** Opaque cursor for the next page; null when there is none. */
    nextCursor: Text.nullable(),
  });
}

export const TrackPage = pageOf(Track);
export type TrackPage = z.infer<typeof TrackPage>;

/** What resolve() returns: a single track, or a collection with its first page (ADR-015). */
export const Resource = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("track"), track: Track }),
  z.strictObject({ kind: z.literal("collection"), collection: Collection, page: TrackPage }),
]);
export type Resource = z.infer<typeof Resource>;
