'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { usePlayback } from '@/app/playback-context';
import { usePlaylist } from '@/app/hooks/use-playlist';
import type { Playlist } from '@/lib/types';
import { SearchInput } from './search';

function PlaylistRow({ playlist }: { playlist: Playlist }) {
  let pathname = usePathname();

  return (
    <li>
      <Link
        prefetch={true}
        href={`/p/${playlist.id}`}
        className={`block py-1 px-4 cursor-pointer hover:bg-[#1A1A1A] text-[#d1d5db] focus:outline-none focus:ring-[0.5px] focus:ring-gray-400 ${
          pathname === `/p/${playlist.id}` ? 'bg-[#1A1A1A]' : ''
        }`}
        tabIndex={0}
      >
        <span className="block truncate">{playlist.name}</span>
        {playlist.artist ? (
          <span className="block truncate text-gray-500">{playlist.artist}</span>
        ) : null}
      </Link>
    </li>
  );
}

/** Sidebar: paste a link, search, and the albums resolved in this session. */
export function OptimisticPlaylists() {
  let { playlists } = usePlaylist();
  let playlistsContainerRef = useRef<HTMLUListElement>(null);
  let pathname = usePathname();
  let { registerPanelRef, handleKeyNavigation, setActivePanel } = usePlayback();

  useEffect(() => {
    registerPanelRef('sidebar', playlistsContainerRef);
  }, [registerPanelRef]);

  return (
    <div
      className="hidden md:block w-56 bg-[#121212] h-[100dvh] overflow-auto"
      onClick={() => setActivePanel('sidebar')}
    >
      <div className="m-4">
        <form action="/resolve" method="get" className="mb-2">
          <Input
            name="url"
            type="url"
            required
            className="bg-[#1A1A1A] border-[#333] text-xs h-8 focus-visible:ring-0"
            placeholder="Paste a MusicBrainz link"
            aria-label="MusicBrainz album or recording link"
          />
        </form>
        <SearchInput />
        <div className="mb-6">
          <Link
            href="/"
            className={`block py-1 px-4 -mx-4 text-xs text-[#d1d5db] hover:bg-[#1A1A1A] transition-colors focus:outline-none focus:ring-[0.5px] focus:ring-gray-400 ${
              pathname === '/' ? 'bg-[#1A1A1A]' : ''
            }`}
          >
            All Tracks
          </Link>
        </div>
        <p className="mb-4 text-xs font-semibold text-gray-400">Library</p>
      </div>
      <ScrollArea className="h-[calc(100dvh-220px)]">
        <ul
          ref={playlistsContainerRef}
          className="space-y-0.5 text-xs mt-[1px]"
          onKeyDown={(e) => handleKeyNavigation(e, 'sidebar')}
        >
          {playlists.map((playlist) => (
            <PlaylistRow key={playlist.id} playlist={playlist} />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
