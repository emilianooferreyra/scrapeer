'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useRef,
  useCallback,
} from 'react';
import type { YouTubeMatch } from '@scrapeer/core';
import type { YouTubeAnswer } from '@/app/api/youtube/route';
import type { Song } from '@/lib/types';
import { YouTubeMedia } from '@/lib/youtube-media';

type Panel = 'sidebar' | 'tracklist';

/** Where the selected track's audio stands: searched on click, then played on YouTube. */
export type TrackStatus =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'ready'; match: YouTubeMatch }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

type PlaybackContextType = {
  isPlaying: boolean;
  currentTrack: Song | null;
  currentTime: number;
  duration: number;
  togglePlayPause: () => void;
  playTrack: (track: Song) => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaylist: (songs: Song[]) => void;
  /** The YouTube player, shaped like the media element the controls expect. */
  audioRef: React.RefObject<YouTubeMedia | null>;
  trackStatus: TrackStatus;
  activePanel: Panel;
  setActivePanel: (panel: Panel) => void;
  registerPanelRef: (
    panel: Panel,
    ref: React.RefObject<HTMLElement | null>
  ) => void;
  handleKeyNavigation: (e: React.KeyboardEvent, panel: Panel) => void;
};

const PlaybackContext = createContext<PlaybackContextType | undefined>(
  undefined
);

function useKeyboardNavigation() {
  const [activePanel, setActivePanel] = useState<Panel>('sidebar');
  const panelRefs = useRef<
    Record<Panel, React.RefObject<HTMLElement | null> | null>
  >({
    sidebar: null,
    tracklist: null,
  });

  const registerPanelRef = useCallback(
    (panel: Panel, ref: React.RefObject<HTMLElement | null>) => {
      panelRefs.current[panel] = ref;
    },
    []
  );

  const handleKeyNavigation = useCallback(
    (e: React.KeyboardEvent, panel: Panel) => {
      const currentRef = panelRefs.current[panel];
      if (!currentRef?.current) return;

      const items = Array.from(
        currentRef.current.querySelectorAll('[tabindex="0"]')
      );
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % items.length;
          (items[nextIndex] as HTMLElement).focus();
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          (items[prevIndex] as HTMLElement).focus();
          break;
        case 'h':
          if (panel === 'tracklist') {
            e.preventDefault();
            setActivePanel('sidebar');
            const sidebarFirstItem =
              panelRefs.current.sidebar?.current?.querySelector(
                '[tabindex="0"]'
              ) as HTMLElement | null;
            sidebarFirstItem?.focus();
          }
          break;
        case 'l':
          if (panel === 'sidebar') {
            e.preventDefault();
            setActivePanel('tracklist');
            const tracklistFirstItem =
              panelRefs.current.tracklist?.current?.querySelector(
                '[tabindex="0"]'
              ) as HTMLElement | null;
            tracklistFirstItem?.focus();
          }
          break;
      }
    },
    []
  );

  return { activePanel, setActivePanel, registerPanelRef, handleKeyNavigation };
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Song | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [trackStatus, setTrackStatus] = useState<TrackStatus>({ kind: 'idle' });
  const [media] = useState(() => new YouTubeMedia());
  const audioRef = useRef<YouTubeMedia | null>(media);
  /** Only the answer for the last clicked track may start playback. */
  const requestRef = useRef(0);

  const { activePanel, setActivePanel, registerPanelRef, handleKeyNavigation } =
    useKeyboardNavigation();

  const togglePlayPause = useCallback(() => {
    if (trackStatus.kind !== 'ready') return;
    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
  }, [isPlaying, trackStatus, media]);

  const playTrack = useCallback(
    (track: Song) => {
      const request = ++requestRef.current;
      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(0);
      setActivePanel('tracklist');
      media.pause();
      setTrackStatus({ kind: 'searching' });

      const params = new URLSearchParams({
        id: track.id,
        artist: track.artist,
        title: track.name,
        duration: String(track.duration),
      });
      fetch(`/api/youtube?${params}`)
        .then((response) => response.json() as Promise<YouTubeAnswer>)
        .then((answer) => {
          if (request !== requestRef.current) return;
          if ('error' in answer) {
            setTrackStatus({ kind: 'error', message: answer.error });
          } else if (answer.match === null) {
            setTrackStatus({ kind: 'not_found' });
          } else {
            setTrackStatus({ kind: 'ready', match: answer.match });
            media.load(answer.match.videoId);
          }
        })
        .catch(() => {
          if (request === requestRef.current) {
            setTrackStatus({ kind: 'error', message: 'Could not reach the player server.' });
          }
        });
    },
    [setActivePanel, media]
  );

  const playNextTrack = useCallback(() => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (track) => track.id === currentTrack.id
      );
      const nextIndex = (currentIndex + 1) % playlist.length;
      playTrack(playlist[nextIndex]);
    }
  }, [currentTrack, playlist, playTrack]);

  const playPreviousTrack = useCallback(() => {
    if (currentTrack && playlist.length > 0) {
      const currentIndex = playlist.findIndex(
        (track) => track.id === currentTrack.id
      );
      const previousIndex =
        (currentIndex - 1 + playlist.length) % playlist.length;
      playTrack(playlist[previousIndex]);
    }
  }, [currentTrack, playlist, playTrack]);

  // The player, not the buttons, says whether it is playing; a finished track moves on.
  const playNextRef = useRef(playNextTrack);
  useEffect(() => {
    playNextRef.current = playNextTrack;
  }, [playNextTrack]);
  useEffect(() => {
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      playNextRef.current();
    };
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    return () => {
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
    };
  }, [media]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector(
          'input[type="search"]'
        ) as HTMLInputElement | null;
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [togglePlayPause]);

  return (
    <PlaybackContext.Provider
      value={{
        isPlaying,
        currentTrack,
        currentTime,
        duration,
        togglePlayPause,
        playTrack,
        playNextTrack,
        playPreviousTrack,
        setCurrentTime,
        setDuration,
        setPlaylist,
        audioRef,
        trackStatus,
        activePanel,
        setActivePanel,
        registerPanelRef,
        handleKeyNavigation,
      }}
    >
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const context = useContext(PlaybackContext);
  if (context === undefined) {
    throw new Error('usePlayback must be used within a PlaybackProvider');
  }
  return context;
}
