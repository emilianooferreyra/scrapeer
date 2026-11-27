/** The MusicBrainz entities Phase 1 resolves: an album (release) or a single recording. */
export type MusicBrainzEntity = "release" | "recording";

export type MusicBrainzRef = {
  readonly entity: MusicBrainzEntity;
  /** Lowercase MBID (UUID). */
  readonly mbid: string;
};

const HOST = "musicbrainz.org";
const PATH =
  /^\/(release|recording)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/**
 * Reads a musicbrainz.org page link as an entity and its MBID. Pure, no network.
 * Query and fragment are ignored; http is accepted because `resolve` builds its own https API URL.
 * Anything else (another host, a port, userinfo, other entities or subpages) is `null`.
 */
export function parseMusicBrainzUrl(url: URL): MusicBrainzRef | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== HOST || url.port !== "") return null;
  if (url.username !== "" || url.password !== "") return null;
  const found = PATH.exec(url.pathname);
  if (found === null) return null;
  const [, entity, mbid] = found;
  if ((entity !== "release" && entity !== "recording") || mbid === undefined) return null;
  return { entity, mbid: mbid.toLowerCase() };
}

export function matchMusicBrainzUrl(url: URL): boolean {
  return parseMusicBrainzUrl(url) !== null;
}
