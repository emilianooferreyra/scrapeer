'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * Filters All Tracks. It only navigates when the user types or clears it: navigating on
 * mount would pull every page (an album, a just-resolved link) back to All Tracks.
 */
export function SearchInput() {
  let router = useRouter();
  let searchParams = useSearchParams();
  let [value, setValue] = useState(searchParams.get('q') ?? '');

  function update(next: string) {
    setValue(next);
    router.replace(next ? `/?q=${encodeURIComponent(next)}` : '/');
  }

  return (
    <div className="relative">
      <Input
        type="search"
        className="mb-4 bg-[#1A1A1A] border-[#333] text-xs h-8 focus-visible:ring-0 pr-8 [&::-webkit-search-cancel-button]:appearance-none"
        style={{
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
        }}
        placeholder="Search"
        value={value}
        onChange={(e) => update(e.currentTarget.value)}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
          onClick={() => update('')}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Clear search</span>
        </Button>
      ) : (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center bg-neutral-800 rounded text-neutral-400 border border-neutral-700">
          <span className="font-mono text-xs">/</span>
        </div>
      )}
    </div>
  );
}
