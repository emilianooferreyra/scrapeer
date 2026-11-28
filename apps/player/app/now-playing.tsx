'use client';

import { usePlayback } from './playback-context';
import { formatDuration } from '@/lib/utils';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs truncate">{value || '-'}</p>
    </div>
  );
}

/** Data of the selected track, read-only: it comes from the source, not from the user. */
export function NowPlaying() {
  const { currentTrack } = usePlayback();

  if (!currentTrack) {
    return null;
  }

  return (
    <div className="hidden md:flex flex-col w-56 p-4 bg-[#121212] overflow-auto">
      <h2 className="mb-3 text-sm font-semibold text-gray-200">Now Playing</h2>
      <div className="relative w-full aspect-square mb-3">
        <img
          src={currentTrack.imageUrl || '/placeholder.svg'}
          alt={currentTrack.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="w-full space-y-2">
        <Field label="Title" value={currentTrack.name} />
        <Field label="Artist" value={currentTrack.artist} />
        <Field label="Album" value={currentTrack.album} />
        <Field label="Duration" value={currentTrack.duration ? formatDuration(currentTrack.duration) : ''} />
        <Field label="ISRC" value={currentTrack.isrcs.join(', ')} />
        <a
          href={currentTrack.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-gray-400 underline hover:text-white"
        >
          Open in MusicBrainz
        </a>
        {currentTrack.audioUrl ? null : (
          <p className="text-xs text-gray-500">No audio source yet.</p>
        )}
      </div>
    </div>
  );
}
