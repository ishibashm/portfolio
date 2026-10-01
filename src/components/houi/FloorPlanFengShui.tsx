"use client";

/**
 * 自分の間取りに八宅の 8 区画を当てる（描く画面）。
 *
 * 部屋を四角で描き、方位記号の向きを合わせると、太極（家の中心）から
 * 45 度ずつの区画に本命卦の吉凶を塗り、部屋ごとにどの区画が主かを出す。
 * 答えは floorPlanModel が出す。ここは描き方と見せ方だけ。
 *
 * **間取り図の画像は下敷きとして端末の中で表示するだけ。**送信も保存も
 * しない（object URL を <image> に渡すだけで、通信にも端末の保存領域
 * にも通さない。floorPlanFengShui.test がコードの字面で見張る）。描いた部屋も保存しない。CLAUDE.md 3 節「約束の範囲は
 * 入口の集合で決まる」— この画面に入れたものが出ていく入口は無い。
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LayoutDashboard } from "lucide-react";
import {
  EXAMPLE_ROOMS,
  ROOM_KIND_LABELS,
  SENSITIVITY_DEG,
  buildFloorPlan,
  type CenterMethod,
  type FloorPlanResult,
  type PlanRoom,
  type PlanRoomKind,
  type Point,
} from "@/lib/floorPlanModel";
import { supportsWebGL } from "@/lib/webglSupport";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import type { FengShuiReading } from "@/utils/fengShuiEngine";

/* 立体は three.js を値として引くので、「立体で見る」を押したときに読む */
const FloorPlanScene = dynamic(
  () => import("@/components/houi/FloorPlanScene"),
  {
    ssr: false,
    loading: () => (
      <p className="p-6 text-sm text-stone-500">模型を読み込んでいます…</p>
    ),
  },
);

/** 描く場所の広さ（単位は持たない。比だけが答えに効く） */
export const PLAN_W = 12;
export const PLAN_H = 10;
const SNAP = 0.1;
/** これより小さい四角は、押し間違いとして部屋にしない */
const MIN_SIDE = 0.4;

const ARTICLE = "/blog/feng-shui-where-to-put-things-in-a-room";

const LEAD =
  "部屋を四角で描き、間取り図の方位記号に合わせて北の向きを回すと、家の中心（太極）から 45 度ずつの 8 区画に本命卦の吉凶を塗り、部屋ごとにどの区画にあるかを出します。最初は例の間取りが入っています。";

const PRIVACY =
  "間取り図の画像は、この端末の画面に下敷きとして表示するだけです。送信も保存もしません。描いた部屋も保存しないので、頁を離れると消えます。";

const EXPORT_NOTE =
  "パースの家具は部屋の種類から置いた目安で、1 マスを 1 m として大きさを決めています。書き出した .glb はこの端末に保存されるだけで、送信しません。Blender などで開けます。";

const NOT_A_VERDICT =
  "八宅で一般に説明される当て方に照らしたもので、効果を保証するものではありません。家の中心の取り方、磁北で測るか真北で測るか、だれの本命卦で見るかは、流派によって説明が分かれます。";

const NORTH_NOTE = `間取り図の方位記号は、真北とは限りません（方位磁針の北や、おおよその向きのこともあります）。記号が ${SENSITIVITY_DEG} 度ずれると主な区画が変わる部屋には「境目が近い」と出します。`;

const CENTER_LABELS: Record<CenterMethod, string> = {
  centroid: "形の重心",
  bbox: "欠けを補った四角形の中心",
};

const AUSPICIOUS_FILL = "#10b981";
const INAUSPICIOUS_FILL = "#e11d48";

const snap = (v: number) => Math.round(v / SNAP) / Math.round(1 / SNAP);
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/** 例の間取りを描く場所の真ん中へ */
export function exampleRooms(): PlanRoom[] {
  const dx = (PLAN_W - 9) / 2;
  const dy = (PLAN_H - 7.2) / 2;
  return EXAMPLE_ROOMS.map((r) => ({
    ...r,
    x: snap(r.x + dx),
    y: snap(r.y + dy),
  }));
}

