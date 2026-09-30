"use client";

/**
 * 八宅の間取り（立体と平面）。本命卦の 8 方位を家の床に塗り、記事の
 * 当て方で家具を 1 通り置いてみせる。
 *
 * **このサイトの判定ではない。**間取りのデータを持っていないので、
 * 例として置くだけ（画面にもそう書く）。中身は fengShuiRoomModel が
 * 決め、ここは見せ方だけ。
 *
 * 立体（FengShuiRoomScene、three.js）は節が画面に入ったときだけ読む。
 * WebGL が無い端末と「平面」では、同じ中身を SVG で描く。
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bath, BedDouble, BookOpen, Flame, Home } from "lucide-react";
import {
  buildRoomModel,
  distanceToEdge,
  type RoomItem,
  type RoomModel,
} from "@/lib/fengShuiRoomModel";
import type { RoomSelection } from "@/components/houi/FengShuiRoomScene";
import { supportsWebGL } from "@/lib/webglSupport";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import type { FengShuiReading } from "@/utils/fengShuiEngine";

const FengShuiRoomScene = dynamic(
  () => import("@/components/houi/FengShuiRoomScene"),
  {
    ssr: false,
    loading: () => (
      <p className="p-6 text-sm text-stone-500">間取りを読み込んでいます…</p>
    ),
  },
);

const ARTICLE = "/blog/feng-shui-where-to-put-things-in-a-room";

const LEAD =
  "家の中心（太極）から見て 45 度ずつの 8 区画に、あなたの本命卦の吉凶を塗りました。家具は記事で紹介した当て方で、例として 1 通り置いています。区画や家具を押すと内訳が出ます。";

const NOT_A_VERDICT =
  "例として置いたもので、このサイトの判定ではありません（間取りのデータは持っていません）。家の中心の取り方、磁北で測るか真北で測るか、どの吉を選ぶかは流派によって説明が分かれます。";

/** 平面の図に書く 1 字 */
const ITEM_GLYPH: Record<RoomItem["kind"], string> = {
  bed: "寝",
  desk: "机",
  stove: "火",
  bath: "水",
};

const ITEM_ICON = {
  bed: BedDouble,
  desk: BookOpen,
  stove: Flame,
  bath: Bath,
} as const;

function describeItem(item: RoomItem): string {
  const at = `${DIRECTION_LABELS[item.sector]}（${item.sectorYouxing}）の区画`;
  if (!item.facing) return `${at}に置く`;
  const verb =
    item.kind === "bed" ? "頭" : item.kind === "desk" ? "顔" : "焚き口";
  return `${at}に置き、${verb}を${DIRECTION_LABELS[item.facing]}（${item.facingYouxing}）へ`;
}

