/**
 * しるべが手を振る「今日の吉方位と時間」の横断幕。
 * 元は /houi/today 先頭（#1856）。ホームの天気の下へ移した。
 */
export function TodayShirubeBanner({
  sizes,
  priority = false,
}: {
  sizes: string;
  priority?: boolean;
}) {
  return (
    <picture>
      <source
        type="image/avif"
        srcSet="/today/banner-480.avif 480w, /today/banner-960.avif 960w"
        sizes={sizes}
      />
      <img
        src="/today/banner-960.webp"
        srcSet="/today/banner-480.webp 480w, /today/banner-960.webp 960w"
        sizes={sizes}
        alt="朝焼けの空の下で手を振るしるべと、方位の絵"
        width={960}
        height={435}
        {...(priority
          ? { fetchPriority: "high" as const }
          : { loading: "lazy" as const })}
        decoding="async"
        className="h-auto w-full rounded-2xl"
      />
    </picture>
  );
}
