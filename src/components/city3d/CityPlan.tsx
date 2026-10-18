import { useId } from "react";
import {
  MOUNTAINS,
  polar,
  wedgePoints,
  type buildWedges,
} from "@/lib/city3d/model";
import type { CityData } from "@/lib/city3d/features";
import type { CompassModel } from "@/lib/compassModel";
import type { Point } from "@/lib/city3d/geo";
export interface ViewProps {
  data: CityData;
  radius: number;
  wedges: ReturnType<typeof buildWedges>;
  compass: CompassModel;
}
const points = (ps: Point[]) =>
  ps.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ");
export default function CityPlan({
  data,
  radius: r,
  wedges,
  compass,
}: ViewProps) {
  const id = useId(),
    extent = r * 1.43;
  return (
    <svg
      role="img"
      aria-label="街の平面図。上が真北です。"
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      className="h-[65vh] min-h-[420px] w-full bg-stone-50"
    >
      <defs>
        <clipPath id={id}>
          <circle r={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {data.water.map((p, i) => (
          <polygon key={`w${i}`} points={points(p)} fill="#b7d9e6" />
        ))}
        {data.roads.map((p, i) => (
          <polyline
            key={`r${i}`}
            points={points(p)}
            fill="none"
            stroke="#d6d3d1"
            strokeWidth={3}
          />
        ))}
        {data.rails.map((p, i) => (
          <polyline
            key={`t${i}`}
            points={points(p)}
            fill="none"
            stroke="#78716c"
            strokeWidth={2}
          />
        ))}
        {data.buildings.map((b, i) => (
          <path
            key={i}
            d={b.rings.map((r) => `M${points(r)}Z`).join(" ")}
            fill="#b4aaa0"
            fillRule="evenodd"
          />
        ))}
      </g>
      {wedges.map((w) => (
        <g key={w.direction}>
          <polygon
            points={points(wedgePoints(w.start, w.end, r))}
            fill={w.color ?? "none"}
            fillOpacity={0.22}
            stroke="#78716c"
            strokeWidth={0.9}
          />
        </g>
      ))}
      {compass.declinationKnown &&
        compass.sectors.map((s) => (
          <line
            key={s.direction}
            x1={0}
            y1={0}
            x2={polar(s.magStartDeg, r).x}
            y2={polar(s.magStartDeg, r).z}
            stroke="#64748b"
            opacity={0.45}
            strokeDasharray="5 5"
          />
        ))}
      {MOUNTAINS.map((m, i) => {
        const p = polar(i * 15, r * 1.07);
        return (
          <g key={m}>
            <polygon
              points={points([
                ...wedgePoints(i * 15 - 7.5, i * 15 + 7.5, r * 1.12).slice(1),
                ...wedgePoints(i * 15 - 7.5, i * 15 + 7.5, r)
                  .slice(1)
                  .reverse(),
              ])}
              fill="#f5f0e6"
              stroke="#a8a29e"
              strokeWidth={0.6}
            />
            <text
              x={p.x}
              y={p.z}
              fontSize={r * 0.045}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {m}
            </text>
          </g>
        );
      })}
      {wedges.map((w) => {
        const p = polar((w.start + w.end) / 2, r * 1.23);
        return (
          <text
            key={w.direction}
            x={p.x}
            y={p.z}
            textAnchor="middle"
            fontSize={r * 0.04}
          >
            {w.label}
            <tspan x={p.x} dy={r * 0.045}>
              {w.status}
            </tspan>
          </text>
        );
      })}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-r * 0.65}
        stroke="#334155"
        strokeWidth={2}
      />
      <path d={`M0 ${-r * 0.7}l-7 16h14Z`} fill="#334155" />
      <text x={8} y={-r * 0.6} fontSize={r * 0.04}>
        真北
      </text>
      {compass.declinationKnown && (
        <g>
          <line
            x1={0}
            y1={0}
            x2={polar(compass.needleDeg, r * 0.5).x}
            y2={polar(compass.needleDeg, r * 0.5).z}
            stroke="#b45309"
            strokeWidth={2}
          />
          <text
            x={polar(compass.needleDeg, r * 0.52).x - 25}
            y={polar(compass.needleDeg, r * 0.52).z}
            fontSize={r * 0.035}
          >
            磁北
          </text>
        </g>
      )}
      <circle r={5} fill="#9f1239" stroke="white" strokeWidth={2} />
    </svg>
  );
}
