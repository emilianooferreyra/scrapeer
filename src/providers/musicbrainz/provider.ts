import type { z } from "zod";
import type { ScrapeError } from "../../core/errors";
import { contentHash, sha256 } from "../../core/hash";
import { cleanText } from "../../core/normalize";
import type { Ctx, Provider } from "../../core/provider";
import { redactUrl } from "../../core/redact";
import { err, ok, type Result } from "../../core/result";
import {
  ProviderId,
  Resource,
  SCHEMA_VERSION,
  type Collection,
  type Track,
} from "../../core/schema";
import type { TransportResponse } from "../../core/transport/http";
import { ApiRecording, ApiRelease, type ApiArtistCredit } from "./api";
import { matchMusicBrainzUrl, parseMusicBrainzUrl, type MusicBrainzRef } from "./url";

const ID = "musicbrainz";
const HOST = "musicbrainz.org";
const PROVIDER_VERSION = "0.1.0";
/** Fields that change without the data changing; left out of contentHash (docs/03-schema.md). */
const TRACK_VOLATILE = ["provenance", "plays", "popularity", "availability", "artworkUrl"];
const INCLUDES: Readonly<Record<MusicBrainzRef["entity"], string>> = {
  release: "recordings+artist-credits+isrcs",
  recording: "artist-credits+isrcs",
};

type TrackInput = z.input<typeof Track>;
type CollectionInput = z.input<typeof Collection>;
type ResourceInput = z.input<typeof Resource>;
/** Provenance shared by every record of one response; each record adds its own contentHash. */
type BaseProvenance = Omit<TrackInput["provenance"], "contentHash">;
type TrackFields = Pick<TrackInput, "title" | "artist" | "durationSec" | "publishedAt">;

function failure(kind: ScrapeError["kind"], message: string, url: URL): ScrapeError {
  return { kind, message, provider: ID, url: redactUrl(url) };
}

function shapeChanged(ref: MusicBrainzRef, error: z.ZodError, source: URL): ScrapeError {
  const issue = error.issues[0];
  const where = issue === undefined ? "" : ` at ${issue.path.join(".") || "the top level"}`;
  return failure("parse_failed", `MusicBrainz ${ref.entity} JSON changed shape${where}.`, source);
}

function apiUrl(ref: MusicBrainzRef): URL {
  // Built by hand: URLSearchParams would encode the "+" separators MusicBrainz expects.
  return new URL(
    `https://${HOST}/ws/2/${ref.entity}/${ref.mbid}?inc=${INCLUDES[ref.entity]}&fmt=json`,
  );
}

function pageUrl(entity: MusicBrainzRef["entity"], mbid: string): string {
  return `https://${HOST}/${entity}/${mbid}`;
}

function artistName(credit: ApiArtistCredit | undefined): string | null {
  if (credit === undefined) return null;
  return cleanText(credit.map((part) => part.name + (part.joinphrase ?? "")).join(""));
}

/** Milliseconds to whole seconds; a missing or zero length is unknown. */
function durationSec(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined) return null;
  const seconds = Math.round(ms / 1000);
  return seconds > 0 ? seconds : null;
}

/** Only a complete date fills publishedAt; `1994` or `1994-03` is unknown. */
function fullDate(date: string | undefined): string | null {
  return date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : null;
}

function track(
  recording: ApiRecording,
  fields: TrackFields,
  collection: TrackInput["collection"],
  provenance: BaseProvenance,
): TrackInput {
  const record: Omit<TrackInput, "provenance"> = {
    schemaVersion: SCHEMA_VERSION,
    provider: ID,
    id: recording.id,
    url: pageUrl("recording", recording.id),
    ...fields,
    plays: null,
    popularity: null,
    isrcs: [...new Set(recording.isrcs ?? [])],
    availability: null,
    license: null,
    collection,
    tags: [],
    artworkUrl: null,
    downloadable: false,
    description: null,
  };
  return {
    ...record,
    provenance: { ...provenance, contentHash: contentHash(record, TRACK_VOLATILE) },
  };
}

