/** What the player shows: one row of the track table. Built from a scrapeer Track. */
export type Song = {
  /** Unique within the library: the recording MBID plus its position, since an album can repeat a recording. */
  id: string;
  name: string;
  artist: string;
  album: string;
  /** Seconds; 0 when the source does not know it. */
  duration: number;
  imageUrl: string | null;
  /** No source gives audio yet (P5); the player shows the data and does not play. */
  audioUrl: string | null;
  sourceUrl: string;
  isrcs: string[];
};

/** A resolved link in the sidebar: an album, or a single recording. */
export type Playlist = {
  id: string;
  name: string;
  artist: string;
  kind: 'album' | 'track';
  coverUrl: string | null;
  sourceUrl: string;
};

export type PlaylistWithSongs = Playlist & {
  songs: Song[];
  trackCount: number;
  duration: number;
};
