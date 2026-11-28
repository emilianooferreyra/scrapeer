import { attachmentHeader, isExportFormat } from '@scrapeer/core';
import { getExport } from '@/lib/library';

/** GET /p/<id>/export?format=csv|json downloads the album as the CLI would save it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const format = new URL(request.url).searchParams.get('format') ?? '';
  if (!isExportFormat(format)) {
    return new Response('Unknown format: use csv or json.\n', { status: 400 });
  }
  const file = getExport((await params).id, format);
  if (!file) return new Response('Not in the library.\n', { status: 404 });
  return new Response(file.text, {
    headers: {
      'Content-Type': file.mediaType,
      'Content-Disposition': attachmentHeader(file.name),
      'Cache-Control': 'no-store',
    },
  });
}
