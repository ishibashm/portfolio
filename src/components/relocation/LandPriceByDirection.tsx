"use client";

/**
 * 方位別の**地価公示**（更地の㎡単価）。
 *
 * 同じサイドバーにある `TransactionsPanel` は成約価格を出すが、あれは
 * **建物込みの総額**から割った㎡単価で、公開されるのも町名まで。
 * 「その方位の土地はいくらか」には遠い。
 *
 * 地価公示・都道府県地価調査は**更地の価格**を地点ごとに持っているので、
 * 土地そのものの水準を見るならこちらが素直。並べて置くと
 *
 *     成約（建物込み） … 実際にいくらで取引されたか
 *     公示（更地）     … 土地そのものの評価額
 *
 * の差が読める。**割った数字に意味は無い**ので、比は出さない。
 *
 * 読み口は `/api/land-prices/by-direction`。方位の割り当ても中央値も
 * API 側（`lib/landPriceDirections`）が持っていて、ここでは描くだけ。
 */

import React, { useEffect, useState } from "react";
/* ラベルと方位の型は directionGeo（暦エンジンを引かない葉）から。
   kigakuContent 経由だと lunar-javascript 一式が初回読み込みに乗る。 */
import { DIRECTION_LABELS, type CompassDirection } from "@/utils/directionGeo";

interface DirectionStat {
  direction: CompassDirection;
  count: number;
  medianPricePerSqm: number | null;
  p25PricePerSqm: number | null;
  p75PricePerSqm: number | null;
  nearestKm: number | null;
  topMunicipalities: string[];
}

interface LandPriceData {
  directions: DirectionStat[];
  meta: {
    pointsScanned: number;
    minKm: number;
    maxKm: number;
    source: string;
  };
}

/** 円/㎡ → 万円/㎡。桁が大きく、円のままだと読み違える。 */
function unitManYen(yenPerSqm: number | null): string {
  if (yenPerSqm === null) return "--";
  return `${(yenPerSqm / 10000).toFixed(1)}万円/㎡`;
}

export function LandPriceByDirection({
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
  /*
    TransactionsPanel と同じ形。取得結果は「どの条件で取ったか」と一緒に
    持ち、読み込み中かは条件の一致から導出する。effect の中で
    setLoading(true) を呼ぶと再レンダリングが連鎖する
    （react-hooks/set-state-in-effect。CLAUDE.md 4 節）。
  */
  const [result, setResult] = useState<{
    key: string;
    data: LandPriceData | null;
    error: string | null;
  } | null>(null);

  /* 全国モード（null）は API の上限まで。150 に落としていたが、「全国」を
     選んだのに 150km で切られていて、props の註（500km）とも食い違って
     いた。TransactionsPanel が null → 自分の上限（300）にしているのと
     同じ形にそろえる。 */
  const effectiveRadius = radiusKm ?? 500;
  const requestKey = `${lat},${lon},${effectiveRadius}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = hasBase && result?.key !== requestKey;

  useEffect(() => {
    if (!hasBase) return;
    let alive = true;

    fetch(
      `/api/land-prices/by-direction?baseLat=${lat}&baseLon=${lon}&maxKm=${effectiveRadius}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setResult({
            key: requestKey,
            data: null,
            error: body.message || "地価を読み出せませんでした。",
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
            error: "地価を読み出せませんでした。",
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [hasBase, lat, lon, effectiveRadius, requestKey]);

  if (!hasBase) return null;

  /* 地点が 1 つも無い方位も消さない（CLAUDE.md 2-c）。並べ替えは方位の
     並び（北から時計回り）のまま。件数順にすると毎回入れ替わって読めない */
  const directions = data?.directions ?? [];
  const withPoints = directions.filter((d) => d.count > 0);

  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
        方位別の地価（更地・中央値）
      </h3>

      <p className="text-[10px] text-stone-600 dark:text-stone-500 leading-relaxed">
        国が毎年出す標準地の価格です。上の成約相場が建物込みの取引額なのに対し、こちらは
        <strong className="font-bold">土地そのものの評価額</strong>
        にあたります。性質が違うので、2 つを割った数字には意味がありません。
      </p>

      {loading && (
        <p className="text-xs text-stone-500">地価を集計しています…</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {data && !loading && withPoints.length === 0 && (
        <p className="text-xs text-stone-500 leading-relaxed">
          {`この範囲（${data.meta.minKm}〜${data.meta.maxKm}km）には標準地がありませんでした。範囲を広げると出ることがあります。`}
        </p>
      )}

      {data && !loading && withPoints.length > 0 && (
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
                      {unitManYen(d.medianPricePerSqm)}
                    </span>
                    <span className="block text-[9px] text-stone-600">
                      {d.count === 0
                        ? "標準地なし"
                        : `${d.count.toLocaleString()} 地点`}
                    </span>
                  </span>
                </div>
                {d.topMunicipalities.length > 0 && (
                  <p className="mt-0.5 text-[9px] text-stone-500 truncate">
                    {d.topMunicipalities.join("・")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="text-[9px] text-stone-500 leading-relaxed">
            {`出典: ${data.meta.source}。${data.meta.minKm}km 未満の地点は方位が定まらないため除いています。`}
          </p>
        </>
      )}
    </section>
  );
}

export default LandPriceByDirection;
