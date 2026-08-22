/**
 * 認定住宅（長期優良・低炭素）だと、税制でいくら有利になるかを金額にする。
 *
 * ## なぜ作るか
 *
 * **どの物件が長期優良住宅かは、データからは分からない。**国交省の成約価格に
 * 認定の列は無く、そもそも所管行政庁の認定情報は個別物件では公開されない。
 * 販売資料に書いてあるかどうかで判断するしかない。
 *
 * だが「認定があると有利」で終わらせず、**いくら有利かを金額で出す**ことは
 * できる。制度の数字は公開されているので、物件価格と組み合わせれば計算できる。
 *
 * ## 数字は毎年変わる
 *
 * **年度を引数で受け取り、その年度の表が無ければ null を返す。**定数を
 * 埋め込んで放置すると、制度が変わった翌年から静かに嘘をつく。
 *
 * ここに入っている数字は **2026 年（令和 8 年）入居**を前提とした値で、
 * 一般向けの解説記事から取った。**国税庁の一次情報で必ず確認すること。**
 * 出典の性質上、細部が違う可能性がある。
 *
 * ## 出せるのは「上限の差」であって「実際の控除額」ではない
 *
 * 住宅ローン控除は「年末残高 × 0.7%」と「納めた所得税＋住民税の一部」の
 * **小さいほう**が実際の控除になる。所得が少ない人は上限まで使い切れない。
 *
 * **ここで出すのは最大値。**画面には必ずそう書くこと。「○○万円戻る」と
 * 読ませると、使い切れなかった人に嘘をついたことになる。
 */

/** この表が前提としている入居年。 */
export const BASIS_YEAR = 2026;

/** 住宅の性能区分。控除の上限がこれで変わる。 */
export type HousingGrade =
  /** 長期優良住宅・低炭素住宅 */
  | "certified"
  /** ZEH 水準省エネ住宅 */
  | "zeh"
  /** 省エネ基準適合住宅 */
  | "energy"
  /** どれにも当たらない */
  | "none";

/** 世帯の区分。子育て・若者夫婦世帯は上限が上乗せされる。 */
export type Household = "childRearing" | "general";

/**
 * 新築の借入限度額（円）。2026 年入居。
 *
 * **`none`（省エネ基準を満たさない新築）は 0。**控除そのものが受けられない。
 * 「少ない」ではなく「無い」なので、0 を入れて区別しない形にはしない。
 */
const NEW_BUILD_LIMIT: Record<HousingGrade, Record<Household, number>> = {
  certified: { childRearing: 50_000_000, general: 45_000_000 },
  zeh: { childRearing: 45_000_000, general: 35_000_000 },
  energy: { childRearing: 40_000_000, general: 30_000_000 },
  none: { childRearing: 0, general: 0 },
};

/**
 * 中古の借入限度額（円）。新築より枠が小さく、世帯による上乗せも無い。
 *
 * 認定・ZEH・省エネのいずれかなら 3,000 万、それ以外は 2,000 万。
 */
const USED_LIMIT: Record<HousingGrade, number> = {
  certified: 30_000_000,
  zeh: 30_000_000,
  energy: 30_000_000,
  none: 20_000_000,
};

/** 控除率。年末残高に掛ける。 */
const DEDUCTION_RATE = 0.007;

/** 控除の年数。新築 13 年 / 中古 10 年。 */
const YEARS_NEW = 13;
const YEARS_USED = 10;

/**
 * 不動産取得税の課税標準から引ける額（円）。
 * 長期優良住宅だけ 100 万円多い。
 */
const ACQUISITION_DEDUCTION_STANDARD = 12_000_000;
const ACQUISITION_DEDUCTION_CERTIFIED = 13_000_000;

/** 不動産取得税の税率（住宅）。 */
const ACQUISITION_TAX_RATE = 0.03;

export interface IncentiveInput {
  /** 入居する年。この表と合わなければ null を返す */
  year: number;
  grade: HousingGrade;
  household: Household;
  /** 新築か中古か */
  isNewBuild: boolean;
}

