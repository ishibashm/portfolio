"use client";

/**
 * 地球儀の上の方位の扇形（/houi/area）。出発地の県を選ぶと、8 方位の
 * 扇形を大圏で地球儀に描き、一覧の街を方位の色で打つ。地図に直線を
 * 引くと別の方位に見える街を数えて並べる。
 *
 * 角度と点は globeModel（判定と同じ bearingBetween → directionFromBearing）。
 * 立体（GlobeScene、three.js）は節が画面に入ったときだけ読む。WebGL が
 * 無い端末と「平面」では、正距方位図法（出発地を通る大圏が中心からの
 * 直線になる図）で同じ中身を描く。
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import {
  azimuthalEquidistant,
  boundaryLines,
  classifyCities,
  type GeoPoint,
} from "@/lib/globeModel";
import { sectorRange } from "@/lib/threeBoardModel";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { supportsWebGL } from "@/lib/webglSupport";
import {
  COMPASS_DIRECTIONS,
  DIRECTION_LABELS,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";
import type { QuickFindArea } from "@/components/houi/AreaQuickFind";
import type { GlobeSceneData } from "@/components/houi/GlobeScene";

const GlobeScene = dynamic(() => import("@/components/houi/GlobeScene"), {
  ssr: false,
  loading: () => (
    <p className="p-6 text-sm text-stone-500">地球儀を読み込んでいます…</p>
  ),
});

/** 方位ごとの色（隣どうしが見分けられる並び）。立体（GlobeScene）もこれを読む */
export const DIRECTION_COLOR: Record<CompassDirection, string> = {
  N: "#2563eb",
  NE: "#0891b2",
  E: "#059669",
  SE: "#65a30d",
  S: "#d97706",
  SW: "#dc2626",
  W: "#c026d3",
  NW: "#7c3aed",
};

/** 扇形を描く長さ（km）。日本の端から端が収まる */
export const GLOBE_RANGE_KM = 2000;

const PREFS = Object.keys(PREFECTURE_CENTERS);

const LEAD =
  "方位は、出発地から見た地球の上の最短の道（大圏）の向きで決まります。平らな地図に定規で直線を引いた向きとは、遠くなるほどずれます。白い線が判定の境目、橙の線が地図に直線を引いたときの境目です。";

const RING_NOTE =
  "白い輪の街は、平らな地図に直線を引くと隣の方位に見える街です。このサイトの判定は白い線（大圏）で行っています。";

function buildData(
  pref: string,
  areas: QuickFindArea[],
  mapping: NodeMapping,
): GlobeSceneData {
  const origin: GeoPoint = PREFECTURE_CENTERS[pref];
  const cities = classifyCities(
    origin,
    areas.map(([code, , name, lat, lon]) => ({ code, name, lat, lon })),
    mapping,
  );
  const wedges = COMPASS_DIRECTIONS.map((direction) => {
    const [start, end] = sectorRange(direction, mapping);
    return { direction, start, end };
  });
  const lines = boundaryLines(origin, mapping, GLOBE_RANGE_KM);
  return { origin, wedges, lines, cities, rangeKm: GLOBE_RANGE_KM };
}