/** 中心から図の角度 deg の向きに進んで、描く場所の縁に当たるまでの長さ */
function rayToEdge(c: Point, deg: number): number {
  const r = (deg * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const ts: number[] = [];
  if (ux > 1e-9) ts.push((PLAN_W - c[0]) / ux);
  if (ux < -1e-9) ts.push(-c[0] / ux);
  if (uy > 1e-9) ts.push((PLAN_H - c[1]) / uy);
  if (uy < -1e-9) ts.push(-c[1] / uy);
  return Math.max(0, Math.min(...ts));
}

/* スマホの幅では、図の文字を大きくする（図ごと縮むので、そのままだと
   部屋名や方位が 6〜8px になって読めない） */
const NARROW = "(max-width: 640px)";
function subscribeNarrow(cb: () => void) {
  const m = window.matchMedia?.(NARROW);
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}
const narrowSnapshot = () => !!window.matchMedia?.(NARROW).matches;

const pts = (poly: Point[]) => poly.map(([x, y]) => `${x},${y}`).join(" ");

type Drag =
  | { type: "draw"; start: Point; now: Point }
  | { type: "move"; id: string; grab: Point; orig: PlanRoom }
  | { type: "resize"; id: string; orig: PlanRoom };

/** 上から見た間取り。描く・選ぶ・動かす */
export function FlatPlan({
  rooms,
  result,
  northArrowDeg,
  imageUrl,
  imageOpacity,
  selectedId,
  mode,
  onSelect,
  onAdd,
  onChange,
}: {
  rooms: PlanRoom[];
  result: FloorPlanResult | null;
  northArrowDeg: number;
  imageUrl: string | null;
  imageOpacity: number;
  selectedId: string | null;
  mode: "select" | "draw";
  onSelect: (id: string | null) => void;
  onAdd: (r: Omit<PlanRoom, "id" | "kind" | "name">) => void;
  onChange: (r: PlanRoom) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** 文字の倍率 */
  const k = useSyncExternalStore(subscribeNarrow, narrowSnapshot, () => false)
    ? 1.5
    : 1;

  const toPlan = (e: React.PointerEvent): Point | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM?.();
    if (!svg || !m) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return [clamp(q.x, 0, PLAN_W), clamp(q.y, 0, PLAN_H)];
  };

  const capture = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (mode !== "draw") {
      onSelect(null);
      return;
    }
    const p = toPlan(e);
    if (!p) return;
    capture(e);
    const s: Point = [snap(p[0]), snap(p[1])];
    setDrag({ type: "draw", start: s, now: s });
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPlan(e);
    if (!p) return;
    if (drag.type === "draw") {
      setDrag({ ...drag, now: [snap(p[0]), snap(p[1])] });
    } else if (drag.type === "move") {
      const o = drag.orig;
      onChange({
        ...o,
        x: snap(clamp(o.x + p[0] - drag.grab[0], 0, PLAN_W - o.w)),
        y: snap(clamp(o.y + p[1] - drag.grab[1], 0, PLAN_H - o.h)),
      });
    } else {
      const o = drag.orig;
      onChange({
        ...o,
        w: snap(Math.max(MIN_SIDE, p[0] - o.x)),
        h: snap(Math.max(MIN_SIDE, p[1] - o.y)),
      });
    }
  };

  const onUp = () => {
    if (drag?.type === "draw") {
      const [x1, y1] = drag.start;
      const [x2, y2] = drag.now;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w >= MIN_SIDE && h >= MIN_SIDE) {
        onAdd({
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: snap(w),
          h: snap(h),
        });
      }
    }
    setDrag(null);
  };

  const byId = new Map(result?.rooms.map((r) => [r.room.id, r]) ?? []);
  const grid: number[] = [];
  for (let i = 1; i < Math.max(PLAN_W, PLAN_H); i++) grid.push(i);

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.2 -1.3 ${PLAN_W + 0.4} ${PLAN_H + 1.5}`}
      className="mx-auto h-auto w-full max-w-[720px] select-none"
      style={{
        touchAction: mode === "draw" || selectedId ? "none" : "auto",
      }}
      role="img"
      aria-label="間取りを上から見た図。部屋に八宅の区画の吉凶を塗ってある"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
    >
      <rect
        data-bg
        x={0}
        y={0}
        width={PLAN_W}
        height={PLAN_H}
        fill="#fafaf9"
        stroke="#d6d3d1"
        strokeWidth={0.03}
        onPointerDown={onBackgroundDown}
        className={mode === "draw" ? "cursor-crosshair" : undefined}
      />
      {grid.map((i) => (
        <g key={i} pointerEvents="none" stroke="#e7e5e4" strokeWidth={0.015}>
          {i < PLAN_W && <line x1={i} y1={0} x2={i} y2={PLAN_H} />}
          {i < PLAN_H && <line x1={0} y1={i} x2={PLAN_W} y2={i} />}
        </g>
      ))}
      {imageUrl && (
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={PLAN_W}
          height={PLAN_H}
          preserveAspectRatio="xMidYMid meet"
          opacity={imageOpacity}
          pointerEvents="none"
        />
      )}

      {/* 部屋。区画で切った欠片を吉凶で塗る */}
      {rooms.map((room) => {
        const r = byId.get(room.id);
        const selected = room.id === selectedId;
        const fs = Math.min(0.36 * k, (room.w / 5.6) * k, (room.h / 2.6) * k);
        return (
          <g key={room.id} data-room={room.id}>
            {r?.shares.map((s) => (
              <polygon
                key={s.direction}
                data-direction={s.direction}
                points={pts(s.piece)}
                fill={s.auspicious ? AUSPICIOUS_FILL : INAUSPICIOUS_FILL}
                fillOpacity={0.3}
                pointerEvents="none"
              />
            ))}
            <rect
              x={room.x}
              y={room.y}
              width={room.w}
              height={room.h}
              fill="transparent"
              stroke={selected ? "#d97706" : "#44403c"}
              strokeWidth={selected ? 0.07 : 0.04}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(room.id);
                if (mode !== "select") return;
                const p = toPlan(e);
                if (!p) return;
                capture(e);
                setDrag({ type: "move", id: room.id, grab: p, orig: room });
              }}
            />
            {r && (
              <text
                x={room.x + room.w / 2}
                y={room.y + room.h / 2}
                textAnchor="middle"
                fontSize={fs}
                pointerEvents="none"
                fill="#1c1917"
              >
                <tspan x={room.x + room.w / 2} dy={-fs * 0.2} fontWeight={700}>
                  {room.name || ROOM_KIND_LABELS[room.kind]}
                </tspan>
                <tspan
                  x={room.x + room.w / 2}
                  dy={fs * 1.2}
                  fill={r.main.auspicious ? "#065f46" : "#9f1239"}
                >
                  {`${DIRECTION_LABELS[r.main.direction]}・${r.main.youxing}`}
                </tspan>
              </text>
            )}
            {selected && mode === "select" && (
              <rect
                data-handle
                x={room.x + room.w - 0.18}
                y={room.y + room.h - 0.18}
                width={0.36}
                height={0.36}
                fill="#d97706"
                className="cursor-nwse-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  capture(e);
                  setDrag({ type: "resize", id: room.id, orig: room });
                }}
              />
            )}
          </g>
        );
      })}

      {/* 区画の境目と名前 */}
      {result && (
        <g pointerEvents="none">
          {result.sectors.map((s) => {
            const c = result.center;
            const a = (s.startPlanDeg * Math.PI) / 180;
            const t = rayToEdge(c, s.startPlanDeg);
            const midDeg = (s.startPlanDeg + s.endPlanDeg) / 2;
            const m = (midDeg * Math.PI) / 180;
            const lt = rayToEdge(c, midDeg) * 0.88;
            const lx = clamp(
              c[0] + Math.sin(m) * lt,
              0.7 * k,
              PLAN_W - 0.7 * k,
            );
            const ly = clamp(
              c[1] - Math.cos(m) * lt,
              0.3 * k,
              PLAN_H - 0.3 * k,
            );
            return (
              <g key={s.direction} data-sector={s.direction}>
                <line
                  x1={c[0]}
                  y1={c[1]}
                  x2={c[0] + Math.sin(a) * t}
                  y2={c[1] - Math.cos(a) * t}
                  stroke="#292524"
                  strokeWidth={0.035}
                  strokeDasharray="0.18 0.12"
                />
                <rect
                  x={lx - 0.62 * k}
                  y={ly - 0.22 * k}
                  width={1.24 * k}
                  height={0.44 * k}
                  rx={0.1}
                  fill="#fffbeb"
                  fillOpacity={0.92}
                  stroke={s.auspicious ? AUSPICIOUS_FILL : INAUSPICIOUS_FILL}
                  strokeWidth={0.03}
                />
                <text
                  x={lx}
                  y={ly + 0.1 * k}
                  textAnchor="middle"
                  fontSize={0.27 * k}
                  fontWeight={700}
                  fill={s.auspicious ? "#065f46" : "#9f1239"}
                >
                  {`${s.label} ${s.youxing}`}
                </text>
              </g>
            );
          })}
          <circle
            cx={result.otherCenter[0]}
            cy={result.otherCenter[1]}
            r={0.12}
            fill="none"
            stroke="#57534e"
            strokeWidth={0.03}
            strokeDasharray="0.06 0.05"
          />
          <circle
            data-center
            cx={result.center[0]}
            cy={result.center[1]}
            r={0.2}
            fill="#1c1917"
          />
          <text
            x={result.center[0]}
            y={result.center[1] - 0.3}
            textAnchor="middle"
            fontSize={0.26 * k}
            fontWeight={800}
            fill="#1c1917"
          >
            太極
          </text>
        </g>
      )}

      {/* 方位記号 */}
      <g
        transform={`translate(${PLAN_W - 0.55} -0.65) rotate(${northArrowDeg})`}
        pointerEvents="none"
        data-north={northArrowDeg}
      >
        <circle r={0.5} fill="#ffffff" stroke="#44403c" strokeWidth={0.03} />
        <polygon points="0,-0.45 0.16,0.1 0,0 -0.16,0.1" fill="#b91c1c" />
        <polygon points="0,0.45 0.16,0.1 0,0 -0.16,0.1" fill="#a8a29e" />
      </g>
      <text
        x={PLAN_W - 1.2}
        y={-0.55}
        textAnchor="end"
        fontSize={0.24 * k}
        fontWeight={700}
        fill="#44403c"
        pointerEvents="none"
      >
        方位記号（北）
      </text>

      {drag?.type === "draw" && (
        <rect
          x={Math.min(drag.start[0], drag.now[0])}
          y={Math.min(drag.start[1], drag.now[1])}
          width={Math.abs(drag.now[0] - drag.start[0])}
          height={Math.abs(drag.now[1] - drag.start[1])}
          fill="#fbbf24"
          fillOpacity={0.25}
          stroke="#d97706"
          strokeWidth={0.04}
          strokeDasharray="0.12 0.08"
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-stone-600">
      {label}
      <input
        type="number"
        step={SNAP}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="mt-0.5 w-20 rounded-md border border-stone-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

export function FloorPlanFengShui({ reading }: { reading: FengShuiReading }) {
  const [rooms, setRooms] = useState<PlanRoom[]>(exampleRooms);
  const [northArrowDeg, setNorthArrowDeg] = useState(0);
  const [centerMethod, setCenterMethod] = useState<CenterMethod>("centroid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "draw">("select");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0.6);
  const [webgl] = useState(supportsWebGL);
  const [view, setView] = useState<"flat" | "3d">("flat");
  const [perspective, setPerspective] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<(() => Promise<Blob>) | null>(null);
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const nextId = useRef(1);

  // 下敷きの画像は object URL。差し替え・片付けのときに手放す
  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const result = useMemo(
    () => buildFloorPlan({ rooms, northArrowDeg, centerMethod }, reading),
    [rooms, northArrowDeg, centerMethod, reading],
  );

  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const update = (r: PlanRoom) =>
    setRooms((rs) => rs.map((x) => (x.id === r.id ? r : x)));

  const addRoom = (r: Omit<PlanRoom, "id" | "kind" | "name">) => {
    const id = `room-${nextId.current++}`;
    setRooms((rs) => [
      ...rs,
      { ...r, id, kind: "other", name: `部屋${rs.length + 1}` },
    ]);
    setSelectedId(id);
    setMode("select");
  };

  const matches = result?.rooms.filter((r) => r.fit === "match").length ?? 0;
  const mismatches =
    result?.rooms.filter((r) => r.fit === "mismatch").length ?? 0;

  const button = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold ${
      active
        ? "border-rose-600 bg-rose-600 text-white"
        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
    }`;

  return (
    <section
      className="mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
      aria-label="自分の間取りで見る八宅"
    >
      <header className="border-b border-stone-200/70 px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-rose-600">
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
          自分の間取りで見る
        </p>
        <h3 className="mt-1 text-lg font-bold text-stone-800">
          {reading.guaName}命で、間取りの部屋がどの区画にあるか
        </h3>
        <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-stone-600">
          {LEAD}
        </p>
      </header>

      {/* grid-cols-1 と min-w-0: 列の幅を中身（立体の canvas）に合わせて
          広げない。広がるとスマホで頁が横に流れる */}
      <div className="grid grid-cols-1 gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {webgl && (
              <div role="group" aria-label="見せ方" className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={view === "flat"}
                  onClick={() => setView("flat")}
                  className={button(view === "flat")}
                >
                  平面で描く
                </button>
                <button
                  type="button"
                  aria-pressed={view === "3d"}
                  onClick={() => {
                    setView("3d");
                    setMode("select");
                  }}
                  className={button(view === "3d")}
                >
                  立体で見る
                </button>
              </div>
            )}
            <div
              role="group"
              aria-label="操作"
              className={`flex gap-1 ${view === "3d" ? "hidden" : ""}`}
            >
              <button
                type="button"
                aria-pressed={mode === "select"}
                onClick={() => setMode("select")}
                className={button(mode === "select")}
              >
                選ぶ・動かす
              </button>
              <button
                type="button"
                aria-pressed={mode === "draw"}
                onClick={() => {
                  setMode("draw");
                  setSelectedId(null);
                }}
                className={button(mode === "draw")}
              >
                部屋を描く
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setRooms(exampleRooms());
                setSelectedId(null);
              }}
              className={button(false)}
            >
              例に戻す
            </button>
            <button
              type="button"
              onClick={() => {
                setRooms([]);
                setSelectedId(null);
                setMode("draw");
              }}
              className={button(false)}
            >
              全部消す
            </button>
          </div>
          {mode === "draw" && view === "flat" && (
            <p className="mb-2 text-xs text-amber-800">
              空いている所をなぞると、四角い部屋ができます。
            </p>
          )}
          {view === "3d" && result ? (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-gradient-to-b from-stone-50 to-amber-50/40">
              <FloorPlanScene
                result={result}
                selectedId={selectedId}
                onSelect={setSelectedId}
                reducedMotion={reducedMotion}
                perspective={perspective}
                exportRef={exportRef}
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 bg-white/80 px-3 py-2">
                <div
                  role="group"
                  aria-label="立体の見せ方"
                  className="flex gap-1"
                >
                  <button
                    type="button"
                    aria-pressed={!perspective}
                    onClick={() => setPerspective(false)}
                    className={button(!perspective)}
                  >
                    区画を見る
                  </button>
                  <button
                    type="button"
                    aria-pressed={perspective}
                    onClick={() => setPerspective(true)}
                    className={button(perspective)}
                  >
                    パース（家具つき）
                  </button>
                </div>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={async () => {
                    const make = exportRef.current;
                    if (!make) return;
                    setExporting(true);
                    try {
                      // 端末の中で作って、そのまま保存させる。どこにも送らない
                      const url = URL.createObjectURL(await make());
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "madori.glb";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  className={button(false)}
                >
                  {exporting
                    ? "書き出しています…"
                    : "3D モデルを書き出す（.glb）"}
                </button>
              </div>
              <p className="px-3 pb-2 text-xs leading-relaxed text-stone-600">
                {EXPORT_NOTE}
              </p>
            </div>
          ) : (
            <FlatPlan
              rooms={rooms}
              result={result}
              northArrowDeg={northArrowDeg}
              imageUrl={imageUrl}
              imageOpacity={imageOpacity}
              selectedId={selectedId}
              mode={mode}
              onSelect={setSelectedId}
              onAdd={addRoom}
              onChange={update}
            />
          )}
          {!result && (
            <p className="mt-2 text-sm text-stone-600">
              部屋が 1
              つも無いので、区画が出せません。「部屋を描く」で描くか、例に戻してください。
            </p>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <fieldset className="rounded-2xl border border-stone-200 p-3">
            <legend className="px-1 text-xs font-bold text-stone-700">
              方位記号（北）の向き
            </legend>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={359}
                value={northArrowDeg}
                onChange={(e) => setNorthArrowDeg(Number(e.target.value))}
                aria-label="方位記号の向き（図の上から時計回りの度）"
                className="w-full accent-rose-600"
              />
              <span className="w-16 text-right font-mono text-xs">
                {northArrowDeg} 度
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[
                [0, "上が北"],
                [90, "右が北"],
                [180, "下が北"],
                [270, "左が北"],
              ].map(([deg, label]) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setNorthArrowDeg(deg as number)}
                  className={button(northArrowDeg === deg)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              {NORTH_NOTE}
            </p>
          </fieldset>

          <fieldset className="rounded-2xl border border-stone-200 p-3">
            <legend className="px-1 text-xs font-bold text-stone-700">
              家の中心（太極）の取り方
            </legend>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(CENTER_LABELS) as CenterMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={centerMethod === m}
                  onClick={() => setCenterMethod(m)}
                  className={button(centerMethod === m)}
                >
                  {CENTER_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              L 字のように欠けがある間取りでは、2
              つの取り方で中心が分かれます。図の点線の丸が、もう一方の取り方の中心です。
            </p>
          </fieldset>

          <fieldset className="rounded-2xl border border-stone-200 p-3">
            <legend className="px-1 text-xs font-bold text-stone-700">
              間取り図を下敷きにする
            </legend>
            <label className={`${button(false)} inline-block cursor-pointer`}>
              画像を選ぶ
              <input
                type="file"
                accept="image/*"
                aria-label="間取り図の画像"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setImageUrl(f ? URL.createObjectURL(f) : null);
                }}
                className="sr-only"
              />
            </label>
            {imageUrl && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={imageOpacity}
                  onChange={(e) => setImageOpacity(Number(e.target.value))}
                  aria-label="下敷きの濃さ"
                  className="w-full accent-rose-600"
                />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className={button(false)}
                >
                  外す
                </button>
              </div>
            )}
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              {PRIVACY}
            </p>
          </fieldset>

          {selected && (
            <fieldset
              className="rounded-2xl border border-amber-300 bg-amber-50/60 p-3"
              aria-label="選んだ部屋"
            >
              <legend className="px-1 text-xs font-bold text-amber-900">
                選んだ部屋
              </legend>
              <div className="flex flex-wrap gap-2">
                <label className="block text-xs text-stone-600">
                  名前
                  <input
                    type="text"
                    value={selected.name}
                    onChange={(e) =>
                      update({ ...selected, name: e.target.value })
                    }
                    className="mt-0.5 w-32 rounded-md border border-stone-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  種類
                  <select
                    value={selected.kind}
                    onChange={(e) =>
                      update({
                        ...selected,
                        kind: e.target.value as PlanRoomKind,
                      })
                    }
                    className="mt-0.5 block rounded-md border border-stone-300 px-2 py-1 text-sm"
                  >
                    {(Object.keys(ROOM_KIND_LABELS) as PlanRoomKind[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {ROOM_KIND_LABELS[k]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <NumberField
                  label="左"
                  value={selected.x}
                  onChange={(v) =>
                    update({
                      ...selected,
                      x: snap(clamp(v, 0, PLAN_W - selected.w)),
                    })
                  }
                />
                <NumberField
                  label="上"
                  value={selected.y}
                  onChange={(v) =>
                    update({
                      ...selected,
                      y: snap(clamp(v, 0, PLAN_H - selected.h)),
                    })
                  }
                />
                <NumberField
                  label="幅"
                  value={selected.w}
                  onChange={(v) =>
                    update({
                      ...selected,
                      w: snap(clamp(v, MIN_SIDE, PLAN_W - selected.x)),
                    })
                  }
                />
                <NumberField
                  label="奥行き"
                  value={selected.h}
                  onChange={(v) =>
                    update({
                      ...selected,
                      h: snap(clamp(v, MIN_SIDE, PLAN_H - selected.y)),
                    })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setRooms((rs) => rs.filter((r) => r.id !== selected.id));
                  setSelectedId(null);
                }}
                className="mt-3 rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                この部屋を消す
              </button>
            </fieldset>
          )}
        </div>
      </div>

      {result && (
        <div className="border-t border-stone-200/70 px-5 py-4">
          <p className="text-sm text-stone-700">
            当て方のある部屋のうち、<b>{matches}</b> 部屋が当て方に合い、
            <b>{mismatches}</b> 部屋が合いません。
          </p>
          {result.overlaps.length > 0 && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              重なっている部屋があります。家の中心は、重なった所を 1
              回だけ数えて出しています。
            </p>
          )}
          <ul className="mt-3 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {result.rooms.map((r) => (
              <li key={r.room.id} data-result={r.room.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(r.room.id);
                    setMode("select");
                  }}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    r.room.id === selectedId
                      ? "border-amber-500 bg-amber-50"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-800">
                      {r.room.name || ROOM_KIND_LABELS[r.room.kind]}
                    </span>
                    <span className="text-xs text-stone-500">
                      {ROOM_KIND_LABELS[r.room.kind]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold text-white ${
                        r.main.auspicious ? "bg-emerald-700" : "bg-rose-700"
                      }`}
                    >
                      {r.main.auspicious ? "吉" : "凶"}
                    </span>
                    {r.fit !== "none" && (
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xs font-bold ${
                          r.fit === "match"
                            ? "border-emerald-300 text-emerald-800"
                            : "border-rose-300 text-rose-800"
                        }`}
                      >
                        {r.fit === "match"
                          ? "当て方に合う"
                          : "当て方に合わない"}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs text-stone-700">
                    {r.shares
                      .filter((s) => s.share >= 0.005)
                      .slice(0, 3)
                      .map(
                        (s) =>
                          `${DIRECTION_LABELS[s.direction]}（${s.youxing}）${Math.round(s.share * 100)}%`,
                      )
                      .join("・")}
                  </span>
                  {r.rule && (
                    <span className="mt-1 block text-xs text-stone-500">
                      {r.rule}
                    </span>
                  )}
                  {(r.containsCenter || r.sensitive || r.centerDependent) && (
                    <span className="mt-1 flex flex-wrap gap-1 text-xs">
                      {r.containsCenter && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">
                          太極を含む
                        </span>
                      )}
                      {r.sensitive && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          境目が近い
                        </span>
                      )}
                      {r.centerDependent && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900">
                          中心の取り方で変わる
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {NOT_A_VERDICT}{" "}
            <Link href={ARTICLE} className="font-semibold underline">
              当て方の説明（記事）
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
