'use client';

import React, { createContext, useContext, use } from 'react';
import type { Playlist } from '@/lib/types';

type PlaylistContextType = {
  playlists: Playlist[];
};

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export function PlaylistProvider({
  children,
  playlistsPromise,
}: {
  children: React.ReactNode;
  playlistsPromise: Promise<Playlist[]>;
}) {
  const playlists = use(playlistsPromise);
  return <PlaylistContext.Provider value={{ playlists }}>{children}</PlaylistContext.Provider>;
}

export function usePlaylist() {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error('usePlaylist must be used within a PlaylistProvider');
  }
  return context;
}
