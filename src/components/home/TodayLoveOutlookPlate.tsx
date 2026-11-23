import Image from "next/image";
import { InViewOnce } from "@/components/motion/InViewOnce";

/**
 * 巻頭の表紙イラストと、その上の控えめな飾り（瞬く星・光の輪）。
 * 光の筋は画面に入ったとき 1 回だけ。飾りは aria-hidden。
 */
const BANNER_STARS = [
  { x: 7, y: 28, s: 0.65, d: 0, t: 3.6 },
  { x: 28, y: 14, s: 0.5, d: 1.5, t: 4.2 },
  { x: 46, y: 10, s: 0.55, d: 0.6, t: 3.4 },
  { x: 63, y: 12, s: 0.45, d: 2.2, t: 3.9 },
  { x: 88, y: 18, s: 0.7, d: 1.1, t: 3.2 },
  { x: 93, y: 48, s: 0.5, d: 2.8, t: 4.0 },
  { x: 6, y: 58, s: 0.45, d: 1.8, t: 3.7 },
  { x: 34, y: 84, s: 0.55, d: 0.4, t: 3.5 },
  { x: 66, y: 86, s: 0.5, d: 2.5, t: 4.1 },
  { x: 86, y: 76, s: 0.6, d: 0.9, t: 3.3 },
];

export function TodayLoveOutlookPlate() {
  return (
    <InViewOnce
      as="div"
      className="motion-plate-sweep overflow-hidden border-b border-theme-gold/40 bg-[#00142d]"
    >
      <Image
        src="/home/love-horoscope-header.webp"
        alt=""
        width={1280}
        height={720}
        sizes="(min-width: 100rem) 24rem, (min-width: 64rem) 56rem, 100vw"
        loading="lazy"
        className="aspect-[11/5] h-auto w-full object-cover object-[center_48%] @min-[52rem]:aspect-[3/1] @min-[52rem]:object-center"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        {BANNER_STARS.map((star, index) => (
          <svg
            key={index}
            viewBox="-4 -4 8 8"
            focusable="false"
            className="motion-twinkle absolute text-theme-gold"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${Math.round(11 * star.s)}px`,
              height: `${Math.round(11 * star.s)}px`,
              ["--delay" as string]: `${star.d}s`,
              ["--dur" as string]: `${star.t}s`,
            }}
          >
            <path
              d="M0 -3.6 L0.9 -0.9 L3.6 0 L0.9 0.9 L0 3.6 L-0.9 0.9 L-3.6 0 L-0.9 -0.9 Z"
              fill="currentColor"
            />
          </svg>
        ))}
        <span className="absolute top-1/2 left-1/2 flex size-[26%] -translate-x-1/2 -translate-y-1/2">
          <svg
            viewBox="0 0 100 100"
            className="motion-halo-spin size-full text-theme-gold"
            fill="none"
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              stroke="currentColor"
              strokeWidth="0.7"
              strokeDasharray="1.2 3.8"
              opacity="0.4"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              stroke="currentColor"
              strokeWidth="0.35"
              opacity="0.22"
            />
          </svg>
        </span>
      </span>
    </InViewOnce>
  );
}
