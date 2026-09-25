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
/* ラベルと方位の型は directionGeo（暦エンジンを引かない葉）から。
   kigakuContent 経由だと、この部品を載せる頁の初回読み込みに
   lunar-javascript 一式が乗る（backlog 17 節）。中身は同じ表。 */
import {
  DIRECTION_LABELS,
  type CompassDirection,
  type NodeMapping,
} from "@/utils/directionGeo";
import {
  isOpenDirection,
  orderDirections,
  type DirectionVerdict,
} from "@/lib/directionTowns";
import { TIER_JP } from "@/utils/tierDisplay";
import type { DayTier } from "@/utils/dayTier";

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
  totalFloorAreaSqm: number | null;
  /** 積算による推定（実額ではない）。null は延床・築年・構造のどれかが欠けている。 */
  estBuildingPrice: number | null;
  estLandPrice: number | null;
  buildingRatio: number | null;
  /** 前面道路（国交省の値そのまま）。マンション等は null。 */
  roadDirection?: string | null;
  roadClassification?: string | null;
  roadBreadthM?: number | null;
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

/** 総額の上限（円）。「買うときの水準」で絞る選択肢。 */
const PRICE_CAPS = [
  10_000_000, 20_000_000, 30_000_000, 50_000_000, 100_000_000,
];
/** 面積の下限（㎡）。土地・戸建ての広さで絞る選択肢。 */
const AREA_FLOORS = [100, 150, 200, 300];
/**
 * 前面道路の方位の選択肢（国交省の綴り。2026-09-25 の probe で確認）。
 * 家の方位（出発地から見た向き）とは別の軸なので、名前で区別する。
 */
const ROAD_DIRECTION_OPTIONS = [
  "南",
  "南東",
  "南西",
  "東",
  "西",
  "北東",
  "北西",
  "北",
  "接面道路無",
];

/** 段階の札の文言。判定が無ければ出さない。 */
function verdictLabel(cell: DirectionVerdict | undefined): string | null {
  if (!cell) return null;
  if (cell.blocked) return "天中殺";
  return TIER_JP[cell.tier as DayTier] ?? cell.tier;
}

/**
 * 一覧を絞る方位。**1 方位を選んでいればそれだけ**、そうでなく「開いて
 * いる方位だけ」なら開いている方位の集合、どちらでもなければ null（絞らない）。
 * 開いている方位が 1 つも無い日に空の集合で 0 件にしないよう、そのときは
 * null ではなく空配列を返して呼び出し側に言わせる。
 */
export function listDirections(
  selectedDirection: string,
  openOnly: boolean,
  verdicts: Record<string, DirectionVerdict> | undefined,
): CompassDirection[] | null {
  if (selectedDirection !== "ALL") {
    return [selectedDirection as CompassDirection];
  }
  if (!openOnly || !verdicts) return null;
  return (Object.keys(DIRECTION_LABELS) as CompassDirection[]).filter((d) =>
    isOpenDirection(verdicts[d]),
  );
}

