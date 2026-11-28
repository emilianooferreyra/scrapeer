import { redirect } from 'next/navigation';
import { resolveLink } from '@/lib/library';

export default async function ResolvePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  const result = await resolveLink(url ?? '');
  if (result.ok) {
    redirect(`/p/${result.id}`);
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0A0A0A] p-6 pb-[69px] text-sm">
      <h1 className="mb-2 font-semibold text-gray-200">Could not load that link</h1>
      <p className="text-red-400">{result.message}</p>
      {url ? <p className="mt-2 text-xs text-gray-500 break-all">{url}</p> : null}
    </div>
  );
}
