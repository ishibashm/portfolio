import Image from "next/image";

const AVIF_SOURCES =
  "/guide/shirube-pointing-96.avif 96w, /guide/shirube-pointing-240.avif 240w";
const WEBP_SOURCES =
  "/guide/shirube-pointing-96.webp 96w, /guide/shirube-pointing-240.webp 240w";

export function ShirubeAvatar({ className = "" }: { className?: string }) {
  return (
    <picture
      className={`relative block h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-white bg-indigo-50 shadow-sm ring-1 ring-indigo-200 sm:h-10 sm:w-10 ${className}`}
      data-shirube-avatar=""
    >
      <source type="image/avif" srcSet={AVIF_SOURCES} sizes="120px" />
      <source type="image/webp" srcSet={WEBP_SOURCES} sizes="120px" />
      <Image
        src="/guide/shirube-pointing-96.webp"
        alt="しるべ"
        width={96}
        height={118}
        sizes="120px"
        loading="lazy"
        decoding="async"
        draggable={false}
        unoptimized
        className="h-full w-full max-w-none select-none object-none object-[64%_4%]"
      />
    </picture>
  );
}
