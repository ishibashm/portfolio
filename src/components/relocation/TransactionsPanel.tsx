"use client";

/**
 * 購入モードのサイドバー。国交省の成約価格（過去に実際に売買された価格）を
 * 出発地からの方位つきで出す。
 *
 * 賃貸と違って「いま買える物件の一覧」ではない。だから物件カードの形は
 * 取らず、**方位別の相場（中央値）と直近の成約事例**に徹する。誤解を
 * 招かないよう、パネルの先頭でデータの正体を言い切る。
 *
 * 読み口は /api/relocation/transactions。方位は API 側で賃貸のスキャンと
 * 同じ集約（utils/directionGeo・真北基準）を使って付けてある。
 * 座標整備中（geocode 前）の事例は方位を出せないため一覧に出ないが、
 * その件数を隠さず表示する。
 */

import React, { useEffect, useState } from "react";
import { DIRECTION_LABELS } from "@/lib/kigakuContent";
import type { CompassDirection } from "@/lib/kigakuContent";

interface TxRow {
  id: string;
  prefecture: string;
  municipality: string;
  districtName: string | null;
  propertyType: string | null;
  tradePrice: number | null;
  areaSqm: number | null;
  unitPriceSqm: number | null;
  buildingYear: number | null;
  tradeYear: number;
  tradeQuarter: number;
  distanceKm: number;
  direction: CompassDirection;
}

interface TxData {
  rows: TxRow[];
  totalInRadius: number;
  truncated: boolean;
  pendingCoords: number;
  byDirection: {
    direction: CompassDirection;
    count: number;
    medianUnitPriceSqm: number | null;
  }[];
}

/** 円 → 万円。成約価格は桁が大きく、円のままだと読み違える。 */
function manYen(yen: number | null): string {
  if (yen === null) return "--";
  return `${Math.round(yen / 10000).toLocaleString()}万円`;
}

function unitManYen(yenPerSqm: number | null): string {
  if (yenPerSqm === null) return "--";
  return `${(yenPerSqm / 10000).toFixed(1)}万円/㎡`;
}

export function TransactionsPanel({
  lat,
  lon,
  radiusKm,
  hasBase,
}: {
  lat: number;
  lon: number;
  /** null は全国モード。API の上限（300km）で切る。 */
  radiusKm: number | null;
  hasBase: boolean;
}) {
  /*
    取得結果は「どの条件で取ったか」と一緒に持ち、読み込み中かどうかは
    条件の一致から導出する。effect の中で同期的に setLoading(true) を
    呼ぶと再レンダリングが連鎖する（react-hooks/set-state-in-effect）。
  */
  const [result, setResult] = useState<{
    key: string;
    data: TxData | null;
    error: string | null;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState("");

  const effectiveRadius = radiusKm ?? 300;
  const requestKey = `${lat},${lon},${effectiveRadius}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = hasBase && result?.key !== requestKey;

  useEffect(() => {
    if (!hasBase) return;
    let alive = true;

    fetch(
      `/api/relocation/transactions?lat=${lat}&lon=${lon}&radius_km=${effectiveRadius}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok || !body.success) {
          setResult({
            key: requestKey,
            data: null,
            error: body.error || "成約事例を読み出せませんでした。",
          });
          return;
        }
        setResult({ key: requestKey, data: body.data, error: null });
      })
      .catch(() => {
        if (alive) {
          setResult({
            key: requestKey,
            data: null,
            error: "成約事例を読み出せませんでした。",
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [lat, lon, effectiveRadius, hasBase, requestKey]);

  if (!hasBase) {
    return (
      <p className="text-xs text-stone-500 leading-relaxed">
        出発地を設定すると、そこからの方位別に成約相場を表示します。
      </p>
    );
  }

  const types = data
    ? [...new Set(data.rows.map((r) => r.propertyType).filter(Boolean))]
    : [];
  const rows = data
    ? data.rows.filter((r) => !typeFilter || r.propertyType === typeFilter)
    : [];

  return (
    <div className="space-y-4">
      <div className="text-[11px] leading-relaxed text-stone-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        {
          "ここに出るのは国土交通省の成約価格（過去に実際に売買された価格）です。いま買える物件の一覧ではありません。購入を検討する方位の相場観に使ってください。"
        }
      </div>

      {loading && (
        <p className="text-xs text-stone-400 animate-pulse">
          成約事例を読み込んでいます…
        </p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {data && !loading && (
        <>
          {/* 方位別の相場。中央値（外れ値に強い）で出す */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              方位別の成約相場（中央値）
            </h3>
            {data.byDirection.length === 0 ? (
              <p className="text-xs text-stone-500 leading-relaxed">
                {
                  "この範囲には座標整備済みの成約事例がまだありません。座標の整備（地区名から順に埋めています）が進むと表示されます。"
                }
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {[...data.byDirection]
                  .sort((a, b) => b.count - a.count)
                  .map((d) => (
                    <div
                      key={d.direction}
                      className="flex items-baseline justify-between bg-white dark:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="text-xs font-bold text-stone-700">
                        {DIRECTION_LABELS[d.direction] ?? d.direction}
                      </span>
                      <span className="text-right">
                        <span className="block text-[11px] font-mono text-stone-700">
                          {unitManYen(d.medianUnitPriceSqm)}
                        </span>
                        <span className="block text-[9px] text-stone-400">
                          {d.count.toLocaleString()} 件
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* 種別の絞り込み。件数の多い順に並べ替えはしない（選択肢が跳ねる） */}
          {types.length > 1 && (
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer"
            >
              <option value="">すべての種別</option>
              {types.map((t) => (
                <option key={t} value={t ?? ""}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {/* 直近の成約事例 */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2">
              直近の成約事例（新しい順・{rows.length.toLocaleString()} 件表示）
            </h3>
            <ul className="space-y-1.5">
              {rows.slice(0, 100).map((r) => (
                <li
                  key={r.id}
                  className="bg-white dark:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2 text-[11px] leading-snug"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-stone-700 truncate">
                      {r.municipality}
                      {r.districtName ?? ""}
                    </span>
                    <span className="font-mono text-stone-700 shrink-0">
                      {manYen(r.tradePrice)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-2 text-[9px] text-stone-400 mt-0.5">
                    <span>{r.propertyType ?? "種別不明"}</span>
                    {r.areaSqm !== null && <span>{r.areaSqm}㎡</span>}
                    <span>{unitManYen(r.unitPriceSqm)}</span>
                    <span>
                      {r.tradeYear}年Q{r.tradeQuarter}
                    </span>
                    <span className="text-stone-500 font-bold">
                      {DIRECTION_LABELS[r.direction] ?? r.direction}・
                      {r.distanceKm}km
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-[9px] text-stone-400 leading-relaxed">
            範囲内 {data.totalInRadius.toLocaleString()} 件
            {data.truncated ? "（多いため新しい順に切っています）" : ""}。
            {data.pendingCoords > 0
              ? `座標整備中の事例が全国に ${data.pendingCoords.toLocaleString()} 件あり、整備が進むとここに加わります。`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}

export default TransactionsPanel;
