import type { PriceSummary } from "@/utils/purchaseStats";

/**
 * 表面利回りの集計。
 *
 * ## なぜこれが作れるのか
 *
 * このサイトは珍しく**両方**を持っている。
 *
 *   購入  property_transactions   国交省の成約価格 206 万件（実際に成立した額）
 *   賃貸  rental_properties       自前の収集 約 45 万件（募集賃料）
 *
 * 同じ場所の「年間の賃料」を「購入価格」で割れば表面利回りになる。
 * ポータルの利回りは**売主の希望価格**を分母にするが、こちらは
 * **成約価格が分母**。ここが決定的に違う。
 *
 * ## ㎡あたりで揃える
 *
 * 部屋の広さが違うと総額どうしは比べられない。両方を ㎡ あたりに直して
 * から割る。こうすると 1LDK と 3LDK が混ざっても崩れない。
 *
 *   表面利回り = (月額の㎡賃料 × 12) / 購入の㎡単価
 *
 * ## 正直に書かないといけないこと
 *
 * **1. 分子は募集賃料で、成約賃料ではない。**実際の成約はこれより下に
 * なることが多い（値下げ交渉・フリーレント）。**利回りは上振れする。**
 *
 * **2. 表面利回りであって実質ではない。**管理費・修繕積立金・固定資産税・
 * 空室期間・仲介手数料を引いていない。実質はこれより数ポイント下がる。
 *
 * **3. 別々の母集団を割っている。**同じ部屋の賃料と売買価格ではなく、
 * 同じ地域の賃貸相場と売買相場を割っている。地域の粒度が粗いほど誤差が
 * 大きい。
 *
 * これらを画面に書かずに数字だけ出すと、**根拠のある数字に見えてしまう。**
 */

/** 利回りを出すのに要る、片側ぶんの ㎡ 単価。 */
export interface SqmSide {
  /** 件数。少なすぎる区画は出さない判断に使う */
  n: number;
  /** ㎡ あたりの値。賃貸は月額（円/㎡/月）、購入は総額（円/㎡） */
  medianPerSqm: number;
}

/**
 * 区画 1 つぶんの利回り。
 *
 * grossYield が null なのは「片側が足りない」の意味。0 と区別する。
 * 0 は「賃料が 0」で、それは実際には起きない。
 */
export interface YieldCell {
  /** 区画の識別子。lat/lon を丸めた格子の番号 */
  cell: string;
  /** 区画の中心（描画用） */
  lat: number;
  lon: number;
  rental: SqmSide | null;
  purchase: SqmSide | null;
  /** 表面利回り（年、0〜1）。片側が無ければ null */
  grossYield: number | null;
}

/**
 * 区画の刻み（度）。
 *
 * 0.05 度は緯度で約 5.5km、経度で約 4.5km（日本の緯度）。市区町村より
 * 細かく、丁目より粗い。**これより細かくすると、片側の件数が足りない
 * 区画ばかりになる。**逆に粗いと、駅前と郊外が同じ区画に入って平均が
 * 意味を失う。
 */
export const CELL_DEGREES = 0.05;

/**
 * 座標を区画の識別子へ。
 *
 * **丸め方を 1 か所に閉じ込める。**賃貸と購入で別々に丸めると、境目の
 * 物件がずれた区画に入って、片側だけ件数が増える。
 */
export function cellIdFor(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`座標が数値でない: ${lat}, ${lon}`);
  }
  const y = Math.floor(lat / CELL_DEGREES);
  const x = Math.floor(lon / CELL_DEGREES);
  return `${y}:${x}`;
}

/** 区画の中心の座標。描画で使う。 */
export function cellCenter(cell: string): { lat: number; lon: number } {
  const [y, x] = cell.split(":").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(x)) {
    throw new Error(`区画の識別子が読めない: ${cell}`);
  }
  return {
    lat: (y + 0.5) * CELL_DEGREES,
    lon: (x + 0.5) * CELL_DEGREES,
  };
}

/**
 * 片側の件数がこれ未満の区画は利回りを出さない。
 *
 * 1 件の外れ値で区画全体の色が変わるのを防ぐ。中央値を使っていても、
 * n=1 なら中央値はその 1 件そのもの。
 */
export const MIN_SAMPLES_PER_SIDE = 5;

/**
 * 表面利回り。**年**で返す（0.06 なら 6%）。
 *
 * 片側が無い、件数が足りない、購入の単価が 0 以下、のいずれかなら null。
 * **0 を返さない。**0 は「賃料が 0」の意味になってしまい、「出せない」と
 * 区別がつかなくなる。
 */
export function grossYield(
  rental: SqmSide | null,
  purchase: SqmSide | null,
): number | null {
  if (!rental || !purchase) return null;
  if (rental.n < MIN_SAMPLES_PER_SIDE) return null;
  if (purchase.n < MIN_SAMPLES_PER_SIDE) return null;
  if (!(purchase.medianPerSqm > 0)) return null;
  if (!(rental.medianPerSqm > 0)) return null;
  return (rental.medianPerSqm * 12) / purchase.medianPerSqm;
}

/** 全国の集計。頁が読む形。 */
export interface YieldStats {
  /** 集計した時刻。null は「一度も走っていない」 */
  generatedAt: string | null;
  source: {
    rentalRows: number;
    purchaseRows: number;
    /** 両側が揃った区画の数 */
    cells: number;
    /** 購入側の対象年 */
    yearFrom: number | null;
    yearTo: number | null;
  };
  /** 利回りの分布（両側が揃った区画だけ） */
  distribution: PriceSummary | null;
  cells: YieldCell[];
  /** 都道府県ごとの中央値。地図を見る前の目安 */
  byPrefecture: {
    prefecture: string;
    cells: number;
    medianYield: number;
  }[];
}

/** 一度も走っていないときの形。頁はこれを見て「準備中」を出す。 */
export const EMPTY_YIELD_STATS: YieldStats = {
  generatedAt: null,
  source: {
    rentalRows: 0,
    purchaseRows: 0,
    cells: 0,
    yearFrom: null,
    yearTo: null,
  },
  distribution: null,
  cells: [],
  byPrefecture: [],
};
