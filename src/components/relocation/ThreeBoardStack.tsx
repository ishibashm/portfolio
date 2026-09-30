"use client";

/**
 * 三盤の方位盤（/calendar。利用者の依頼、2026-09-30「三盤の方位盤から作って、
 * 精度は両方で」）。
 *
 * 年盤・月盤・日盤を重ねて見せ、3 枚とも吉の方位（段階 S＝三盤吉）が
 * 縦に揃うことを目で見せる。判定は API（auspicious-days?mode=board）が
 * 判定エンジンの 1 回の計算から返したものをそのまま描く。
 *
 * - 立体（ThreeBoardScene、three.js）は画面に入ったときだけ読み込む
 * - WebGL が使えない端末・「平面」を選んだときは、上から見た平面の盤
 *   （同じ中身を同心の輪で描く）
 * - 扇形を押すと、その方位の年・月・日の内訳と段階を下に出す
 * - 表でも同じ中身を出す（読み上げ・印刷・比べ読み用）
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import {
  STAR_NAMES,
  buildThreeBoardModel,
  isBoardResponse,
  type BoardResponse,
  type SectorKind,
  type ThreeBoardModel,
} from "@/lib/threeBoardModel";
import {
  canvasAngleOfBearing,
  screenBearing,
  type BoardOrientation,
} from "@/lib/threeBoardCanvas";
import type { CompassDirection, NodeMapping } from "@/utils/directionGeo";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";
import { supportsWebGL } from "@/lib/webglSupport";

const ThreeBoardScene = dynamic(() => import("./ThreeBoardScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center text-sm text-stone-500 md:h-[520px]">
      立体の盤を読み込んでいます…
    </div>
  ),
});

export interface ThreeBoardStackProps {
  birthDate: string;
  lon: string;
  tenchusatsuMode: string;
  /** 見せる日（YYYY-MM-DD）。日取りの表の「盤」からも切り替える */
  date: string;
  onDateChange: (date: string) => void;
}

const KIND_FILL: Record<SectorKind, string> = {
  good: "#10b981",
  neutral: "#a8a29e",
  bad: "#dc2626",
};

const DAY_BLOCKED_NOTE =
  "この日は天中殺にあたり、いまの扱いでは動かない日です（日の一覧で「不可」と出る日）。三盤吉の方位があっても、この日には選べません。";

const ORIENTATION_KEY = "threeBoard.orientation";

function readOrientation(): BoardOrientation {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === "south"
      ? "south"
      : "north";
  } catch {
    return "north";
  }
}

const ORIENTATION_NOTE: Record<BoardOrientation, string> = {
  north:
    "北を上（立体では奥）に置いています。地図と同じ向きです。気学の本の方位盤に合わせるなら「南を上」にしてください。",
  south:
    "南を上（立体では奥）に置いています。気学の本の方位盤と同じ向きで、東が左・西が右になります。地図と比べるときは「北を上」に戻してください。",
};

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 上から見た平面の盤。内側から日盤・月盤・年盤、外周に段階の輪 */
export function FlatBoard({
  model,
  selected,
  onSelect,
  orientation = "north",
}: {
  model: ThreeBoardModel;
  selected: CompassDirection | null;
  onSelect: (d: CompassDirection) => void;
  orientation?: BoardOrientation;
}) {
  const C = 200;
  // 立体と同じ並び（下の年盤ほど大きい）を上から見たときの輪
  const rings: [number, number][] = [
    [148, 178], // 年盤
    [110, 146], // 月盤
    [66, 108], // 日盤
  ];
  const arc = (r0: number, r1: number, a: number, b: number) => {
    const p = (r: number, deg: number) => {
      const t = canvasAngleOfBearing(screenBearing(deg, orientation));
      return `${C + Math.cos(t) * r} ${C + Math.sin(t) * r}`;
    };
    const large = b - a > 180 ? 1 : 0;
    return `M ${p(r1, a)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, b)} L ${p(r0, b)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a)} Z`;
  };
  const label = (r: number, deg: number) => {
    const t = canvasAngleOfBearing(screenBearing(deg, orientation));
    return [C + Math.cos(t) * r, C + Math.sin(t) * r] as const;
  };
  return (
    <svg
      viewBox="0 -18 400 418"
      className="mx-auto h-auto w-full max-w-[420px]"
      role="img"
      aria-label="年盤・月盤・日盤を上から見た平面の方位盤（外側から年盤・月盤・日盤、いちばん外が段階）"
    >
      {model.columns.map((col) => (
        <path
          key={`t-${col.direction}`}
          d={arc(180, 196, col.startDeg, col.endDeg)}
          fill={col.color}
          stroke="#fff"
          strokeWidth={1.5}
          onClick={() => onSelect(col.direction)}
          className="cursor-pointer"
        />
      ))}
      {model.columns.map((col) => {
        const [x, y] = label(188, (col.startDeg + col.endDeg) / 2);
        return (
          <text
            key={`tl-${col.direction}`}
            data-direction={col.direction}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={800}
            fill="#0c0a09"
            pointerEvents="none"
          >
            {col.tier}
          </text>
        );
      })}
      {model.discs.map((disc, i) =>
        disc.sectors.map((s) => {
          const [x, y] = label(
            (rings[i][0] + rings[i][1]) / 2,
            (s.startDeg + s.endDeg) / 2,
          );
          return (
            <g
              key={`${disc.layer}-${s.direction}`}
              onClick={() => onSelect(s.direction)}
              className="cursor-pointer"
            >
              <path
                d={arc(rings[i][0], rings[i][1], s.startDeg, s.endDeg)}
                fill={KIND_FILL[s.kind]}
                fillOpacity={s.direction === selected ? 1 : 0.78}
                stroke="#fff"
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={700}
                fill="#fff"
              >
                {s.star}
              </text>
            </g>
          );
        }),
      )}
      <circle cx={C} cy={C} r={62} fill="#292524" />
      <text x={C} y={C - 16} textAnchor="middle" fontSize={11} fill="#e3c27a">
        中宮
      </text>
      <text
        x={C}
        y={C + 6}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#fff"
      >
        {model.discs.map((d) => d.center).join("・")}
      </text>
      <text x={C} y={C + 24} textAnchor="middle" fontSize={9} fill="#d6d3d1">
        年・月・日
      </text>
      <text
        x={C}
        y={-7}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#44403c"
      >
        {orientation === "south" ? "南" : "北"}
      </text>
    </svg>
  );
}

