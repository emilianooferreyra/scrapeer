'use client';

import { useEffect, useRef } from 'react';
import { usePlayback, type TrackStatus } from './playback-context';
import { formatDuration } from '@/lib/utils';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs truncate">{value || '-'}</p>
    </div>
  );
}

function statusText(status: TrackStatus): string | null {
  switch (status.kind) {
    case 'searching':
      return 'Looking for it on YouTube…';
    case 'not_found':
      return 'Not found on YouTube.';
    case 'error':
      return status.message;
    case 'ready':
      return status.match.exact ? null : 'Closest YouTube match; the length differs.';
    case 'idle':
      return null;
  }
}

/** The YouTube player (visible, as YouTube requires) and the selected track's data. */
export function NowPlaying() {
  const { currentTrack, audioRef, trackStatus } = usePlayback();
  const playerRef = useRef<HTMLDivElement>(null);
  const hasTrack = currentTrack !== null;

  useEffect(() => {
    const media = audioRef.current;
    const container = playerRef.current;
    if (!hasTrack || !media || !container) return;
    void media.attach(container);
    return () => {
      media.detach();
      container.replaceChildren();
    };
  }, [hasTrack, audioRef]);

  if (!currentTrack) {
    return null;
  }

  const status = statusText(trackStatus);

  return (
    <div className="hidden md:flex flex-col w-56 p-3 bg-[#121212] overflow-auto">
      <h2 className="mb-3 text-sm font-semibold text-gray-200">Now Playing</h2>
      <div ref={playerRef} className="w-full aspect-square mb-2 bg-black" />
      {status ? <p className="mb-2 text-xs text-gray-400">{status}</p> : null}
      <div className="w-full space-y-2">
        <Field label="Title" value={currentTrack.name} />
        <Field label="Artist" value={currentTrack.artist} />
        <Field label="Album" value={currentTrack.album} />
        <Field
          label="Duration"
          value={currentTrack.duration ? formatDuration(currentTrack.duration) : ''}
        />
        <Field label="ISRC" value={currentTrack.isrcs.join(', ')} />
        <a
          href={currentTrack.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-gray-400 underline hover:text-white"
        >
          Open in MusicBrainz
        </a>
        {trackStatus.kind === 'ready' ? (
          <a
            href={trackStatus.match.url}
            target="_blank"
            rel="noreferrer"
            className="block text-xs text-gray-400 underline hover:text-white"
          >
            Open on YouTube
          </a>
        ) : null}
      </div>
    </div>
  );
}
