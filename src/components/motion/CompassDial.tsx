import type { CompassDirection } from "@/lib/kigakuContent";

/**
 * 金の羅盤の線画。飾り（aria-hidden）で、意味は必ず隣の文が持つ。
 *
 * 動き（docs/motion-accents.md）:
 * - 線が伸びる（motion-prompt の「ラインドロー」#004 に倣う）: 8 本の方位線が
 *   中心から外へ scaleY で伸び、輪は scale + opacity で現れる。
 *   stroke-dashoffset ではなく transform/opacity だけで描く。
 * - 針（「オーバーシュート」#010 ＋「イージング」#009）: needle を渡すと、
 *   金の針が吉方位を少し行き過ぎてから戻って止まる。
 * 動かない状態（JS なし・prefers-reduced-motion: reduce・アニメ終了後）は
 * どれも同じ最終の絵。動きは globals.css の motion-* が受け持つ。
 */

export const DIRECTION_ANGLE: Record<CompassDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];
const CARDINAL = [
  { a: 0, t: "北" },
  { a: 90, t: "東" },
  { a: 180, t: "南" },
  { a: 270, t: "西" },
];

export function CompassDial({
  needle,
  marks = [],
  labels = false,
  className = "",
}: {
  /** 針の向き。無ければ針を描かない。 */
  needle?: CompassDirection;
  /** 金の点を打つ方位（吉方位など）。 */
  marks?: readonly CompassDirection[];
  labels?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={`motion-dial ${className}`}
      data-needle={needle}
    >
      <g fill="none" stroke="#c9a54a" strokeLinecap="round">
        <circle
          className="motion-ring"
          cx="50"
          cy="50"
          r="46"
          strokeWidth="1.2"
        />
        <circle
          className="motion-ring"
          style={{ animationDelay: "120ms" }}
          cx="50"
          cy="50"
          r="34"
          strokeWidth="0.8"
          strokeDasharray="2 2.4"
        />
        <circle
          className="motion-ring"
          style={{ animationDelay: "220ms" }}
          cx="50"
          cy="50"
          r="12"
          strokeWidth="0.8"
        />
        {RAYS.map((a, i) => (
          <g key={a} transform={`rotate(${a} 50 50)`}>
            <line
              className="motion-ray"
              style={{ ["--i" as string]: i }}
              x1="50"
              y1="50"
              x2="50"
              y2={a % 90 === 0 ? 6 : 14}
              strokeWidth={a % 90 === 0 ? 1.1 : 0.7}
            />
          </g>
        ))}
      </g>
      {marks.map((d) => (
        <g key={d} transform={`rotate(${DIRECTION_ANGLE[d]} 50 50)`}>
          <circle
            className="motion-ring"
            cx="50"
            cy="18"
            r="3"
            fill="#c9a54a"
          />
        </g>
      ))}
      {labels &&
        CARDINAL.map(({ a, t }) => {
          const rad = (a * Math.PI) / 180;
          return (
            <text
              key={t}
              x={50 + Math.sin(rad) * 40}
              y={50 - Math.cos(rad) * 40 + 2.6}
              textAnchor="middle"
              fontSize="7"
              fontWeight="700"
              fill="#1e2a5a"
            >
              {t}
            </text>
          );
        })}
      {needle && (
        <g
          className="motion-needle"
          style={{
            ["--needle-angle" as string]: `${DIRECTION_ANGLE[needle]}deg`,
          }}
        >
          <path d="M50 14 L54 50 L46 50 Z" fill="#c9a54a" />
          <path d="M50 86 L54 50 L46 50 Z" fill="#1e2a5a" />
          <circle cx="50" cy="50" r="3.2" fill="#fff" stroke="#c9a54a" />
        </g>
      )}
    </svg>
  );
}
