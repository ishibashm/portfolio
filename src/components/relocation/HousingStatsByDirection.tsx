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
import Link from "next/link";
import {
  DIRECTION_LABELS,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";

/** 方位に入った街 1 件（API の `DirectionMunicipality`）。 */
interface DirectionMunicipality {
  code: string;
  name: string;
  distanceKm: number;
  bearing: number;
  rentPerSqm: number | null;
  vacancyRate: number | null;
  totalDwellings: number | null;
}

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
  municipalities: DirectionMunicipality[];
  truncated: boolean;
}

interface HousingStatsData {
  directions: DirectionStat[];
  meta: {
    municipalitiesScanned: number;
    dataYear: number | null;
    minKm: number;
    maxKm: number;
    nodeMapping: NodeMapping;
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
  nodeMapping,
}: {
  lat: number;
  lon: number;
  /** null は全国モード。API の上限（500km）で切る。 */
  radiusKm: number | null;
  hasBase: boolean;
  /**
   * 方位の切り方。**同じ画面の物件一覧と同じものを渡すこと。**
   *
   * ここは長らく API 側の決め打ち（traditional）だった。物件一覧は
   * 独自モデルなら physical（45 度等分）で切るので、**独自モデルの
   * 利用者は同じ画面で 2 通りの方位割り当てを見ていた。**大阪駅から
   * 100km 以内だけで 29 市区町村が規則によって方位を変える
   * （#1297・#1298）。
   */
  nodeMapping: NodeMapping;
}) {
  /*
    どの方位の街を開いているか（2026-09-14）。

    賃貸の巡回を止めたので（backlog 29 節）、物件検索の掲載は 10 月中旬に
    0 件になる。**並べる先を部屋から街へ移す**のがこの移行の本体で、
    ここがその入口。

    **畳んで置く。**8 方位 × 12 件を常に開くと 96 行が積み上がり、上の
    集計が読めなくなる。**新しい要求は出さない。**街の一覧は同じ応答に
    入っている（#1300）ので、開閉は描画だけの話。
  */
  const [openDirection, setOpenDirection] = useState<CompassDirection | null>(
    null,
  );

  /* LandPriceByDirection と同じ形。読み込み中かは条件の一致から導出する
     （effect の中で setLoading(true) を呼ばない。CLAUDE.md 4 節）。 */
  const [result, setResult] = useState<{
    key: string;
    data: HousingStatsData | null;
    error: string | null;
  } | null>(null);

  /* 全国モード（null）は API の上限まで。150 に落としていたが、「全国」を
     選んだのに 150km で切られていて、props の註（500km）とも食い違って
     いた。TransactionsPanel が null → 自分の上限（300）にしているのと
     同じ形にそろえる。 */
  const effectiveRadius = radiusKm ?? 500;
  /* 切り方も鍵に入れる。入れないと、盤を切り替えても前の答えが残る */
  const requestKey = `${lat},${lon},${effectiveRadius},${nodeMapping}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = hasBase && result?.key !== requestKey;

  useEffect(() => {
    if (!hasBase) return;
    let alive = true;
    fetch(
      `/api/housing-stats/by-direction?baseLat=${lat}&baseLon=${lon}&maxKm=${effectiveRadius}&nodeMapping=${nodeMapping}`,
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
  }, [hasBase, lat, lon, effectiveRadius, nodeMapping, requestKey]);

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
          "国の住宅・土地統計調査から、方位ごとの借家の家賃（円/㎡・月）と空き家率を出しています。個別の物件ではなく街ごとの水準で、各方位から市区町村の一覧へ降りられます。"
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
                {/* その方位の街を開く。**行き先はこのサイトの市区町村
                    ページ。**外部への導線はその頁が持っている
                    （`CityPortalLinks`）。ここに直接置くと 1 画面で
                    最大 96 本の外部リンクになる（#1296 と同じ判断）。 */}
                {d.municipalities.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDirection((cur) =>
                          cur === d.direction ? null : d.direction,
                        )
                      }
                      aria-expanded={openDirection === d.direction}
                      className="mt-1 inline-flex min-h-[24px] items-center text-[10px] font-bold text-indigo-700 underline hover:text-indigo-900"
                    >
                      {openDirection === d.direction
                        ? "街を閉じる"
                        : `この方位の街を見る（${d.municipalities.length}${d.truncated ? "／" + d.count.toLocaleString() : ""}）`}
                    </button>
                    {openDirection === d.direction && (
                      <ul className="mt-1 space-y-0.5 border-t border-stone-200 pt-1">
                        {d.municipalities.map((m) => (
                          <li key={m.code} className="text-[10px]">
                            <Link
                              prefetch={false}
                              href={`/houi/area/${m.code}`}
                              className="font-semibold text-stone-800 underline hover:text-indigo-700"
                            >
                              {m.name}
                            </Link>
                            {/* 名前と数字の間に区切りを入れる。`ml-1` の
                                余白だけだと「東京都N区010km」と読めて
                                しまった（実測。名前が数字で終わる街は
                                実在する） */}
                            <span className="ml-1 text-stone-400">／</span>
                            <span className="ml-1 font-mono text-stone-600">
                              {[
                                `${m.distanceKm}km`,
                                m.rentPerSqm === null
                                  ? null
                                  : `${m.rentPerSqm.toLocaleString()}円/㎡`,
                                m.vacancyRate === null
                                  ? null
                                  : `空き家${(m.vacancyRate * 100).toFixed(1)}%`,
                              ]
                                .filter(Boolean)
                                .join(" ・ ")}
                            </span>
                          </li>
                        ))}
                        {d.truncated && (
                          <li className="text-[9px] leading-relaxed text-stone-500">
                            {`近い順に ${d.municipalities.length} 件まで出しています（この方位は全部で ${d.count.toLocaleString()} 市区町村）。`}
                          </li>
                        )}
                      </ul>
                    )}
                  </>
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
