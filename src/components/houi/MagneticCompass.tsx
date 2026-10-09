"use client";

/**
 * 羅盤（真北と磁北）の節。出発地と、あれば目的地を県で選ぶと、その土地の
 * 偏角で磁針を回し、真北で見た方位と方位磁針で測った方位を並べる。
 *
 * このサイトの判定は真北。磁北は「方位磁針で測るとずれる」注意として
 * だけ出す（CLAUDE.md 3 節）。角度は compassModel、偏角は
 * geomagneticModel（サーバーと同じ計算）。**入力はどこにも送らない**
 * （県を選ぶだけで、計算はこの端末の中）。
 *
 * 立体（CompassScene、three.js）は節が画面に入ったときだけ読む。WebGL が
 * 無い端末と「平面」では、同じ中身を SVG で描く。
 */

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Compass } from "lucide-react";
import {
  buildCompassModel,
  declinationText,
  type CompassModel,
} from "@/lib/compassModel";
import { canvasAngleOfBearing } from "@/lib/threeBoardCanvas";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { geomagneticAt } from "@/utils/geomagneticModel";
import { supportsWebGL } from "@/lib/webglSupport";
import { DIRECTION_LABELS, type NodeMapping } from "@/utils/directionGeo";

const CompassScene = dynamic(() => import("@/components/houi/CompassScene"), {
  ssr: false,
  loading: () => (
    <p className="p-6 text-sm text-stone-500">羅盤を読み込んでいます…</p>
  ),
});

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const PREFS = Object.keys(PREFECTURE_CENTERS);

const LEAD =
  "このサイトの方位は、地図と同じ真北で判定しています。方位磁針の北（磁北）は真北から少しずれていて、ずれの大きさ（偏角）は土地によって違います。境目の近くにある目的地は、方位磁針で測ると隣の方位に見えることがあります。";

const HOW_TO_READ =
  "金の指標が真北、朱の針先が磁北です。朱の点線は、方位磁針で測ったときに見える境目です。実線（真北の境目）とのあいだの帯にある目的地は、測り方で方位が変わります。";

const PLACE_NOTE =
  "地点は県の中心（面積の重心）です。偏角は世界磁気モデル（WMM）で求めた目安で、実際の方位磁針は近くの鉄や電気でも振れます。選んだ県はこの端末の中で計算するだけで、送信しません。";

/** 上から見た平面の羅盤。立体と同じ中身 */
export function FlatCompass({ model }: { model: CompassModel }) {
  const C = 200;
  const pt = (r: number, deg: number) => {
    const t = canvasAngleOfBearing(deg);
    return [C + Math.cos(t) * r, C + Math.sin(t) * r] as const;
  };
  const line = (r0: number, r1: number, deg: number) => {
    const [x0, y0] = pt(r0, deg);
    const [x1, y1] = pt(r1, deg);
    return { x1: x0, y1: y0, x2: x1, y2: y1 };
  };
  return (
    <svg
      viewBox="0 0 400 400"
      className="mx-auto h-auto w-full max-w-[420px]"
      role="img"
      aria-label="真北に合わせた羅盤を上から見た図。上が真北"
    >
      <circle cx={C} cy={C} r={196} fill="#6b3a1f" />
      <circle cx={C} cy={C} r={182} fill="#f3e6c8" />
      {model.sectors.map((s) => {
        const [x, y] = pt(120, (s.startDeg + s.endDeg) / 2);
        return (
          <g key={s.direction}>
            <line
              {...line(60, 168, s.startDeg)}
              stroke="#3b2414"
              strokeWidth={2}
              data-edge={s.direction}
              data-deg={s.startDeg}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fontWeight={800}
              fill="#2a1a0e"
            >
              {s.label}
            </text>
          </g>
        );
      })}
      {Math.abs(model.declination) > 0.05 &&
        model.sectors.map((s) => (
          <line
            key={`m-${s.direction}`}
            {...line(60, 160, s.magStartDeg)}
            stroke="#be281e"
            strokeWidth={2}
            strokeDasharray="6 4"
            data-mag-edge={s.direction}
          />
        ))}
      {model.target && (
        <line
          {...line(0, 176, model.target.trueBearing)}
          stroke="#d4a54a"
          strokeWidth={3}
          data-target
        />
      )}
      {/* 磁針 */}
      <line
        {...line(0, 70, model.needleDeg)}
        stroke="#b91c1c"
        strokeWidth={6}
        strokeLinecap="round"
        data-needle
      />
      <line
        {...line(0, 70, model.needleDeg + 180)}
        stroke="#1e3a8a"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <circle cx={C} cy={C} r={8} fill="#d4a54a" />
      {/* 真北の指標 */}
      <path d={`M ${C} 20 l -8 -14 l 16 0 z`} fill="#d4a54a" />
      <text
        x={C}
        y={34}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="#3b2414"
      >
        真北
      </text>
    </svg>
  );
}

