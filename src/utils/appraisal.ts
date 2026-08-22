import { quantileSorted } from "@/utils/marketStats";
import { CELL_DEGREES, cellIdFor } from "@/utils/yieldStats";

/**
 * 持ち込み査定 — 「この売出物件は高いのか安いのか」を成約から答える。
 *
 * ## なぜ売出価格を集めないのか
 *
 * ポータル（SUUMO・HOMES・アットホーム）は**規約で収集を禁じている。**
 * 一般開発者向けの公式 API も無い。continuous に売出価格を持つ正規の
 * 経路は事実上存在しない。
 *
 * **だが、買う側にとっては成約のほうが正しい。**売出価格は売主の希望額で、
 * そこには「3 か月売れ残って結局 300 万下げた物件」の最初の値段も入る。
 * 知りたいのは**いくらで決まったか**であって、いくらで出したかではない。
 *
 * 利用者が 1 件を手で入力して評価するのは収集ではないので、規約に触れない。
 *
 * ## 何をしているか
 *
 * 近所の・似た広さの・似た築年の成約を集めて、その ㎡ 単価の分布に
 * 売出価格を当てるだけ。**難しいことはしていない。**難しいのは、
 * 「近所」「似た」をどこまで緩めたかを**隠さずに出す**ほう。
 *
 * ## 点ではなく幅で出す
 *
 * 1 つの数字を出すと、その精度があるように見える。実際には同じ区画・
 * 同じ築年でも階と向きと管理状態で 2 割は動く。**四分位で出す。**
 *
 * ## 築年は「建築年」で合わせる
 *
 * 築年数（何年経ったか）ではなく西暦で合わせる。成約は過去の時点なので、
 * 築年数どうしを比べると**時点のずれが二重に入る。**2005 年築どうしなら、
 * いつ取引されたかに関係なく同じ世代の建物である。
 *
 * ## まだ入れていない補正
 *
 * **時点補正。**成約は 2023〜2025 年で、今日の水準ではない。国交省の
 * 不動産価格指数を掛ければ直せるが、まだ取り込んでいない。**入れるまでは
 * 「その時期の水準」だと画面に書くこと。**
 */

/** 査定にかける物件。利用者が入力する。 */
export interface SubjectProperty {
  lat: number;
  lon: number;
  /** 専有面積（㎡） */
  areaSqm: number;
  /** 建築年（西暦）。分からなければ null で、築年での絞り込みを外す */
  builtYear: number | null;
  /** 売出価格（円）。無ければ相場のレンジだけ出す */
  askingPrice: number | null;
}

/** 比較に使う成約 1 件。 */
export interface Comp {
  lat: number;
  lon: number;
  areaSqm: number;
  unitPriceSqm: number;
  builtYear: number | null;
  tradeYear: number;
}

/**
 * 比較に使う最低件数。
 *
 * 利回りの区画（MIN_SAMPLES_PER_SIDE）と同じ 5。1 件の外れ値で
 * 中央値がその 1 件そのものになるのを避ける。
 */
export const MIN_COMPS = 5;

/**
 * 条件の緩め方。**上から順に試して、5 件そろった段で止める。**
 *
 * どこまで緩めたかは必ず結果に載せる。「同じ区画・築年 ±5 年」で
 * 出した数字と「隣の区画まで含めて築年 ±20 年」で出した数字は、
 * 同じ顔をしていても意味が違う。
 */
export interface CompTier {
  /** 画面に出す説明 */
  label: string;
  /** 建築年の差（西暦、±） */
  builtYearTolerance: number;
  /** 面積の比（0.3 なら ±30%） */
  areaTolerance: number;
  /** 区画をいくつ外まで広げるか。0 なら同じ区画だけ */
  cellRadius: number;
}

export const COMP_TIERS: readonly CompTier[] = [
  {
    label: "同じ区画・築年 ±10 年・面積 ±30%",
    builtYearTolerance: 10,
    areaTolerance: 0.3,
    cellRadius: 0,
  },
  {
    label: "同じ区画・築年 ±20 年・面積 ±50%",
    builtYearTolerance: 20,
    areaTolerance: 0.5,
    cellRadius: 0,
  },
  {
    label: "隣の区画まで・築年 ±20 年・面積 ±50%",
    builtYearTolerance: 20,
    areaTolerance: 0.5,
    cellRadius: 1,
  },
  {
    label: "隣の区画まで・築年と面積は問わない",
    builtYearTolerance: Number.POSITIVE_INFINITY,
    areaTolerance: Number.POSITIVE_INFINITY,
    cellRadius: 1,
  },
];

/** 区画の識別子から格子の番号へ。cellIdFor と同じ丸めを使う。 */
function gridOf(lat: number, lon: number): { y: number; x: number } {
  const [y, x] = cellIdFor(lat, lon).split(":").map(Number);
  return { y, x };
}

