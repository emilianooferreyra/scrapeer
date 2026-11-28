import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { TrackTable } from './p/[id]/track-table';
import { getSongs } from '@/lib/library';
import { Suspense } from 'react';

async function Tracks({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q;
  const songs = await getSongs(query);
  if (songs.length === 0 && !query) {
    return (
      <p className="px-4 py-6 text-xs text-gray-400">
        Paste a MusicBrainz album or recording link in the sidebar to start.
      </p>
    );
  }
  return <TrackTable query={query} songs={songs} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0A0A] pb-[69px] pt-2">
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Suspense fallback={<div className="w-full" />}>
            <Tracks searchParams={searchParams} />
          </Suspense>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
