/** Cover of an album or recording; a placeholder until a cover source exists (P5). */
export function CoverImage({ url, alt }: { url: string | null; alt: string }) {
  return (
    <img
      src={url || '/placeholder.svg'}
      alt={`${alt} cover`}
      className="w-16 h-16 sm:w-20 sm:h-20 object-cover bg-[#1A1A1A]"
    />
  );
}