export function MagneticCompass() {
  const [from, setFrom] = useState("東京都");
  const [to, setTo] = useState("");
  const [mapping, setMapping] = useState<NodeMapping>("traditional");
  // サーバーと初回描画は平面に揃え、接続後に端末の立体表示対応を調べる。
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const webgl = useMemo(() => hydrated && supportsWebGL(), [hydrated]);
  const [selectedView, setView] = useState<"3d" | "flat" | null>(null);
  const view = selectedView ?? (webgl ? "3d" : "flat");
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  // 立体は画面に入ったときだけ読み込む（three.js を初回に載せない）
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

  const model = useMemo(() => {
    const o = PREFECTURE_CENTERS[from];
    const t = to ? PREFECTURE_CENTERS[to] : null;
    const decl = geomagneticAt(o.lat, o.lon)?.declination ?? null;
    return buildCompassModel(
      { name: from, ...o },
      decl,
      t ? { name: to, ...t } : null,
      mapping,
    );
  }, [from, to, mapping]);

  const t = model.target;

  return (
    <section
      ref={hostRef}
      className="mt-4 overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-b from-stone-50 to-amber-50/40 shadow-sm"
      aria-label="羅盤（真北と磁北）"
    >
      <header className="space-y-3 border-b border-stone-200/70 px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
          <Compass className="h-3.5 w-3.5" aria-hidden />
          羅盤
        </p>
        <p className="max-w-[70ch] text-xs leading-relaxed text-stone-600">
          {LEAD}
        </p>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="block">
            <span className="block font-bold text-stone-700">出発地</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            >
              {PREFS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block font-bold text-stone-700">
              目的地（任意）
            </span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            >
              <option value="">選ばない</option>
              {PREFS.filter((p) => p !== from).map((p) => (
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
                立体
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
      </header>

      {view === "3d" && inView ? (
        <CompassScene model={model} reducedMotion={reducedMotion} />
      ) : (
        <div className="p-4">
          <FlatCompass model={model} />
        </div>
      )}

      <div className="space-y-2 border-t border-stone-200/70 px-5 py-4 text-sm text-stone-700">
        <p data-testid="declination">
          {model.declinationKnown
            ? `${from}では、磁北は真北から${declinationText(model.declination)}ずれています。`
            : `${from}の偏角を求められなかったので、ずれ 0 として描いています。`}
        </p>
        {t && (
          <div
            className={`rounded-2xl border p-3 ${
              t.differs
                ? "border-amber-300 bg-amber-50"
                : "border-stone-200 bg-white"
            }`}
          >
            <p className="font-bold text-stone-800">
              {from} → {t.place.name}（約 {Math.round(t.distanceKm)} km）
            </p>
            <p className="mt-1 text-xs">
              {`真北で ${t.trueBearing.toFixed(1)}° → ${DIRECTION_LABELS[t.trueDirection]}（このサイトの判定）`}
            </p>
            <p className="mt-0.5 text-xs">
              {`方位磁針で測ると ${t.magneticBearing.toFixed(1)}° → ${DIRECTION_LABELS[t.magneticDirection]}`}
            </p>
            {t.differs && (
              <p className="mt-1 text-xs font-bold text-amber-800">
                {`方位磁針で測ると隣の方位（${DIRECTION_LABELS[t.magneticDirection]}）に見えます。判定は真北の${DIRECTION_LABELS[t.trueDirection]}です。`}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-stone-500">{HOW_TO_READ}</p>
        <p className="text-xs text-stone-500">{PLACE_NOTE}</p>
      </div>
    </section>
  );
}
