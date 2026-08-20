/**
 * 購入（成約価格）の相場分析で使う型と、集計の純粋な部分。
 *
 * ## なぜ事前集計なのか
 *
 * `property_transactions` は 1,948 MB ある。訪問のたびに集計はできない。
 * `marketStats.json`（家賃）と同じで、夜間に `scripts/build_purchase_stats.ts`
 * が集計して `src/data/purchaseStats.json` に書き、ページはそれを
 * **サーバー描画**するだけにする。
 *
 * 描画が静的になるので、検索エンジンにも中身が見える。いま索引されて
 * いるのは 878 URL 中 78 だけで、AdSense に「有用性の低いコンテンツ」で
 * 止められた経緯がある（`next-sitemap.config.js` の註）。**操作しないと
 * 何も出ない画面を増やさない**のは、その対策でもある。
 *
 * ## 分布の要約とヒストグラムは作らない
 *
 * `quantileSorted` / `summarizeDistribution` / `histogram` は
 * `utils/marketStats` に既にある。同じものを 2 か所に置かない
 * （CLAUDE.md 3 節）。ここに置くのは**購入に固有**の区分だけ。
 */
import type { DistributionSummary, HistogramBucket } from "@/utils/marketStats";

/** 築年数の区分。順序は `order` で持つ（文字列の並びに依存させない）。 */
export const BUILDING_AGE_BUCKETS = [
  { order: 0, label: "新築・築5年以内", maxAge: 5 },
  { order: 1, label: "築6〜10年", maxAge: 10 },
  { order: 2, label: "築11〜20年", maxAge: 20 },
  { order: 3, label: "築21〜30年", maxAge: 30 },
  { order: 4, label: "築31〜40年", maxAge: 40 },
  { order: 5, label: "築41年以上", maxAge: Infinity },
] as const;

/**
 * 成約年と建築年から築年数の区分を返す。
 *
 * どちらかが欠けていれば null。**0 で埋めない。**「築 0 年（新築）」と
 * 「建築年が分からない」は別のことで、混ぜると新築の中央値が狂う。
 *
 * 築年数が負（建築年 > 成約年）になる行が実データにある。青田売りや
 * 記載の揺れで、国交省のデータにも入っている。**捨てずに新築側へ寄せる**
 * （負の築年数という区分は作らない）。
 */
export function buildingAgeBucket(
  tradeYear: number | null | undefined,
  buildingYear: number | null | undefined,
): { order: number; label: string } | null {
  if (typeof tradeYear !== "number" || !Number.isFinite(tradeYear)) return null;
  if (typeof buildingYear !== "number" || !Number.isFinite(buildingYear)) {
    return null;
  }
  // 明らかに壊れている値は弾く。国交省のデータに 0 や 9999 が混ざる。
  if (buildingYear < 1800 || buildingYear > 2100) return null;
  if (tradeYear < 1800 || tradeYear > 2100) return null;

  const age = Math.max(0, tradeYear - buildingYear);
  for (const b of BUILDING_AGE_BUCKETS) {
    if (age <= b.maxAge) return { order: b.order, label: b.label };
  }
  return null;
}

/**
 * 建物比率（0〜1）を「土地寄り／建物寄り」の読みやすい区分に落とす。
 *
 * 利用者の依頼は「建物代が高いけど土地代は普通、で探したい」だった。
 * 比率そのものは 0.37 のような数字で、見ても手触りが無い。区分にする。
 */
export function buildingRatioBand(ratio: number | null | undefined): {
  order: number;
  label: string;
} | null {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return null;
  if (ratio < 0 || ratio > 1) return null;
  if (ratio < 0.2) return { order: 0, label: "ほぼ土地代（建物 20% 未満）" };
  if (ratio < 0.4) return { order: 1, label: "土地寄り（建物 20〜40%）" };
  if (ratio < 0.6) return { order: 2, label: "半々（建物 40〜60%）" };
  if (ratio < 0.8) return { order: 3, label: "建物寄り（建物 60〜80%）" };
  return { order: 4, label: "ほぼ建物代（建物 80% 以上）" };
}