export default function ThreeBoardStack({
  birthDate,
  lon,
  tenchusatsuMode,
  date,
  onDateChange,
}: ThreeBoardStackProps) {
  const [mapping, setMapping] = useState<NodeMapping>("traditional");
  const [spread, setSpread] = useState(true);
  // 向きは端末ごとに覚える（気学の本に合わせて南を上で見る人が多い）
  const [orientation, setOrientationState] =
    useState<BoardOrientation>(readOrientation);
  const setOrientation = (o: BoardOrientation) => {
    setOrientationState(o);
    try {
      localStorage.setItem(ORIENTATION_KEY, o);
    } catch {
      // 保存できない端末でも、この画面の中では切り替わる
    }
  };
  const [selected, setSelected] = useState<CompassDirection | null>(null);
  const [webgl] = useState(supportsWebGL);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [view, setView] = useState<"3d" | "flat">(webgl ? "3d" : "flat");
  const [result, setResult] = useState<{
    key: string;
    data?: BoardResponse;
    error?: string;
  } | null>(null);

  // 立体は画面に入ったときだけ読み込む（three.js を初回に載せない）
  const hostRef = useRef<HTMLDivElement>(null);
  // IntersectionObserver が無い環境では、見えているものとして扱う
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

  const key = `${birthDate}|${lon}|${tenchusatsuMode}|${date}`;
  useEffect(() => {
    // 盤の計算は、節が画面に入ってから頼む（下まで見ない人のぶんを省く）
    if (!inView || !birthDate || !lon) return;
    const q = new URLSearchParams({
      mode: "board",
      date,
      birthDate,
      lon,
      tenchusatsuMode,
    });
    let alive = true;
    fetch(`/api/relocation/auspicious-days?${q.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        // 形の違う応答（盤の口を持たない古いサーバーなど）は読めないものとして扱う
        if (!res.ok || !isBoardResponse(body))
          setResult({ key, error: "盤を読み込めませんでした。" });
        else setResult({ key, data: body });
      })
      .catch(() => {
        if (alive) setResult({ key, error: "通信できませんでした。" });
      });
    return () => {
      alive = false;
    };
  }, [inView, key, birthDate, lon, tenchusatsuMode, date]);

  const current = result?.key === key ? result : null;
  const model = useMemo(
    () => (current?.data ? buildThreeBoardModel(current.data, mapping) : null),
    [current, mapping],
  );
  const selectedCol = model?.columns.find((c) => c.direction === selected);
  const aligned = model?.columns.filter((c) => c.aligned) ?? [];
  // 天中殺で動かない扱いは日の単位（8 方位とも同じ）なので、方位ごとに
  // 塗らず 1 か所で言う
  const dayBlocked = model?.columns.some((c) => c.blocked) ?? false;

  return (
    <section
      ref={hostRef}
      className="overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-b from-stone-50 to-amber-50/40 shadow-sm"
      aria-label="三盤の方位盤"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200/70 px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
            <Layers className="h-3.5 w-3.5" aria-hidden />
            三盤の方位盤
          </p>
          <h3 className="mt-1 text-lg font-bold text-stone-800">
            年盤・月盤・日盤を重ねて見る
          </h3>
          <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-stone-600">
            下から年盤・月盤・日盤。緑は吉、赤は凶、灰は平です。3
            枚とも吉の方位（三盤吉）は光の柱で貫かれ、台座の輪にその日の段階（S〜X）が出ます。扇形を押すと内訳を下に出します。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center rounded-full border border-stone-300 bg-white">
            <button
              type="button"
              aria-label="前の日"
              onClick={() => onDateChange(shiftDate(date, -1))}
              className="rounded-l-full px-2 py-1.5 hover:bg-stone-100"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <input
              type="date"
              aria-label="盤の日付"
              value={date}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="border-x border-stone-200 bg-transparent px-2 py-1 font-semibold text-stone-800"
            />
            <button
              type="button"
              aria-label="次の日"
              onClick={() => onDateChange(shiftDate(date, 1))}
              className="rounded-r-full px-2 py-1.5 hover:bg-stone-100"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
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
          <div role="group" aria-label="盤の向き" className="flex gap-1">
            {(
              [
                ["north", "北を上"],
                ["south", "南を上"],
              ] as const
            ).map(([o, label]) => (
              <button
                key={o}
                type="button"
                aria-pressed={orientation === o}
                onClick={() => setOrientation(o)}
                className={`rounded-full border px-2.5 py-1 font-semibold ${
                  orientation === o
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
            {view === "3d" && (
              <button
                type="button"
                aria-pressed={spread}
                onClick={() => setSpread((s) => !s)}
                className="rounded-full border border-stone-300 bg-white px-2.5 py-1 font-semibold text-stone-700"
              >
                {spread ? "重ねる" : "離す"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="relative">
        {!birthDate || !lon ? (
          <p className="p-6 text-sm text-stone-600">
            生年月日と現住地を入れると、その人の盤が出ます。
          </p>
        ) : current?.error ? (
          <p role="alert" className="p-6 text-sm text-rose-700">
            {current.error}
          </p>
        ) : !model ? (
          <p role="status" className="p-6 text-sm text-stone-500">
            盤を読み込んでいます…
          </p>
        ) : view === "3d" && inView ? (
          <ThreeBoardScene
            model={model}
            selected={selected}
            onSelect={setSelected}
            spread={spread}
            orientation={orientation}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div className="p-4">
            <FlatBoard
              model={model}
              selected={selected}
              onSelect={setSelected}
              orientation={orientation}
            />
          </div>
        )}
      </div>

      {model && (
        <div className="space-y-3 border-t border-stone-200/70 px-5 py-4">
          <p className="text-sm text-stone-700">
            {model.date} の三盤吉（S）:{" "}
            <b>
              {aligned.length > 0
                ? aligned.map((c) => c.label).join("・")
                : "なし"}
            </b>
          </p>
          {dayBlocked && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {DAY_BLOCKED_NOTE}
            </p>
          )}

          {selectedCol && (
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-stone-800">
                {selectedCol.label}
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    selectedCol.tier ? TIER_BADGE_CLASS[selectedCol.tier] : ""
                  }`}
                >
                  {selectedCol.tierLabel}
                </span>
                {selectedCol.blocked && (
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    天中殺
                  </span>
                )}
                {selectedCol.doyouSatsu && (
                  <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                    土用殺
                  </span>
                )}
              </p>
              <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                {model.discs.map((disc) => {
                  const s = disc.sectors.find(
                    (x) => x.direction === selectedCol.direction,
                  )!;
                  return (
                    <li
                      key={disc.layer}
                      className="rounded-xl border border-stone-200 px-3 py-2"
                    >
                      <span className="text-stone-500">{disc.name}</span>{" "}
                      <b className="text-stone-800">{STAR_NAMES[s.star]}</b>
                      <span
                        className={`ml-2 font-bold ${
                          s.kind === "good"
                            ? "text-emerald-700"
                            : s.kind === "bad"
                              ? "text-rose-700"
                              : "text-stone-500"
                        }`}
                      >
                        {s.statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-stone-600">
              表で見る
            </summary>
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="py-1 font-semibold">方位</th>
                  {model.discs.map((d) => (
                    <th key={d.layer} className="py-1 font-semibold">
                      {d.name}（中宮 {STAR_NAMES[d.center]}）
                    </th>
                  ))}
                  <th className="py-1 font-semibold">段階</th>
                </tr>
              </thead>
              <tbody>
                {model.columns.map((col) => (
                  <tr key={col.direction} className="border-t border-stone-100">
                    <td className="py-1 font-semibold">{col.label}</td>
                    {model.discs.map((d) => {
                      const s = d.sectors.find(
                        (x) => x.direction === col.direction,
                      )!;
                      return (
                        <td key={d.layer} className="py-1">
                          {STAR_NAMES[s.star]} {s.statusLabel}
                        </td>
                      );
                    })}
                    <td className="py-1 font-semibold">{col.tierLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className="text-xs text-stone-500">
            {ORIENTATION_NOTE[orientation]}
          </p>
        </div>
      )}
    </section>
  );
}
