import { TIER_FILL } from "@/utils/tierDisplay";

export type CompassCount = {
  direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | string;
  label: string; // 北, 北東, ...
  primary: number; // 吉の日 or 三盤吉
  secondary?: number; // 凶なし (optional)
};

const COMPASS_ORDER = [
  { direction: "N", label: "北" },
  { direction: "NE", label: "北東" },
  { direction: "E", label: "東" },
  { direction: "SE", label: "南東" },
  { direction: "S", label: "南" },
  { direction: "SW", label: "南西" },
  { direction: "W", label: "西" },
  { direction: "NW", label: "北西" },
] as const;

const CX = 120;
const CY = 120;
const R_INNER = 24;
const R_OUTER = 108;
const R_TEXT = 69;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [
    Math.round((CX + r * Math.cos(rad)) * 100) / 100,
    Math.round((CY + r * Math.sin(rad)) * 100) / 100,
  ];
}

function sectorPath(startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(R_OUTER, startDeg);
  const [x2, y2] = polar(R_OUTER, endDeg);
  const [x3, y3] = polar(R_INNER, endDeg);
  const [x4, y4] = polar(R_INNER, startDeg);
  return `M ${x1} ${y1} A ${R_OUTER} ${R_OUTER} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${R_INNER} ${R_INNER} 0 0 0 ${x4} ${y4} Z`;
}

export function DirectionCountCompass({
  items,
  primaryName,
  secondaryName,
  caption,
}: {
  items: readonly CompassCount[];
  primaryName: string;
  secondaryName?: string;
  caption?: string;
}) {
  const byDir = new Map(items.map((item) => [item.direction, item]));
  const normalized = COMPASS_ORDER.map(({ direction, label }) => {
    const found = byDir.get(direction);
    return {
      direction,
      label: found?.label ?? label,
      primary: found?.primary ?? 0,
      secondary: found?.secondary,
    };
  });

  const maxPrimary = Math.max(0, ...normalized.map((d) => d.primary));

  return (
    <figure className="flex flex-col items-center gap-2 text-ink">
      <figcaption className="sr-only">
        {caption ?? `方位ごとの${primaryName}（件数）`}
      </figcaption>
      {caption && (
        <p aria-hidden="true" className="text-xs font-semibold text-ink-muted">
          {caption}
        </p>
      )}
      <svg
        viewBox="0 0 240 240"
        aria-hidden="true"
        className="h-52 w-52 sm:h-60 sm:w-60"
      >
        {normalized.map((item, i) => {
          const centerDeg = -90 + i * 45;
          const startDeg = centerDeg - 22.5;
          const endDeg = centerDeg + 22.5;
          const [tx, ty] = polar(R_TEXT, centerDeg);
          const fillOpacity =
            item.primary > 0 && maxPrimary > 0
              ? Math.round((0.06 + 0.26 * (item.primary / maxPrimary)) * 1000) /
                1000
              : 0.03;
          return (
            <g key={item.direction}>
              <path
                d={sectorPath(startDeg, endDeg)}
                fill={TIER_FILL.S}
                fillOpacity={fillOpacity}
                stroke="currentColor"
                strokeOpacity={0.18}
                strokeWidth={1}
              />
              <text
                x={tx}
                y={ty - 6}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10.5}
                fontWeight={600}
                fill="currentColor"
                fillOpacity={item.primary > 0 ? 0.92 : 0.6}
              >
                {item.label}
              </text>
              <text
                x={tx}
                y={ty + 8}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={700}
                fill="currentColor"
                fillOpacity={item.primary > 0 ? 1 : 0.5}
              >
                {item.primary}
              </text>
            </g>
          );
        })}
        <circle
          cx={CX}
          cy={CY}
          r={R_INNER}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
      </svg>
      <ul className="sr-only">
        {normalized.map((item) => (
          <li key={item.direction}>
            {item.label} {primaryName} {item.primary}日
            {secondaryName && item.secondary !== undefined
              ? `／${secondaryName} ${item.secondary}日`
              : ""}
          </li>
        ))}
      </ul>
    </figure>
  );
}
