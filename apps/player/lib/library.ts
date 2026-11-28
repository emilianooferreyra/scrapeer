import { connection } from 'next/server';
import {
  createHttpTransport,
  musicbrainz,
  silentLogger,
  USER_AGENT,
  type Resource,
  type Track,
} from '@scrapeer/core';
import type { Playlist, PlaylistWithSongs, Song } from './types';

/**
 * The library is the set of links resolved in this server session, kept in memory.
 * Nothing is stored on disk yet: storage is still to be decided (no Postgres).
 */
type Library = Map<string, PlaylistWithSongs>;
const shared = globalThis as typeof globalThis & { scrapeerLibrary?: Library };
const library: Library = (shared.scrapeerLibrary ??= new Map());

const transport = createHttpTransport({
  hosts: musicbrainz.hosts,
  officialApi: musicbrainz.officialApi,
  userAgent: USER_AGENT,
  robotsToken: 'scrapeer',
  // MusicBrainz allows 1 request per second (docs/05-providers.md).
  limits: { 'musicbrainz.org': { capacity: 1, refillPerSec: 1, jitterMs: 250 } },
});

function toSong(track: Track, album: string, index: number): Song {
  return {
    id: `${track.id}:${track.collection?.position ?? index + 1}`,
    name: track.title,
    artist: track.artist ?? '',
    album,
    duration: track.durationSec ?? 0,
    imageUrl: track.artworkUrl,
    sourceUrl: track.url,
    isrcs: track.isrcs,
  };
}

function toPlaylist(resource: Resource): PlaylistWithSongs {
  if (resource.kind === 'collection') {
    const { collection, page } = resource;
    const songs = page.items.map((track, i) => toSong(track, collection.title, i));
    return {
      id: collection.id,
      name: collection.title,
      artist: collection.artist ?? '',
      kind: 'album',
      coverUrl: songs[0]?.imageUrl ?? null,
      sourceUrl: collection.url,
      songs,
      trackCount: songs.length,
      duration: songs.reduce((total, song) => total + song.duration, 0),
    };
  }
  const song = toSong(resource.track, '', 0);
  return {
    id: resource.track.id,
    name: resource.track.title,
    artist: song.artist,
    kind: 'track',
    coverUrl: null,
    sourceUrl: resource.track.url,
    songs: [song],
    trackCount: 1,
    duration: song.duration,
  };
}

export type ResolveOutcome = { ok: true; id: string } | { ok: false; message: string };

/** Resolves a pasted link through scrapeer and adds it to the library. */
export async function resolveLink(input: string): Promise<ResolveOutcome> {
  const url = URL.parse(input.trim());
  if (url === null) return { ok: false, message: 'That is not a link.' };
  if (!musicbrainz.match(url)) {
    return { ok: false, message: 'For now only MusicBrainz release or recording links work.' };
  }
  let result = await musicbrainz.resolve(url, { transport, logger: silentLogger });
  // MusicBrainz often answers 503 to the first lookup right after robots.txt; one retry,
  // after the wait it asks for (capped), is enough. General backoff belongs to the core (Phase 4).
  if (!result.ok && result.error.kind === 'rate_limited') {
    const waitSec = Math.min(result.error.retryAfterSec ?? 1, 5);
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
    result = await musicbrainz.resolve(url, { transport, logger: silentLogger });
  }
  if (!result.ok) return { ok: false, message: result.error.message };
  const playlist = toPlaylist(result.value);
  library.set(playlist.id, playlist);
  return { ok: true, id: playlist.id };
}

export async function getPlaylists(): Promise<Playlist[]> {
  await connection();
  return [...library.values()].reverse().map(({ songs, trackCount, duration, ...playlist }) => playlist);
}

export async function getPlaylistWithSongs(id: string): Promise<PlaylistWithSongs | null> {
  await connection();
  return library.get(id) ?? null;
}

export async function getSongs(query?: string): Promise<Song[]> {
  await connection();
  const songs = [...library.values()].reverse().flatMap((playlist) => playlist.songs);
  const needle = query?.trim().toLowerCase();
  if (!needle) return songs;
  return songs.filter((song) =>
    [song.name, song.artist, song.album].some((field) => field.toLowerCase().includes(needle))
  );
}