/**
 * 分位点だけの要約。
 *
 * `DistributionSummary`（utils/marketStats）から**歪度と尖度を外した形**。
 * 新しい型を作らず Omit で引いている（CLAUDE.md 3 節）。
 *
 * 外したのは、SQL 側で出すと問い合わせが重くなる割に画面で使わないから。
 * **0 を入れて誤魔化さない。**歪度 0 は「左右対称」という具体的な主張で、
 * 「計算していない」とは別のこと。成約価格は高額側に裾が伸びるので、
 * 0 と書けば嘘になる。
 */
export type PriceSummary = Omit<DistributionSummary, "skewness" | "kurtosis">;

/** 種類別（中古マンション等・宅地(土地)…）の要約。 */
export interface PurchaseTypeStat {
  type: string;
  count: number;
  /** 総額（円）。 */
  price: PriceSummary | null;
  /** ㎡単価（円/㎡）。総額だけだと広さの違いで比べられない。 */
  unitPrice: PriceSummary | null;
}

export interface PurchaseAgeStat {
  order: number;
  label: string;
  count: number;
  medianUnitPrice: number;
}

export interface PurchaseRatioStat {
  order: number;
  label: string;
  count: number;
  medianPrice: number;
}

export interface PurchaseStructureStat {
  structure: string;
  count: number;
  medianUnitPrice: number;
}

export interface PurchasePrefectureStat {
  prefecture: string;
  count: number;
  medianUnitPrice: number;
  /** 建物比率の中央値。積算による推定なので実額ではない。 */
  medianBuildingRatio: number | null;
  /** 地価公示の㎡単価の中央値（land_price_points）。 */
  landPriceMedian: number | null;
  /**
   * 成約の㎡単価 ÷ 地価公示の㎡単価。
   *
   * 1 を超えるほど「公示地価より高く売買されている」。建物込みの
   * 成約価格と更地の公示地価を割るので**水準の比較には使えない**が、
   * 都道府県をまたいだ**相対の並び**は読める。
   */
  vsLandPrice: number | null;
}

export interface PurchaseYearPoint {
  year: number;
  count: number;
  medianUnitPrice: number;
}

export interface PurchaseStats {
  /** 一度も集計が走っていなければ null。ページはこれで準備中を出す。 */
  generatedAt: string | null;
  source: {
    /** 集計に使った行数（絞り込み後）。 */
    rows: number;
    /** うち座標が引けている行。地図に出せる上限。 */
    withCoords: number;
    /** 建物比率が出せている行。積算に要る項目が揃ったもの。 */
    withBuildingRatio: number;
    yearFrom: number | null;
    yearTo: number | null;
  };
  national: {
    byType: PurchaseTypeStat[];
    /** ㎡単価の分布。 */
    unitPriceHist: HistogramBucket[];
    /** 建物比率の分布（0〜1）。 */
    buildingRatioHist: HistogramBucket[];
    byAge: PurchaseAgeStat[];
    byRatioBand: PurchaseRatioStat[];
    byStructure: PurchaseStructureStat[];
  };
  prefectures: PurchasePrefectureStat[];
  yearly: PurchaseYearPoint[];
}

/** 集計が一度も走っていない状態。JSON の雛形と型を合わせる。 */
export const EMPTY_PURCHASE_STATS: PurchaseStats = {
  generatedAt: null,
  source: {
    rows: 0,
    withCoords: 0,
    withBuildingRatio: 0,
    yearFrom: null,
    yearTo: null,
  },
  national: {
    byType: [],
    unitPriceHist: [],
    buildingRatioHist: [],
    byAge: [],
    byRatioBand: [],
    byStructure: [],
  },
  prefectures: [],
  yearly: [],
};
