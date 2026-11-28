import { connection } from 'next/server';
import { createScrapeer, type Resource, type Scrapeer, type Track } from '@scrapeer/core';
import type { Playlist, PlaylistWithSongs, Song } from './types';

/**
 * The library is the set of links resolved in this server session, kept in memory.
 * Nothing is stored on disk yet: storage is still to be decided (no Postgres).
 */
type Library = Map<string, PlaylistWithSongs>;
const shared = globalThis as typeof globalThis & {
  scrapeerLibrary?: Library;
  scrapeerService?: Scrapeer;
};
const library: Library = (shared.scrapeerLibrary ??= new Map());

/**
 * The same service the CLI uses: links resolve and fail with the same messages. Kept on
 * globalThis like the library, so a dev reload does not start a second rate limiter.
 */
const scrapeer: Scrapeer = (shared.scrapeerService ??= createScrapeer());

function toSong(playlistId: string, track: Track, album: string, index: number): Song {
  return {
    // A recording can appear in several playlists and twice in one album: all three parts keep rows apart.
    id: `${playlistId}:${track.id}:${track.collection?.position ?? index + 1}`,
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
    const songs = page.items.map((track, i) => toSong(collection.id, track, collection.title, i));
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
  const song = toSong(resource.track.id, resource.track, '', 0);
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
  const result = await scrapeer.resolve(input);
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

/** A song already in the library; the YouTube search only runs for these. */
export function findSong(id: string): Song | null {
  for (const playlist of library.values()) {
    const song = playlist.songs.find((candidate) => candidate.id === id);
    if (song) return song;
  }
  return null;
}