export function TransactionsPanel({
  lat,
  lon,
  radiusKm,
  hasBase,
  nodeMapping,
  verdicts,
  selectedDirection = "ALL",
  onSelectDirection,
}: {
  lat: number;
  lon: number;
  /** null は全国モード。API の上限（300km）で切る。 */
  radiusKm: number | null;
  hasBase: boolean;
  /**
   * 方位の切り方。**盤の設定と同じものを渡すこと。**
   *
   * route は `node_mapping` を読むのに、ここが送っていなかった。渡さないと
   * 向こうは traditional に倒すので、独自モデル（45 度等分）の利用者は
   * **同じ画面の住宅・土地統計と別の振り分け**を見ていた（#1297・#1298 で
   * 統計を直したときの取り残し。地価は #1498）。
   */
  nodeMapping: NodeMapping;
  /**
   * その日の方位ごとの段階（ページが組んだ `dayKigaku.byDirection`）。
   * 渡すと方位の札に段階を添え、「開いている方位だけ」で絞れる。判定は
   * ここでは作らない（街の一覧・地図と同じものを借りる）。
   */
  verdicts?: Record<string, DirectionVerdict>;
  /**
   * 頁全体の方位の絞り込み（"ALL" なら絞らない）。方位の札を押すと
   * `onSelectDirection` で頁へ返す。街の一覧・方位ごとの内訳と同じ
   * 1 つの状態で、この札だけ別の選び方を持たない。
   */
  selectedDirection?: string;
  onSelectDirection?: (direction: string) => void;
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
  /*
    建物比率（積算推定）の下限。API 側で索引の効く数値比較に落ちる
    （#415・#416 で取り込み時に前計算済み）。条件を変えると取り直しに
    なるので requestKey に含める。
  */
  const [minRatio, setMinRatio] = useState("");
  /*
    買うときの水準で絞る（利用者の依頼、2026-09-24「土地の方角などで
    フィルタリングできるように」）。総額の上限・面積の下限・開いている
    方位だけ。どれも API で絞る — 一覧は新しい順に 500 件で切るので、
    画面で絞ると件数の少ない方位や予算帯はほとんど残らない。
  */
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [roadDirection, setRoadDirection] = useState("");
  const [openOnly, setOpenOnly] = useState(false);

  const dirs = listDirections(selectedDirection, openOnly, verdicts);
  const dirsParam = dirs ? dirs.join(",") : "";
  /* 開いている方位が 1 つも無い日。取りに行っても方位で絞れない */
  const noOpenDirection = dirs !== null && dirs.length === 0;

  const effectiveRadius = radiusKm ?? 300;
  const requestKey = `${lat},${lon},${effectiveRadius},${minRatio},${maxPrice},${minArea},${roadDirection},${dirsParam},${nodeMapping}`;
  const data = result?.key === requestKey ? result.data : null;
  const error = result?.key === requestKey ? result.error : null;
  const loading = hasBase && !noOpenDirection && result?.key !== requestKey;

  useEffect(() => {
    if (!hasBase || noOpenDirection) return;
    let alive = true;

    fetch(
      `/api/relocation/transactions?lat=${lat}&lon=${lon}&radius_km=${effectiveRadius}` +
        `&node_mapping=${nodeMapping}` +
        (minRatio ? `&min_building_ratio=${minRatio}` : "") +
        (maxPrice ? `&max_price=${maxPrice}` : "") +
        (minArea ? `&min_area=${minArea}` : "") +
        (roadDirection
          ? `&road_direction=${encodeURIComponent(roadDirection)}`
          : "") +
        (dirsParam ? `&directions=${dirsParam}` : ""),
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
  }, [
    lat,
    lon,
    effectiveRadius,
    hasBase,
    requestKey,
    minRatio,
    nodeMapping,
    maxPrice,
    minArea,
    roadDirection,
    dirsParam,
    noOpenDirection,
  ]);

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

      {/*
        建物比率（積算推定）での絞り込み。「建物がしっかりしているのに
        土地は普通」を探す口。条件を変えるとサーバから取り直すため、
        読み込み中に消えないよう data の外に置く。
        推定を持つのは戸建て（宅地(土地と建物)）だけなので、絞ると
        マンション・土地の事例は外れる。その旨は選択肢の下に明記する。
      */}
      <div>
        <select
          value={minRatio}
          onChange={(e) => setMinRatio(e.target.value)}
          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer"
        >
          <option value="">建物比率で絞らない</option>
          <option value="0.3">建物比率 3割以上</option>
          <option value="0.5">建物比率 5割以上</option>
          <option value="0.7">建物比率 7割以上</option>
        </select>
        {minRatio && (
          <p className="text-xs text-stone-600 leading-relaxed mt-1">
            {
              "比率は積算（延床×再調達単価×残存年数比）による推定です。戸建てのみ計算でき、マンション・土地の事例はこの絞り込みでは表示されません。"
            }
          </p>
        )}
      </div>

      {/* 総額・面積・方位の絞り込み。条件を変えると取り直すので、
          読み込み中に消えないよう data の外に置く */}
      <div className="grid grid-cols-2 gap-1.5">
        <select
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          aria-label="総額の上限"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer"
        >
          <option value="">総額の上限なし</option>
          {PRICE_CAPS.map((v) => (
            <option key={v} value={v}>
              {manYen(v)}以下
            </option>
          ))}
        </select>
        <select
          value={minArea}
          onChange={(e) => setMinArea(e.target.value)}
          aria-label="面積の下限"
          className="w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer"
        >
          <option value="">面積の下限なし</option>
          {AREA_FLOORS.map((v) => (
            <option key={v} value={v}>
              {v}㎡以上
            </option>
          ))}
        </select>
        {/* 前面道路の方位（利用者の依頼、2026-09-24）。家の方位とは別の軸 */}
        <select
          value={roadDirection}
          onChange={(e) => setRoadDirection(e.target.value)}
          aria-label="前面道路の方位"
          className="col-span-2 w-full px-3 py-2 bg-gray-50 dark:bg-white border border-gray-200 dark:border-stone-200 rounded-xl text-xs outline-none cursor-pointer"
        >
          <option value="">前面道路の方位を問わない</option>
          {ROAD_DIRECTION_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v === "接面道路無" ? "前面道路なし" : `前面道路が${v}`}
            </option>
          ))}
        </select>
      </div>
      {roadDirection && (
        <p className="text-xs text-stone-600 leading-relaxed">
          {
            "前面道路の方位は、土地が接する道路の向きです（国交省の取引価格情報）。家から見た方位とは別で、マンション・農地・林地は値が無いため、この絞り込みでは表示されません。"
          }
        </p>
      )}
      {verdicts && (
        <label className="flex min-h-[24px] items-center gap-2 text-xs text-stone-700">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />
          その日に開いている方位の事例だけ
        </label>
      )}
      {noOpenDirection && (
        <p className="text-xs leading-relaxed text-amber-800">
          {
            "この日は開いている方位がありません（どの方位も五大凶殺か天中殺に当たっています）。日付を変えるか、チェックを外してください。"
          }
        </p>
      )}

      {loading && (
        <p className="text-xs text-stone-600 animate-pulse">
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
                {/* 判定があれば開いている順（街の一覧と同じ並べ方）、
                    無ければ件数の多い順。押すと頁全体がその方位に絞られる */}
                {(verdicts
                  ? orderDirections(data.byDirection, verdicts)
                  : [...data.byDirection].sort((a, b) => b.count - a.count)
                ).map((d) => {
                  const active = selectedDirection === d.direction;
                  const label = verdictLabel(verdicts?.[d.direction]);
                  const open = isOpenDirection(verdicts?.[d.direction]);
                  return (
                    <button
                      type="button"
                      key={d.direction}
                      aria-pressed={active}
                      disabled={!onSelectDirection}
                      onClick={() =>
                        onSelectDirection?.(active ? "ALL" : d.direction)
                      }
                      className={`flex items-baseline justify-between rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                        active
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-stone-200 bg-white dark:bg-stone-50 hover:bg-stone-50"
                      }`}
                    >
                      <span className="text-xs font-bold text-stone-700">
                        {DIRECTION_LABELS[d.direction] ?? d.direction}
                        {label && (
                          <span
                            className={`ml-1.5 text-[10px] font-bold ${
                              open ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {label}
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span className="block text-[11px] font-mono text-stone-700">
                          {unitManYen(d.medianUnitPriceSqm)}
                        </span>
                        <span className="block text-[10px] text-stone-600">
                          {d.count.toLocaleString()} 件
                        </span>
                      </span>
                    </button>
                  );
                })}
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
            {/* 何で絞っているかを一覧の上で言う。方位は頁全体の状態なので、
                ここで外せるようにする（上の札まで戻らなくてよい） */}
            {dirs && dirs.length > 0 && (
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-indigo-800">
                <span>
                  {`方位: ${dirs.map((d) => DIRECTION_LABELS[d] ?? d).join("・")}`}
                </span>
                {selectedDirection !== "ALL" && onSelectDirection && (
                  <button
                    type="button"
                    onClick={() => onSelectDirection("ALL")}
                    className="min-h-[24px] font-bold underline"
                  >
                    全方位に戻す
                  </button>
                )}
              </p>
            )}
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
                  <div className="flex flex-wrap gap-x-2 text-[10px] text-stone-600 mt-0.5">
                    <span>{r.propertyType ?? "種別不明"}</span>
                    {r.areaSqm !== null && <span>{r.areaSqm}㎡</span>}
                    <span>{unitManYen(r.unitPriceSqm)}</span>
                    <span>
                      {r.tradeYear}年Q{r.tradeQuarter}
                    </span>
                    {r.roadDirection && (
                      <span>
                        {r.roadDirection === "接面道路無"
                          ? "前面道路なし"
                          : `前面道路 ${r.roadDirection}`}
                        {r.roadClassification
                          ? `・${r.roadClassification}`
                          : ""}
                        {r.roadBreadthM != null ? ` ${r.roadBreadthM}m` : ""}
                      </span>
                    )}
                    {r.buildingRatio !== null && (
                      <span>
                        建物{Math.round(r.buildingRatio * 100)}%（建物
                        {manYen(r.estBuildingPrice)}・土地
                        {manYen(r.estLandPrice)}）
                      </span>
                    )}
                    <span className="text-stone-500 font-bold">
                      {DIRECTION_LABELS[r.direction] ?? r.direction}・
                      {r.distanceKm}km
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-stone-600 leading-relaxed">
            範囲内 {data.totalInRadius.toLocaleString()} 件
            {data.truncated ? "（多いため新しい順に切っています）" : ""}。
            {data.pendingCoords > 0
              ? `座標整備中の事例が全国に ${data.pendingCoords.toLocaleString()} 件あり、整備が進むとここに加わります。`
              : ""}
          </p>

          {/*
            ここは出発地の周りだけを方位別に見る口で、母数は半径の中に限られる。
            全国の水準（種類別・築年数別・都道府県別・地価公示との対比）は
            /relocation/purchase が持っている。同じ成約価格を扱う頁が 2 つ
            あるのにどちらからも互いを指していなかったので繋いだ。
          */}
          <a
            href="/relocation/purchase"
            className="block rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100"
          >
            全国の相場と比べる（種類別・築年数別・都道府県別）→
          </a>
        </>
      )}
    </div>
  );
}

export default TransactionsPanel;
