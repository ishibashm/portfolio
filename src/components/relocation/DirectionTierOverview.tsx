"use client";

import { useSyncExternalStore } from "react";
import { TIER_FILL, TIER_JP, BLOCKED_FILL } from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/auspiciousDays";
import {
  FENG_SHUI_SERVER_SNAPSHOT,
  fengShuiActive,
  fengShuiSnapshot,
  parseSnapshot,
  subscribeFengShui,
} from "@/lib/fengShuiSettings";
import {
  honmeiYearFor,
  readFengShui,
  type FengShuiReading,
} from "@/utils/fengShuiEngine";
import type { CompassDirection } from "@/utils/directionGeo";

/**
 * 方位ごとに「その日の段階」と「いま表示している物件数」を並べる。
 *
 * 一覧は㎡単価や総合スコアの順に並ぶので、「どっちへ動くか」を決めるための
 * 全体像——どの方位が動ける方位で、そこに物件がどれだけあるか——が出ていない。
 *
 * 形について。提案書は「方位 × 段階の積み上げ棒」を挙げているが、
 * **段階は方位ごとに 1 つしかない**（dayKigaku.byDirection がその日の盤から
 * 方位ごとに 1 つの tier を出す）。同じ方位の物件はすべて同じ段階になるので、
 * 積み上げようとしても 1 段しか積まれない。棒 1 本＝1 方位にして、
 * 長さで件数、色で段階を出す。提案書が求めた「南東に S が 12 件」は
 * これで 1 行として読める。
 *
 * 色は utils/tierDisplay の TIER_FILL をそのまま使う。地図の扇形・県塗り・
 * カレンダー・ピンと同じ色でないと、画面をまたいだ時に別の意味に見える。
 *
 * ただし TIER_FILL は S(#10b981) と A(#14b8a6) が近く、色だけで隣り合う行を
 * 見分けるのは難しい（実測 ΔE 5.4／色覚多様性下 5.0。読みやすさの下限 15 を
 * 下回る）。ここでは段階の名前を各行に必ず添えて、色に頼らせない。
 * 色表そのものを直すとサイト全体の塗りが変わるので、別途相談すること。
 */

export interface DirectionTierRow {
  direction: string;
  directionLabel: string;
  tier: string;
  blocked: boolean;
  count: number;
}

/** 良い順。並べ替えと「動ける方位」の判定に使う。 */
const TIER_ORDER = ["S", "A", "B", "C", "D", "X"];

function rank(row: DirectionTierRow): number {
  if (row.blocked) return TIER_ORDER.length + 1;
  const i = TIER_ORDER.indexOf(row.tier);
  return i < 0 ? TIER_ORDER.length : i;
}

export function sortDirectionRows(
  rows: DirectionTierRow[],
): DirectionTierRow[] {
  // 段階が良い順。同じ段階なら物件が多い順。
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

export function fillFor(row: DirectionTierRow): string {
  return row.blocked
    ? BLOCKED_FILL
    : (TIER_FILL[row.tier as DayTier] ?? "#e7e5e4");
}

export function tierLabelFor(row: DirectionTierRow): string {
  if (row.blocked) return "天中殺";
  return TIER_JP[row.tier as DayTier] ?? row.tier;
}

/**
 * 八宅の見立て。切り替えが入っていて、生年月日が読めるときだけ返す。
 *
 * 併記であって合算ではない。気学の段階も、並べ替えも、色も変えていない。
 */
function fengShuiReadingFor(
  birthDate: string | undefined,
  stored: ReturnType<typeof parseSnapshot>,
): FengShuiReading | null {
  if (!birthDate || !fengShuiActive(stored)) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return readFengShui(honmeiYearFor(d), stored.sex);
}

function youxingFor(reading: FengShuiReading, direction: string) {
  return reading.directions.find(
    (d) => d.direction === (direction as CompassDirection),
  );
}

export function DirectionTierOverview({
  rows,
  selectedDirection,
  onSelectDirection,
  birthDate,
}: {
  rows: DirectionTierRow[];
  /** "ALL" なら絞り込んでいない */
  selectedDirection: string;
  onSelectDirection: (direction: string) => void;
  /**
   * 生年月日。風水（八宅）の併記に使う。切り替えが入っていて、
   * かつ読める日付のときだけ遊星を添える。渡さなければ何も変わらない。
   */
  birthDate?: string;
}) {
  /*
    風水の設定は localStorage にある。React の外の状態なので購読する
    （useEffect の中で setState すると set-state-in-effect に掛かる）。
    フックは早期 return より前に呼ぶ。
  */
  const stored = parseSnapshot(
    useSyncExternalStore(
      subscribeFengShui,
      fengShuiSnapshot,
      () => FENG_SHUI_SERVER_SNAPSHOT,
    ),
  );

  if (rows.length === 0) return null;

  const fengShui = fengShuiReadingFor(birthDate, stored);

  const sorted = sortDirectionRows(rows);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  const total = sorted.reduce((a, r) => a + r.count, 0);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-stone-700">方位ごとの内訳</h3>
        <span className="text-[10px] text-stone-600">
          表示中 {total.toLocaleString()} 件
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
        棒の長さが物件数、色がその日の段階です。行を押すとその方位だけに絞れます。
      </p>

      {fengShui && (
        <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
          右端は風水（八宅）の遊星です（{fengShui.guaName}命・{fengShui.group}
          ）。
          <b>気学の段階とは足し合わせていません。</b>
          八宅は<b>方位名で</b>
          引いているため、気学と区切りが違う境目の物件は八宅では隣の方位に入ります。
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {sorted.map((r) => {
          const active = selectedDirection === r.direction;
          const width = r.count === 0 ? 0 : Math.max(3, (r.count / max) * 100);
          return (
            <li key={r.direction}>
              <button
                onClick={() => onSelectDirection(active ? "ALL" : r.direction)}
                aria-pressed={active}
                className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors ${
                  active ? "bg-indigo-50" : "hover:bg-stone-50"
                }`}
              >
                <span className="w-6 shrink-0 text-[11px] font-bold text-stone-600">
                  {r.directionLabel}
                </span>

                {/* 棒。角は 24px 上限より十分細いので 4px の丸めのみ */}
                <span className="relative h-3 min-w-0 flex-1 rounded-[2px] bg-stone-100">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px]"
                    style={{ width: `${width}%`, background: fillFor(r) }}
                  />
                </span>

                {/* 値は棒の外。中に置くと 0 件や短い棒で溢れる */}
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-stone-600">
                  {r.count.toLocaleString()}
                </span>

                {/* 段階は必ず文字でも出す。色だけだと S と A を見分けられない */}
                <span className="w-14 shrink-0 text-[10px] text-stone-500">
                  {tierLabelFor(r)}
                </span>

                {/* 風水（八宅）。切り替えが入っているときだけ。
                    吉凶は色だけで出さず、遊星の名前をそのまま出す。 */}
                {fengShui && (
                  <span
                    className={`w-12 shrink-0 text-[10px] font-bold ${
                      youxingFor(fengShui, r.direction)?.auspicious
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {youxingFor(fengShui, r.direction)?.youxing ?? ""}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {selectedDirection !== "ALL" && (
        <button
          onClick={() => onSelectDirection("ALL")}
          className="mt-2 text-[10px] text-indigo-600 underline"
        >
          方位の絞り込みを外す
        </button>
      )}
    </div>
  );
}