/** 正距方位図法の平面図。中心が出発地、上が北 */
export function FlatGlobe({ data }: { data: GlobeSceneData }) {
  const C = 200;
  const S = 185 / data.rangeKm;
  const xy = (p: GeoPoint) => {
    const [e, n] = azimuthalEquidistant(data.origin, p);
    return [C + e * S, C - n * S] as const;
  };
  const path = (pts: GeoPoint[]) =>
    pts
      .map((p, i) => {
        const [x, y] = xy(p);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  return (
    <svg
      viewBox="0 0 400 400"
      className="mx-auto h-auto w-full max-w-[460px]"
      role="img"
      aria-label="出発地を中心にした正距方位図法の図。上が北。白い線が大圏の境目、橙の線が地図に直線を引いたときの境目"
    >
      <circle cx={C} cy={C} r={196} fill="#0b3a5b" />
      {data.lines.map((l, i) => (
        <g key={i}>
          <path
            d={path(l.greatCircle)}
            stroke="#ffffff"
            strokeWidth={1.5}
            fill="none"
            data-gc-line={i}
          />
          <path
            d={path(l.rhumb)}
            stroke="#f97316"
            strokeWidth={1.5}
            fill="none"
            data-rhumb-line={i}
          />
        </g>
      ))}
      {data.cities.map((c) => {
        const [x, y] = xy(c);
        return (
          <g key={c.code}>
            {c.differs && (
              <circle
                cx={x}
                cy={y}
                r={4.5}
                fill="none"
                stroke="#fff"
                strokeWidth={1.2}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={2}
              fill={DIRECTION_COLOR[c.direction]}
              data-city={c.code}
              data-direction={c.direction}
            />
          </g>
        );
      })}
      <circle cx={C} cy={C} r={4} fill="#d4a54a" />
      <text
        x={C}
        y={16}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#e0f2fe"
      >
        北
      </text>
    </svg>
  );
}

export function GreatCircleGlobe({ areas }: { areas: QuickFindArea[] }) {
  const [pref, setPref] = useState("東京都");
  const [mapping, setMapping] = useState<NodeMapping>("traditional");
  const [webgl] = useState(supportsWebGL);
  const [view, setView] = useState<"3d" | "flat">(webgl ? "3d" : "flat");
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  const hostRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const el = hostRef.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setInView(true);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  const data = useMemo(
    () => buildData(pref, areas, mapping),
    [pref, areas, mapping],
  );
  const differs = data.cities
    .filter((c) => c.differs)
    .sort((a, b) => b.distanceKm - a.distanceKm);

  return (
    <section
      ref={hostRef}
      className="mt-10 overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-b from-stone-50 to-sky-50/40 shadow-sm"
      aria-label="地球儀の上の方位"
    >
      <header className="space-y-3 border-b border-stone-200/70 px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
          <Globe2 className="h-3.5 w-3.5" aria-hidden />
          地球儀で見る方位
        </p>
        <h2 className="font-serif text-lg font-bold text-stone-800">
          遠くの街の方位は、地図の直線ではなく大圏で決まります
        </h2>
        <p className="max-w-[70ch] text-xs leading-relaxed text-stone-600">
          {LEAD}
        </p>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="block">
            <span className="block font-bold text-stone-700">出発地</span>
            <select
              value={pref}
              onChange={(e) => setPref(e.target.value)}
              className="mt-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            >
              {PREFS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="方位の区分" className="flex gap-1">
            {(
              [
                ["traditional", "伝統（30°・60°）"],
                ["physical", "均等（45°）"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mapping === m}
                onClick={() => setMapping(m)}
                className={`rounded-full border px-2.5 py-1 font-semibold ${
                  mapping === m
                    ? "border-stone-800 bg-stone-800 text-white"
                    : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="見せ方" className="flex gap-1">
            {webgl && (
              <button
                type="button"
                aria-pressed={view === "3d"}
                onClick={() => setView("3d")}
                className={`rounded-full border px-2.5 py-1 font-semibold ${
                  view === "3d"
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                地球儀
              </button>
            )}
            <button
              type="button"
              aria-pressed={view === "flat"}
              onClick={() => setView("flat")}
              className={`rounded-full border px-2.5 py-1 font-semibold ${
                view === "flat"
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              平面
            </button>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600">
          {COMPASS_DIRECTIONS.map((d) => (
            <li key={d} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: DIRECTION_COLOR[d] }}
                aria-hidden
              />
              {DIRECTION_LABELS[d]}
            </li>
          ))}
        </ul>
      </header>

      {view === "3d" && inView ? (
        <GlobeScene data={data} reducedMotion={reducedMotion} />
      ) : (
        <div className="bg-slate-900 p-4">
          <FlatGlobe data={data} />
        </div>
      )}

      <div className="space-y-2 border-t border-stone-200/70 px-5 py-4 text-sm text-stone-700">
        <p data-testid="globe-summary">
          {`${pref}から見ると、一覧の ${data.cities.length} エリアのうち ${differs.length} エリアが、地図に直線を引くと隣の方位に見えます。`}
        </p>
        {differs.length > 0 && (
          <ul className="grid gap-1 text-xs sm:grid-cols-2 xl:grid-cols-3">
            {differs.slice(0, 12).map((c) => (
              <li key={c.code}>
                {`${c.name}（約 ${Math.round(c.distanceKm)} km）: 判定は${DIRECTION_LABELS[c.direction]}、地図の直線では${DIRECTION_LABELS[c.mapDirection]}`}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-stone-500">{RING_NOTE}</p>
      </div>
    </section>
  );
}
