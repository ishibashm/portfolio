/**
 * 夜空の小さな星（motion-prompt の「パーティクル」#015 を控えめにしたもの）。
 * 飾り（aria-hidden）。12 個の SVG の星の opacity と scale だけを動かす。
 * 動かさない設定では、星は止まったまま見える（最終の絵）。
 */
const STARS = [
  { x: 6, y: 18, s: 1, d: 0, t: 3.4 },
  { x: 14, y: 62, s: 0.7, d: 1.1, t: 2.8 },
  { x: 22, y: 34, s: 0.55, d: 2.0, t: 3.9 },
  { x: 31, y: 78, s: 0.8, d: 0.6, t: 3.1 },
  { x: 40, y: 14, s: 0.6, d: 1.7, t: 4.2 },
  { x: 48, y: 52, s: 1.1, d: 0.3, t: 3.6 },
  { x: 57, y: 26, s: 0.65, d: 2.4, t: 2.9 },
  { x: 65, y: 70, s: 0.9, d: 1.3, t: 3.3 },
  { x: 73, y: 40, s: 0.6, d: 0.9, t: 4.0 },
  { x: 81, y: 12, s: 1, d: 2.2, t: 3.0 },
  { x: 88, y: 58, s: 0.7, d: 0.2, t: 3.7 },
  { x: 95, y: 30, s: 0.85, d: 1.5, t: 3.2 },
];

export function TwinkleStars({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute ${className}`}
      data-testid="twinkle-stars"
    >
      {STARS.map((s, i) => (
        <svg
          key={i}
          viewBox="-4 -4 8 8"
          focusable="false"
          className="motion-twinkle absolute"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${Math.round(12 * s.s)}px`,
            height: `${Math.round(12 * s.s)}px`,
            ["--delay" as string]: `${s.d}s`,
            ["--dur" as string]: `${s.t}s`,
          }}
        >
          <path
            d="M0 -3.6 L0.9 -0.9 L3.6 0 L0.9 0.9 L0 3.6 L-0.9 0.9 L-3.6 0 L-0.9 -0.9 Z"
            fill={i % 3 === 0 ? "#1e2a5a" : "#c9a54a"}
          />
        </svg>
      ))}
    </span>
  );
}
