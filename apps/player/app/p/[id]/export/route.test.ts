import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  exportResource,
  musicbrainz,
  silentLogger,
  type Resource,
  type Scrapeer,
} from '@scrapeer/core';

// connection() needs a live Next request; outside one it only has to resolve.
vi.mock('next/server', () => ({ connection: async () => {} }));

const FIXTURES = new URL('../../../../../../packages/core/fixtures/musicbrainz/', import.meta.url);
/** Resolves a release fixture offline; its id comes from the fixture itself. */
async function release(name: string): Promise<Resource> {
  const body = readFileSync(new URL(name, FIXTURES), 'utf8');
  const fixture: unknown = JSON.parse(body);
  const id = typeof fixture === 'object' && fixture !== null && 'id' in fixture ? String(fixture.id) : '';
  const result = await musicbrainz.resolve(new URL(`https://musicbrainz.org/release/${id}`), {
    logger: silentLogger,
    transport: {
      id: 'http',
      get: async (requestUrl) => ({
        ok: true,
        value: {
          status: 200,
          requestUrl,
          finalUrl: requestUrl,
          headers: new Headers({ 'content-type': 'application/json' }),
          body: new TextEncoder().encode(body),
          fetchedAt: '2026-11-27T22:06:51.312Z',
          access: 'official_api',
        },
      }),
    },
  });
  if (!result.ok || result.value.kind !== 'collection') throw new Error(`bad fixture ${name}`);
  return result.value;
}

const album = await release('release-in-rainbows.json');
const other = await release('release-partial-date.json');
if (album.kind !== 'collection' || other.kind !== 'collection') throw new Error('bad fixtures');
const ALBUM_ID = album.collection.id;
const PARTIAL_ID = other.collection.id;
/** Another album whose source has one more page than was fetched. */
const partial: Resource = { ...other, page: { ...other.page, nextCursor: 'next' } };

// The library takes its service from globalThis (lib/library.ts); this one answers offline.
const fake: Scrapeer = {
  resolve: async (input) => ({ ok: true, value: input.includes(PARTIAL_ID) ? partial : album }),
};
Reflect.set(globalThis, 'scrapeerService', fake);
const { getPlaylistWithSongs, resolveLink } = await import('@/lib/library');
const { GET } = await import('./route');

function download(id: string, query: string) {
  const request = new Request(`http://127.0.0.1:3000/p/${id}/export${query}`);
  return GET(request, { params: Promise.resolve({ id }) });
}

beforeAll(async () => {
  await resolveLink(`https://musicbrainz.org/release/${ALBUM_ID}`);
  await resolveLink(`https://musicbrainz.org/release/${PARTIAL_ID}`);
});

describe('GET /p/<id>/export', () => {
  it.each(['csv', 'json'] as const)('format=%s: the CLI file, as a download', async (format) => {
    const response = await download(ALBUM_ID, `?format=${format}`);
    const file = exportResource(album, format);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(file.mediaType);
    expect(response.headers.get('content-disposition')).toContain(`filename="${file.name}"`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(file.text);
  });

  it.each(['?format=xml', '?format=CSV', ''])('%s: 400', async (query) => {
    const response = await download(ALBUM_ID, query);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Unknown format: use csv or json.\n');
  });

  it('an id not in the library: 404', async () => {
    const response = await download('not-resolved', '?format=csv');
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not in the library.\n');
  });
});

describe('the album page notice', () => {
  it('is null for a whole album', async () => {
    expect((await getPlaylistWithSongs(ALBUM_ID))?.notice).toBeNull();
  });

  it('says the export is partial when the source has more pages', async () => {
    expect((await getPlaylistWithSongs(PARTIAL_ID))?.notice).toBe(
      `only the first ${other.page.items.length} tracks are included; the source has more pages (not fetched yet).`,
    );
  });
});