/** 上から見た平面の間取り。立体と同じ中身 */
export function FlatRoom({
  model,
  selection,
  onSelect,
}: {
  model: RoomModel;
  selection: RoomSelection | null;
  onSelect: (s: RoomSelection) => void;
}) {
  const h = model.half;
  const S = 400 / (2 * h);
  // 床の x, z → SVG。上が北（−z）、右が東（+x）
  const px = (x: number) => (x + h) * S;
  const pz = (z: number) => (z + h) * S;
  return (
    <svg
      viewBox="-8 -18 416 426"
      className="mx-auto h-auto w-full max-w-[460px]"
      role="img"
      aria-label="八宅の区画を塗った家の間取りを上から見た図。上が北"
    >
      <rect x={0} y={0} width={400} height={400} fill="#c4a076" />
      {model.sectors.map((s) => (
        <polygon
          key={s.direction}
          data-direction={s.direction}
          points={s.polygon.map(([x, z]) => `${px(x)},${pz(z)}`).join(" ")}
          fill={s.auspicious ? "#10b981" : "#e11d48"}
          fillOpacity={
            selection?.type === "sector" && selection.direction === s.direction
              ? 0.6
              : 0.32
          }
          stroke="#3f2a18"
          strokeDasharray="6 4"
          strokeWidth={1.2}
          onClick={() => onSelect({ type: "sector", direction: s.direction })}
          className="cursor-pointer"
        />
      ))}
      {model.sectors.map((s) => {
        // 区画の中心線の上で、縁の少し手前（家具は中ほどに置いてある）
        const midDeg = (s.startDeg + s.endDeg) / 2;
        const mid = midDeg * (Math.PI / 180);
        const r = distanceToEdge(midDeg, h) - 0.75;
        const x = Math.min(Math.max(px(Math.sin(mid) * r), 34), 366);
        const y = Math.min(Math.max(pz(-Math.cos(mid) * r), 14), 386);
        return (
          <text
            key={`t-${s.direction}`}
            x={x}
            y={y}
            textAnchor="middle"
            fontSize={11}
            fontWeight={800}
            fill={s.auspicious ? "#065f46" : "#9f1239"}
            pointerEvents="none"
          >
            {s.label}・{s.youxing}
          </text>
        );
      })}
      {model.items.map((it) => {
        const deg = it.facingDeg;
        const selected =
          selection?.type === "item" && selection.kind === it.kind;
        return (
          <g
            key={it.kind}
            data-item={it.kind}
            transform={`translate(${px(it.x)} ${pz(it.z)}) rotate(${deg})`}
            onClick={() => onSelect({ type: "item", kind: it.kind })}
            className="cursor-pointer"
          >
            <rect
              x={(-it.w * S) / 2}
              y={(-it.d * S) / 2}
              width={it.w * S}
              height={it.d * S}
              rx={4}
              fill="#fafaf9"
              stroke={selected ? "#b45309" : "#44403c"}
              strokeWidth={selected ? 3 : 1.5}
            />
            {it.facing && (
              <path
                d={`M 0 ${(-it.d * S) / 2 - 4} l -7 0 l 7 -14 l 7 14 z`}
                fill="#d4a017"
              />
            )}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fontWeight={800}
              fill="#292524"
              transform={`rotate(${-deg})`}
            >
              {ITEM_GLYPH[it.kind]}
            </text>
          </g>
        );
      })}
      <circle cx={px(0)} cy={pz(0)} r={13} fill="#1c1917" />
      <text
        x={px(0)}
        y={pz(0)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fontWeight={800}
        fill="#fef3c7"
      >
        太極
      </text>
      <text
        x={200}
        y={-5}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="#44403c"
      >
        北
      </text>
    </svg>
  );
}

export function FengShuiRoom({ reading }: { reading: FengShuiReading }) {
  const model = useMemo(() => buildRoomModel(reading), [reading]);
  const [selection, setSelection] = useState<RoomSelection | null>(null);
  const [webgl] = useState(supportsWebGL);
  const [view, setView] = useState<"3d" | "flat">(webgl ? "3d" : "flat");
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

  const selectedSector =
    selection?.type === "sector"
      ? model.sectors.find((s) => s.direction === selection.direction)
      : null;
  const selectedItem =
    selection?.type === "item"
      ? model.items.find((i) => i.kind === selection.kind)
      : null;

  return (
    <section
      ref={hostRef}
      className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-b from-stone-50 to-amber-50/40 shadow-sm"
      aria-label="八宅の間取り"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200/70 px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
            <Home className="h-3.5 w-3.5" aria-hidden />
            八宅の間取り
          </p>
          <h3 className="mt-1 text-lg font-bold text-stone-800">
            {reading.guaName}命の家に、置き場所と向きを当ててみる
          </h3>
          <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-stone-600">
            {LEAD}
          </p>
        </div>
        <div role="group" aria-label="見せ方" className="flex gap-1 text-xs">
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
      </header>

      {view === "3d" && inView ? (
        <FengShuiRoomScene
          model={model}
          selection={selection}
          onSelect={setSelection}
          reducedMotion={reducedMotion}
        />
      ) : (
        <div className="p-4">
          <FlatRoom
            model={model}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      )}

      <div className="space-y-3 border-t border-stone-200/70 px-5 py-4 text-sm">
        {selectedSector && (
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <p className="flex items-center gap-2 font-bold text-stone-800">
              {selectedSector.label}の区画
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${
                  selectedSector.auspicious ? "bg-emerald-700" : "bg-rose-700"
                }`}
              >
                {selectedSector.auspicious ? "吉" : "凶"}
              </span>
              <span className="text-xs text-stone-700">
                {selectedSector.youxing}
              </span>
            </p>
            <p className="mt-1 text-xs text-stone-600">
              {selectedSector.meaning}
            </p>
          </div>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {model.items.map((it) => {
            const Icon = ITEM_ICON[it.kind];
            return (
              <li key={it.kind}>
                <button
                  type="button"
                  onClick={() => setSelection({ type: "item", kind: it.kind })}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    selectedItem?.kind === it.kind
                      ? "border-amber-500 bg-amber-50"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-bold text-stone-800">
                    <Icon className="h-4 w-4 text-stone-500" aria-hidden />
                    {it.name}
                  </span>
                  <span className="mt-1 block text-xs text-stone-700">
                    {describeItem(it)}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    {it.rule}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {NOT_A_VERDICT}{" "}
          <Link href={ARTICLE} className="font-semibold underline">
            当て方の説明（記事）
          </Link>
        </p>
      </div>
    </section>
  );
}
