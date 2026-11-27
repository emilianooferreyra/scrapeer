import { z } from "zod";

/** The parts of MusicBrainz /ws/2 JSON that the provider reads. Unknown fields are ignored. */
const ArtistCredit = z.array(z.object({ name: z.string(), joinphrase: z.string().optional() }));

const Length = z.number().nullable().optional();

export const ApiRecording = z.object({
  id: z.string(),
  title: z.string(),
  length: Length,
  isrcs: z.array(z.string()).optional(),
  "artist-credit": ArtistCredit.optional(),
  "first-release-date": z.string().optional(),
});
export type ApiRecording = z.infer<typeof ApiRecording>;

const ApiTrack = z.object({
  title: z.string(),
  length: Length,
  "artist-credit": ArtistCredit.optional(),
  recording: ApiRecording,
});

export const ApiRelease = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().optional(),
  "artist-credit": ArtistCredit.optional(),
  media: z.array(z.object({ "track-count": z.number(), tracks: z.array(ApiTrack).optional() })),
});
export type ApiRelease = z.infer<typeof ApiRelease>;

export type ApiArtistCredit = z.infer<typeof ArtistCredit>;