export interface IncentiveResult {
  /** 借入限度額（円） */
  loanLimit: number;
  /** 控除の年数 */
  years: number;
  /**
   * 控除の総額の**上限**（円）。
   *
   * 実際には納めた所得税等が頭打ちになるので、これより小さくなる人が多い。
   * **「戻る額」ではない。**
   */
  maxDeduction: number;
}

/**
 * 借入限度額と、控除総額の上限。
 *
 * 年度が表と合わなければ **null**。古い数字を黙って使わない。
 */
export function loanDeduction(input: IncentiveInput): IncentiveResult | null {
  if (input.year !== BASIS_YEAR) return null;

  const loanLimit = input.isNewBuild
    ? NEW_BUILD_LIMIT[input.grade][input.household]
    : USED_LIMIT[input.grade];
  const years = input.isNewBuild ? YEARS_NEW : YEARS_USED;

  return {
    loanLimit,
    years,
    maxDeduction: Math.round(loanLimit * DEDUCTION_RATE * years),
  };
}

/**
 * 認定を取っていない場合との**差**（円）。
 *
 * 比較の相手は「同じ世帯・同じ新築中古で、省エネ基準だけ満たす住宅」。
 * **`none` と比べない。**2024 年以降の新築は省エネ基準を満たさないと
 * 控除が 0 になるので、`none` と比べると差が大きく出すぎて実態と合わない。
 * いま新築で流通しているものは、少なくとも省エネ基準は満たしている。
 */
export function certifiedAdvantage(
  household: Household,
  isNewBuild: boolean,
  year: number = BASIS_YEAR,
): number | null {
  const certified = loanDeduction({
    year,
    grade: "certified",
    household,
    isNewBuild,
  });
  const baseline = loanDeduction({
    year,
    grade: "energy",
    household,
    isNewBuild,
  });
  if (!certified || !baseline) return null;
  return certified.maxDeduction - baseline.maxDeduction;
}

/**
 * 不動産取得税の差（円）。長期優良住宅は課税標準から 100 万円多く引ける。
 *
 * 100 万 × 3% = **3 万円**。金額としては小さいので、これだけを理由に
 * 認定物件を選ぶ話にはならない。**それも含めて正直に出す。**
 *
 * 低炭素住宅にはこの優遇が無い。長期優良住宅だけ。
 */
export function acquisitionTaxAdvantage(): number {
  return Math.round(
    (ACQUISITION_DEDUCTION_CERTIFIED - ACQUISITION_DEDUCTION_STANDARD) *
      ACQUISITION_TAX_RATE,
  );
}

/**
 * 固定資産税の減額が延びる年数。
 *
 * 新築住宅は税額が半分になる期間があり、長期優良住宅だとそれが延びる。
 *
 *   戸建て       3 年 → 5 年（2 年延長）
 *   マンション   5 年 → 7 年（2 年延長）
 *
 * **金額は出さない。**固定資産税は評価額で決まり、評価額は売買価格とは
 * 別物（建物の再建築価格から出る）。売出価格から推定すると、根拠の無い
 * 数字を根拠のある顔で出すことになる。**年数だけ伝えて、額は各自の
 * 課税明細で確かめてもらう。**
 */
export const PROPERTY_TAX_EXTRA_YEARS = 2;

/** 画面に出す出典の断り。数字と必ず一緒に出す。 */
export const INCENTIVE_DISCLAIMER = [
  `${BASIS_YEAR} 年（令和 ${BASIS_YEAR - 2018} 年）入居を前提とした数字です。税制は毎年変わります。`,
  "住宅ローン控除は「年末残高 × 0.7%」と「納めた所得税＋住民税の一部」の小さいほうが実際の控除額です。ここに出しているのは上限で、戻ってくる額ではありません。",
  "借入額が限度額に届かなければ、差はここまで大きくなりません。",
  "固定資産税の減額は年数だけ示しています。評価額は売買価格とは別物なので、金額は課税明細でご確認ください。",
  "不動産取得税の優遇は長期優良住宅のみで、低炭素住宅にはありません。",
  "最終的な判断は国税庁と所管行政庁の一次情報でご確認ください。",
];