function fromRecording(recording: ApiRecording, provenance: BaseProvenance): ResourceInput {
  const fields: TrackFields = {
    // An empty title stays empty so the schema rejects it as validation_failed.
    title: cleanText(recording.title) ?? "",
    artist: artistName(recording["artist-credit"]),
    durationSec: durationSec(recording.length),
    publishedAt: fullDate(recording["first-release-date"]),
  };
  return { kind: "track", track: track(recording, fields, null, provenance) };
}

function fromRelease(release: ApiRelease, provenance: BaseProvenance): ResourceInput {
  const publishedAt = fullDate(release.date);
  const items = release.media
    .flatMap((medium) => medium.tracks ?? [])
    .map((item, index) => {
      const fields: TrackFields = {
        title: cleanText(item.title) ?? "",
        artist: artistName(item["artist-credit"] ?? item.recording["artist-credit"]),
        durationSec: durationSec(item.length ?? item.recording.length),
        publishedAt,
      };
      return track(item.recording, fields, { id: release.id, position: index + 1 }, provenance);
    });
  const collection: Omit<CollectionInput, "provenance"> = {
    schemaVersion: SCHEMA_VERSION,
    provider: ID,
    id: release.id,
    url: pageUrl("release", release.id),
    title: cleanText(release.title) ?? "",
    type: "album",
    artist: artistName(release["artist-credit"]),
    license: null,
    trackCount: release.media.reduce((sum, medium) => sum + medium["track-count"], 0),
  };
  return {
    kind: "collection",
    collection: {
      ...collection,
      provenance: { ...provenance, contentHash: contentHash(collection, ["provenance"]) },
    },
    page: { items, nextCursor: null },
  };
}

function decode(
  ref: MusicBrainzRef,
  response: TransportResponse,
  source: URL,
): Result<ResourceInput, ScrapeError> {
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(response.body));
  } catch {
    return err(
      failure("parse_failed", "MusicBrainz answered with something that is not JSON.", source),
    );
  }
  const provenance: BaseProvenance = {
    sourceUrl: redactUrl(source),
    requestUrl: redactUrl(response.requestUrl),
    fetchedAt: response.fetchedAt,
    transport: "api",
    rawHash: sha256(response.body),
    providerVersion: PROVIDER_VERSION,
  };
  if (ref.entity === "release") {
    const release = ApiRelease.safeParse(data);
    if (release.success) return ok(fromRelease(release.data, provenance));
    return err(shapeChanged(ref, release.error, source));
  }
  const recording = ApiRecording.safeParse(data);
  if (recording.success) return ok(fromRecording(recording.data, provenance));
  return err(shapeChanged(ref, recording.error, source));
}

export const musicbrainz: Provider = {
  id: ProviderId.parse(ID),
  hosts: [HOST],
  officialApi: [
    { host: HOST, pathPrefix: "/ws/2/", docsUrl: "https://musicbrainz.org/doc/MusicBrainz_API" },
  ],
  capabilities: new Set(["track", "collection"]),
  // Closed until the terms gate is recorded as passed (ADR-020).
  policy: { export: false, reviewedAt: null, termsUrl: null },
  match: matchMusicBrainzUrl,

  async resolve(url: URL, ctx: Ctx): Promise<Result<Resource, ScrapeError>> {
    const ref = parseMusicBrainzUrl(url);
    if (ref === null) {
      const message = `Not a MusicBrainz release or recording link: ${redactUrl(url)}`;
      return err(failure("invalid_input", message, url));
    }
    const response = await ctx.transport.get(apiUrl(ref), {
      accept: "application/json",
      ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    });
    if (!response.ok) return err({ ...response.error, provider: ID });

    const decoded = decode(ref, response.value, url);
    if (!decoded.ok) return decoded;
    const valid = Resource.safeParse(decoded.value);
    if (!valid.success) {
      const issue = valid.error.issues[0];
      const where = issue === undefined ? "" : ` at ${issue.path.join(".")}`;
      const message = `MusicBrainz ${ref.entity} did not map to a valid record${where}.`;
      return err(failure("validation_failed", message, url));
    }
    return ok(valid.data);
  },
};
