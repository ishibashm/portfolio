"use client";

/**
 * 方位別の**借家の家賃と空き家率**（市区町村の統計）。
 *
 * 出どころは e-Stat「統計でみる市区町村のすがた」Ｈ 居住。物件の在庫は
 * どのポータルからも規約上取れない（CLAUDE.md 3 節）ので、「その方位は
 * いくらで住めるか」「空き家が多いか」を公的な統計で出す（backlog 26 節）。
 * 個別の物件は載せない。
 *
 * 家賃は**円/㎡・月**（1 畳当たり家賃 ÷ 1.62）。上の地価（万円/㎡）や
 * 物件検索の㎡単価と同じ単位で並ぶ。月額は平均どうしの積なので
 * **目安**と書く。空き家率は方位内の合計どうしの比。
 *
 * 読み口は `/api/housing-stats/by-direction`。方位の割り当ても中央値も
 * API 側（`lib/housingStatsDirections`）が持っていて、ここでは描くだけ。
 *
 * 出典・加工の明記・API のクレジットは API の meta をそのまま出す
 * （e-Stat の規約。文言を変えない）。
 */

import React, { useEffect, useState } from "react";
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

interface DirectionStat {
  direction: CompassDirection;
  count: number;
  rentCount: number;
  medianRentPerSqm: number | null;
  medianMonthlyRentEstimate: number | null;
  vacancyRate: number | null;
  vacancyCount: number;
  nearestKm: number | null;
  topMunicipalities: string[];
}

interface HousingStatsData {
  directions: DirectionStat[];
  meta: {
    municipalitiesScanned: number;
    dataYear: number | null;
    minKm: number;
    maxKm: number;
    source: string;
    credit: string;
  };
}

function rentPerSqm(v: number | null): string {
  if (v === null) return "--";
  return `${v.toLocaleString()}円/㎡`;
}

function monthly(v: number | null): string {
  if (v === null) return "";
  return `月額の目安 ${(v / 10000).toFixed(1)}万円`;
}

function vacancy(v: number | null): string {
  if (v === null) return "空き家率 --";
  return `空き家率 ${(v * 100).toFixed(1)}%`;
}

export function HousingStatsByDirection({
  lat,
  lon,
  radiusKm,
  hasBase,
}: {
  lat: number;
  lon: number;
  /** null は全国モード。API の上限（500km）で切る。 */
  radiusKm: number | null;
  hasBase: boolean;
}) {
  /* LandPriceByDirection と同じ形。読み込み中かは条件の一致から導出する
     （effect の中で setLoading(true) を呼ばない。CLAUDE.md 4 節）。 */
  const [result, setResult] = useState<{
    key: string;
    data: HousingStatsData | null;
    error: string | null;
  } | null>(null);

  const effectiveRadius = radiusKm ?? 150;
  const requestKey = `${lat},${lon},${effectiveRadius}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = hasBase && result?.key !== requestKey;

  useEffect(() => {
    if (!hasBase) return;
    let alive = true;
    fetch(
      `/api/housing-stats/by-direction?baseLat=${lat}&baseLon=${lon}&maxKm=${effectiveRadius}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setResult({
            key: requestKey,
            data: null,
            error: body.message || "住宅の統計を読み出せませんでした。",
          });
          return;
        }
        setResult({ key: requestKey, data: body, error: null });
      })
      .catch(() => {
        if (alive) {
          setResult({
            key: requestKey,
            data: null,
            error: "住宅の統計を読み出せませんでした。",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [hasBase, lat, lon, effectiveRadius, requestKey]);

  if (!hasBase) return null;

  /* 材料の無い方位も消さない（CLAUDE.md 2-c）。並びは方位の順のまま */
  const directions = data?.directions ?? [];
  const withData = directions.filter((d) => d.count > 0);

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
        方位別の家賃相場と空き家率（市区町村の統計）
      </h3>

      <p className="text-[10px] text-stone-600 dark:text-stone-500 leading-relaxed">
        {
          "国の住宅・土地統計調査から、方位ごとの借家の家賃（円/㎡・月）と空き家率を出しています。個別の物件ではなく、街ごとの水準です。"
        }
      </p>

      {loading && (
        <p className="text-xs text-stone-500">住宅の統計を集計しています…</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {data && !loading && withData.length === 0 && (
        <p className="text-xs text-stone-500 leading-relaxed">
          {`この範囲（${data.meta.minKm}〜${data.meta.maxKm}km）には統計のある市区町村がありませんでした。範囲を広げると出ることがあります。`}
        </p>
      )}

      {data && !loading && withData.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {directions.map((d) => (
              <div
                key={d.direction}
                className="bg-white dark:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold text-stone-700">
                    {DIRECTION_LABELS[d.direction] ?? d.direction}
                  </span>
                  <span className="text-right">
                    <span className="block text-[11px] font-mono text-stone-700">
                      {rentPerSqm(d.medianRentPerSqm)}
                    </span>
                    <span className="block text-[9px] text-stone-600">
                      {d.count === 0
                        ? "統計のある街なし"
                        : `${d.count.toLocaleString()} 市区町村`}
                    </span>
                  </span>
                </div>
                {d.count > 0 && (
                  <p className="mt-0.5 text-[9px] text-stone-600">
                    {[
                      monthly(d.medianMonthlyRentEstimate),
                      vacancy(d.vacancyRate),
                    ]
                      .filter(Boolean)
                      .join("・")}
                  </p>
                )}
                {d.topMunicipalities.length > 0 && (
                  <p className="mt-0.5 text-[9px] text-stone-500 truncate">
                    {d.topMunicipalities.join("・")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[9px] text-stone-500 leading-relaxed">
            {`${data.meta.source}${data.meta.dataYear ? `（${data.meta.dataYear} 年調査）` : ""}。家賃は 1 畳当たり家賃を 1 畳 = 1.62㎡ で㎡に直したもの。月額は平均畳数との積で目安。${data.meta.minKm}km 未満の市区町村は方位が定まらないため除いています。`}
          </p>
          <p className="text-[9px] text-stone-500 leading-relaxed">
            {data.meta.credit}
          </p>
        </>
      )}
    </section>
  );
}

export default HousingStatsByDirection;