/** その成約が、この段の条件に当てはまるか。 */
function matches(
  subject: SubjectProperty,
  comp: Comp,
  tier: CompTier,
  subjectGrid: { y: number; x: number },
): boolean {
  const grid = gridOf(comp.lat, comp.lon);
  if (Math.abs(grid.y - subjectGrid.y) > tier.cellRadius) return false;
  if (Math.abs(grid.x - subjectGrid.x) > tier.cellRadius) return false;

  if (!(comp.areaSqm > 0) || !(comp.unitPriceSqm > 0)) return false;
  if (Number.isFinite(tier.areaTolerance)) {
    const ratio = Math.abs(comp.areaSqm - subject.areaSqm) / subject.areaSqm;
    if (ratio > tier.areaTolerance) return false;
  }

  /*
    建築年が片方でも分からなければ、築年での絞り込みはしない。
    「分からない」を「合わない」に倒すと、古い成約が丸ごと落ちて
    件数が足りなくなる。
  */
  if (
    Number.isFinite(tier.builtYearTolerance) &&
    subject.builtYear !== null &&
    comp.builtYear !== null
  ) {
    if (
      Math.abs(comp.builtYear - subject.builtYear) > tier.builtYearTolerance
    ) {
      return false;
    }
  }
  return true;
}

export interface CompSelection {
  comps: Comp[];
  tier: CompTier | null;
}

/**
 * 条件を緩めながら、5 件そろう段を探す。
 *
 * **最後まで緩めても足りなければ、そこで諦める。**足りないまま出すより、
 * 「この場所は成約が少なくて出せない」と言うほうがよい。
 */
export function selectComps(
  subject: SubjectProperty,
  candidates: Comp[],
): CompSelection {
  const subjectGrid = gridOf(subject.lat, subject.lon);
  for (const tier of COMP_TIERS) {
    const comps = candidates.filter((c) =>
      matches(subject, c, tier, subjectGrid),
    );
    if (comps.length >= MIN_COMPS) return { comps, tier };
  }
  return { comps: [], tier: null };
}

export interface Appraisal {
  /** 使った成約の件数 */
  n: number;
  /** どこまで条件を緩めたか。画面にそのまま出す */
  tierLabel: string;
  /** 成約の ㎡ 単価（円/㎡） */
  perSqm: { p25: number; median: number; p75: number };
  /** 専有面積を掛けた推定総額（円） */
  price: { low: number; mid: number; high: number };
  /** 売出価格が入力されていれば、その位置づけ */
  asking: {
    price: number;
    perSqm: number;
    /** 成約のうち、この単価より安かった割合（0〜1） */
    ratioBelow: number;
    /** 中央値からの乖離（+0.1 なら 10% 高い） */
    gapFromMedian: number;
  } | null;
  /** 成約の時点。時点補正をまだしていないので、そのまま出す */
  tradeYears: { from: number; to: number };
}

/**
 * 査定する。5 件そろわなければ null。
 *
 * **0 や「相場並み」を返さない。**出せないときは出せないと言う。
 */
export function appraise(
  subject: SubjectProperty,
  candidates: Comp[],
): Appraisal | null {
  if (!(subject.areaSqm > 0)) return null;
  const { comps, tier } = selectComps(subject, candidates);
  if (!tier || comps.length < MIN_COMPS) return null;

  const sorted = comps.map((c) => c.unitPriceSqm).sort((a, b) => a - b);
  const p25 = quantileSorted(sorted, 0.25);
  const median = quantileSorted(sorted, 0.5);
  const p75 = quantileSorted(sorted, 0.75);

  const years = comps.map((c) => c.tradeYear);

  let asking: Appraisal["asking"] = null;
  if (subject.askingPrice !== null && subject.askingPrice > 0) {
    const perSqm = subject.askingPrice / subject.areaSqm;
    const below = sorted.filter((v) => v < perSqm).length;
    asking = {
      price: subject.askingPrice,
      perSqm,
      ratioBelow: below / sorted.length,
      gapFromMedian: median > 0 ? perSqm / median - 1 : 0,
    };
  }

  return {
    n: comps.length,
    tierLabel: tier.label,
    perSqm: { p25, median, p75 },
    price: {
      low: p25 * subject.areaSqm,
      mid: median * subject.areaSqm,
      high: p75 * subject.areaSqm,
    },
    asking,
    tradeYears: { from: Math.min(...years), to: Math.max(...years) },
  };
}

/**
 * 区画をまたいで成約を引くときの、緯度経度の幅。
 *
 * cellRadius の最大（1）ぶん外まで含める。SQL 側の絞り込みに使う。
 * ここを間違えると、隣の区画まで広げた段で候補が足りなくなる。
 */
export const CANDIDATE_DEGREES = CELL_DEGREES * 2;
