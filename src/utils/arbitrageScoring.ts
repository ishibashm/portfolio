/**
 * Real Estate Arbitrage Scanner の評価軸。
 *
 * もともと総合スコアは「方位 0.4 : ㎡単価の偏差値 0.6」の 2 軸固定だった。
 * 2 軸しかないので、駅から遠い・狭い・築古といった条件が総合点に一切現れず、
 * 「割安だが住めない物件」と「相場並みだが条件が良い物件」を並べても区別が
 * つかなかった。重みも固定なので、通勤重視の人と開運重視の人が同じ順位表を
 * 見ることになる。
 *
 * ここでは判断の角度を 9 軸に分け、重みを呼び出し側から差し替えられるように
 * する。軸の計算はすべて純関数にしてあり、API（母集団統計を持つ側）で算出し、
 * 重み付けの合成は画面側で行う。こうすると重みを変えても再スキャンが要らず、
 * 同じ候補集合を別の角度から見直せる。
 *
 * すべての軸は 0〜100 で、50 が「母集団の真ん中」。
 */

export type AxisKey =
  | "value"
  | "localValue"
  | "astrology"
  | "access"
  | "proximity"
  | "space"
  | "building"
  | "market"
  | "cost";

export const AXIS_ORDER: AxisKey[] = [
  "value",
  "localValue",
  "astrology",
  "access",
  "proximity",
  "space",
  "building",
  "market",
  "cost",
];

export interface AxisMeta {
  /** 画面に出す軸名 */
  label: string;
  /** テーブル見出しなど幅の狭い場所用 */
  short: string;
  /** 何を測っているか。ツールチップに出す */
  hint: string;
}

export const AXIS_META: Record<AxisKey, AxisMeta> = {
  value: {
    label: "広域割安度",
    short: "割安",
    hint: "検索条件に合う全物件の㎡単価と比べてどれだけ安いか（偏差値）。50 が相場並み。",
  },
  localValue: {
    label: "近隣割安度",
    short: "近隣",
    hint: "同じ市区町村の㎡単価の中央値と比べた安さ。広域だと都心と郊外が混ざるため、同じ街の中での歪みを見る。サンプルが少ない地域では算出しない。",
  },
  astrology: {
    label: "方位・吉凶",
    short: "方位",
    hint: "出発地から見た方位と暦（九星気学・天中殺・月相・天体ライン）による判定。",
  },
  access: {
    label: "駅アクセス",
    short: "駅",
    hint: "最寄駅までの徒歩分数。3 分以内で 100、20 分で 30 程度。未取得の物件では算出しない。",
  },
  proximity: {
    label: "現住地から近い",
    short: "近さ",
    hint: "出発地からの直線距離の近さ。生活圏を維持したい場合に上げ、遠くへ移りたい場合は下げる。",
  },
  space: {
    label: "広さ",
    short: "広さ",
    hint: "専有面積の偏差値と、間取りから見た 1 室あたりの面積を合成した居住スペースの余裕。",
  },
  building: {
    label: "建物・築年",
    short: "建物",
    hint: "築年数を主体に、所在階（1 階・地下は減点）と新築フラグを加味した建物条件。",
  },
  market: {
    label: "市場妙味",
    short: "妙味",
    hint: "掲載の新しさと、掲載している仲介会社の少なさ（＝まだ広く出回っていない出物か）。",
  },
  cost: {
    label: "予算適合",
    short: "予算",
    hint: "設定した月額予算に対する総家賃の収まり具合。予算未設定のときは算出しない。",
  },
};

/** 物件 1 件分の軸別スコア。データが無い軸は null にして合成から外す。 */
export type AxisScores = Partial<Record<AxisKey, number | null>>;

export type AxisWeights = Record<AxisKey, number>;

export interface WeightPreset {
  id: string;
  label: string;
  description: string;
  weights: AxisWeights;
}

function w(partial: Partial<AxisWeights>): AxisWeights {
  const base = {} as AxisWeights;
  for (const key of AXIS_ORDER) base[key] = 0;
  return { ...base, ...partial };
}

/**
 * 意思決定の型ごとの重み。合計 1 に揃えてあるが、
 * 合成時にも欠損軸を除いて正規化するので厳密である必要はない。
 */
export const WEIGHT_PRESETS: WeightPreset[] = [
  {
    id: "balanced",
    label: "バランス",
    description: "割安さ・方位・住みやすさを均等に見る既定の配分。",
    weights: w({
      value: 0.18,
      localValue: 0.14,
      astrology: 0.2,
      access: 0.14,
      proximity: 0.04,
      space: 0.12,
      building: 0.12,
      market: 0.06,
      cost: 0.0,
    }),
  },
  {
    id: "bargain",
    label: "割安重視",
    description: "市場の歪みだけを取りにいく。裁定機会の発見用。",
    weights: w({
      value: 0.34,
      localValue: 0.3,
      astrology: 0.08,
      access: 0.08,
      space: 0.06,
      building: 0.04,
      market: 0.1,
    }),
  },
  {
    id: "fortune",
    label: "開運重視",
    description: "方位と暦を最優先し、条件面は補助的に見る。",
    weights: w({
      astrology: 0.55,
      value: 0.13,
      localValue: 0.08,
      access: 0.08,
      space: 0.06,
      building: 0.06,
      market: 0.04,
    }),
  },
  {
    id: "commute",
    label: "通勤・利便",
    description: "駅の近さと生活圏の維持を最優先する。",
    weights: w({
      access: 0.4,
      proximity: 0.16,
      value: 0.14,
      localValue: 0.08,
      astrology: 0.08,
      space: 0.07,
      building: 0.07,
    }),
  },
  {
    id: "family",
    label: "広さ・住環境",
    description: "面積と建物条件を厚く見る。家族での住み替え向け。",
    weights: w({
      space: 0.32,
      building: 0.24,
      access: 0.12,
      value: 0.1,
      localValue: 0.07,
      astrology: 0.1,
      proximity: 0.05,
    }),
  },
  {
    id: "quality",
    label: "築浅・建物重視",
    description: "築年数と所在階を最重要視する。設備の新しさ優先。",
    weights: w({
      building: 0.42,
      space: 0.18,
      access: 0.14,
      value: 0.1,
      localValue: 0.06,
      astrology: 0.1,
    }),
  },
  {
    id: "budget",
    label: "家計重視",
    description: "月額予算に収まるかを最優先する。予算の設定が前提。",
    weights: w({
      cost: 0.38,
      value: 0.18,
      localValue: 0.14,
      access: 0.1,
      space: 0.08,
      building: 0.07,
      astrology: 0.05,
    }),
  },
  {
    id: "hidden",
    label: "穴場発掘",
    description: "まだ広く出回っていない新着・低掲載の出物を拾う。",
    weights: w({
      market: 0.34,
      localValue: 0.24,
      value: 0.16,
      access: 0.1,
      space: 0.06,
      building: 0.05,
      astrology: 0.05,
    }),
  },
];

export const DEFAULT_PRESET_ID = "balanced";

export function getPreset(id: string): WeightPreset {
  return (
    WEIGHT_PRESETS.find((p) => p.id === id) ??
    WEIGHT_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  );
}

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 偏差値。母集団のばらつきが 0（全件同額など）のときは差が無いので 50 を返す。
 * invert を立てると「小さいほど高得点」になる。㎡単価はこちら。
 */
export function tScore(
  value: number,
  mean: number,
  stdDev: number,
  invert = false,
): number {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) return 50;
  if (!Number.isFinite(stdDev) || stdDev === 0) return 50;
  const z = (value - mean) / stdDev;
  const t = 50 + (invert ? -z : z) * 10;
  return clamp(t);
}

/** 徒歩分数。3 分以内を満点にし、20 分で 30 台、40 分で 0 まで落とす。 */
export function scoreStationAccess(minutes: number | null | undefined): number | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return null;
  }
  if (minutes <= 3) return 100;
  return clamp(100 - (minutes - 3) * 3.8);
}

/**
 * 出発地からの近さ。同一市内で収まる 5km 圏を満点に、50km で 0 にする。
 * 「遠いほど良い」と考える使い方もあるので、重み 0 で切れるようにしてある。
 */
export function scoreProximity(distanceKm: number | null | undefined): number | null {
  if (
    distanceKm === null ||
    distanceKm === undefined ||
    !Number.isFinite(distanceKm)
  ) {
    return null;
  }
  if (distanceKm <= 5) return 100;
  return clamp(100 - (distanceKm - 5) * (100 / 45));
}

/**
 * 間取り文字列から居室数を推定する。"2LDK" → 2、"1R"/"ワンルーム" → 1。
 * L/D/K は居室として数えない（面積の按分に使うため）。
 */
export function parseLayoutRooms(layout: string | null | undefined): number | null {
  if (!layout) return null;
  const normalized = layout.replace(/\s/g, "");
  if (/ワンルーム|^1?R$/.test(normalized)) return 1;
  const m = normalized.match(/(\d+)\s*[SLDKR]/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0 && n < 20) return n;
  }
  return null;
}

/**
 * 所在階。"3階" → 3、"地下1階"/"B1階" → -1。
 * 「2階以上」「-」のような表記は数値化できないので null。
 */
export function parseFloorNumber(floor: string | null | undefined): number | null {
  if (!floor) return null;
  const normalized = floor.replace(/\s/g, "");
  const basement = normalized.match(/(?:地下|B)(\d+)/i);
  if (basement) return -parseInt(basement[1], 10);
  const above = normalized.match(/(\d+)\s*階/);
  if (above) return parseInt(above[1], 10);
  const bare = normalized.match(/^(\d+)$/);
  if (bare) return parseInt(bare[1], 10);
  return null;
}

/**
 * 広さ。母集団の中での面積の偏差値を主にしつつ、1 室あたり面積で補正する。
 * 面積だけだと 3LDK が常に有利になり、単身向けの中での広い部屋が沈む。
 */
export function scoreSpace(
  sizeSqm: number | null | undefined,
  layout: string | null | undefined,
  meanSqm: number,
  stdDevSqm: number,
): number | null {
  if (sizeSqm === null || sizeSqm === undefined || !Number.isFinite(sizeSqm)) {
    return null;
  }
  const areaScore = tScore(sizeSqm, meanSqm, stdDevSqm);
  const rooms = parseLayoutRooms(layout);
  if (rooms === null) return clamp(areaScore);
  const perRoom = sizeSqm / rooms;
  // 1 室 12 ㎡（6 畳強）を 50、22 ㎡ を 100 に置く。
  const perRoomScore = clamp(50 + (perRoom - 12) * 5);
  return clamp(areaScore * 0.6 + perRoomScore * 0.4);
}

/**
 * 建物条件。築年数を主体に、1 階・地下を減点、2 階以上をわずかに加点する。
 * 築年数が未取得なら判定材料が無いので null（合成から外れる）。
 */
export function scoreBuilding(
  buildingAge: number | null | undefined,
  floor: string | null | undefined,
  isNewBuild: boolean | null | undefined,
): number | null {
  if (
    buildingAge === null ||
    buildingAge === undefined ||
    !Number.isFinite(buildingAge)
  ) {
    return null;
  }
  // 新築 100、築 10 年 78、築 20 年 56、築 30 年 34、築 45 年で下限。
  let score = clamp(100 - buildingAge * 2.2, 5, 100);
  const floorNum = parseFloorNumber(floor);
  if (floorNum !== null) {
    if (floorNum <= 0) score -= 12;
    else if (floorNum === 1) score -= 10;
    else if (floorNum >= 3) score += 6;
    else score += 3;
  }
  if (isNewBuild) score += 8;
  return clamp(score);
}

/**
 * 市場妙味。新着ほど、また掲載している仲介会社が少ないほど高い。
 * 長く残っている物件・十数社が同時に出している物件は、既に検討され尽くしている。
 */
export function scoreMarket(
  firstSeenAt: Date | string | null | undefined,
  listingCount: number | null | undefined,
  now: Date = new Date(),
): number | null {
  let newness: number | null = null;
  if (firstSeenAt) {
    const first = firstSeenAt instanceof Date ? firstSeenAt : new Date(firstSeenAt);
    const days = (now.getTime() - first.getTime()) / (24 * 60 * 60 * 1000);
    if (Number.isFinite(days)) {
      // 掲載 0 日 100、7 日 86、30 日 55、90 日 20、150 日で下限。
      newness = clamp(100 - Math.max(0, days) * 0.62, 5, 100);
    }
  }

  let exclusivity: number | null = null;
  if (
    listingCount !== null &&
    listingCount !== undefined &&
    Number.isFinite(listingCount) &&
    listingCount > 0
  ) {
    // 1 社独占 100、4 社 55、10 社 0 付近。
    exclusivity = clamp(100 - (listingCount - 1) * 15);
  }

  if (newness === null && exclusivity === null) return null;
  if (newness === null) return exclusivity;
  if (exclusivity === null) return newness;
  return clamp(newness * 0.65 + exclusivity * 0.35);
}

/**
 * 予算適合。予算の 70% 以下なら満点、ちょうど予算で 60、45% 超過で 0。
 * 予算が未設定なら「軸として使わない」意味で null。
 */
export function scoreCost(
  totalRent: number | null | undefined,
  budgetYen: number | null | undefined,
): number | null {
  if (
    !budgetYen ||
    !Number.isFinite(budgetYen) ||
    budgetYen <= 0 ||
    totalRent === null ||
    totalRent === undefined ||
    !Number.isFinite(totalRent)
  ) {
    return null;
  }
  const ratio = totalRent / budgetYen;
  if (ratio <= 0.7) return 100;
  return clamp(100 - (ratio - 0.7) * (100 / 0.75));
}

/** 近隣相場の比較に必要な最低サンプル数。これを割ると中央値が偶然で動く。 */
export const LOCAL_VALUE_MIN_SAMPLES = 8;

/**
 * 同じ市区町村の㎡単価中央値に対する安さ。
 * 中央値ちょうどで 50、33% 安で 100、33% 高で 0。
 */
export function scoreLocalValue(
  propSqmRent: number | null | undefined,
  medianSqmRent: number | null | undefined,
  sampleCount: number | null | undefined,
): number | null {
  if (
    !propSqmRent ||
    !medianSqmRent ||
    !Number.isFinite(propSqmRent) ||
    !Number.isFinite(medianSqmRent) ||
    medianSqmRent <= 0
  ) {
    return null;
  }
  if (!sampleCount || sampleCount < LOCAL_VALUE_MIN_SAMPLES) return null;
  const discount = (medianSqmRent - propSqmRent) / medianSqmRent;
  return clamp(50 + discount * 150);
}

export interface ComposedScore {
  /** 重み付き平均した総合スコア（0〜100）。 */
  score: number;
  /**
   * 重みのうち実際にデータがあった割合（0〜1）。
   * 低いほど「一部の軸だけで付けた点」であることを示す。
   */
  coverage: number;
  /** 軸ごとの総合スコアへの寄与（正規化後の重み × 軸スコア）。 */
  contributions: Partial<Record<AxisKey, number>>;
  /** データが無くて合成から外れた軸。 */
  missing: AxisKey[];
}

/**
 * 軸スコアと重みから総合スコアを出す。
 *
 * 欠損軸は「0 点」ではなく「評価対象外」として扱い、残りの重みで正規化する。
 * 0 点にすると駅徒歩が未取得なだけの物件が最下位に沈み、データの欠けを
 * 物件の劣位と取り違える。
 */
export function composeScore(
  axes: AxisScores,
  weights: Partial<AxisWeights>,
): ComposedScore {
  let weightedSum = 0;
  let usedWeight = 0;
  let totalWeight = 0;
  const contributions: Partial<Record<AxisKey, number>> = {};
  const missing: AxisKey[] = [];

  for (const key of AXIS_ORDER) {
    const weight = weights[key] ?? 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    const value = axes[key];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      missing.push(key);
      continue;
    }
    weightedSum += weight * value;
    usedWeight += weight;
  }

  if (usedWeight === 0) {
    return { score: 0, coverage: 0, contributions, missing };
  }

  for (const key of AXIS_ORDER) {
    const weight = weights[key] ?? 0;
    const value = axes[key];
    if (weight <= 0 || value === null || value === undefined) continue;
    contributions[key] = (weight / usedWeight) * value;
  }

  return {
    score: clamp(weightedSum / usedWeight),
    coverage: totalWeight === 0 ? 0 : usedWeight / totalWeight,
    contributions,
    missing,
  };
}

/** スライダーの値（0〜100 の整数）を重みに直す。合計 0 なら既定に戻す。 */
export function slidersToWeights(sliders: Partial<Record<AxisKey, number>>): AxisWeights {
  const total = AXIS_ORDER.reduce((sum, key) => sum + Math.max(0, sliders[key] ?? 0), 0);
  if (total <= 0) return getPreset(DEFAULT_PRESET_ID).weights;
  const result = {} as AxisWeights;
  for (const key of AXIS_ORDER) {
    result[key] = Math.max(0, sliders[key] ?? 0) / total;
  }
  return result;
}

/** 重みをスライダー表示用の 0〜100 に戻す。 */
export function weightsToSliders(weights: AxisWeights): Record<AxisKey, number> {
  const max = Math.max(...AXIS_ORDER.map((key) => weights[key] ?? 0));
  const result = {} as Record<AxisKey, number>;
  for (const key of AXIS_ORDER) {
    result[key] = max <= 0 ? 0 : Math.round(((weights[key] ?? 0) / max) * 100);
  }
  return result;
}

/**
 * 候補の絞り込み方。
 *
 * DB 全件をスコアリングするわけにはいかないので、SQL 側で上位 N 件に切る。
 * これまでは㎡単価の安い順だけだったため、重みを「駅アクセス重視」に変えても
 * 候補集合は割安順のままで、駅近の物件が最初から入っていなかった。
 * 抽出の角度もここで選べるようにする。
 */
export const CANDIDATE_STRATEGIES = [
  {
    id: "value",
    label: "割安順",
    description: "㎡単価の安い順に候補を集める。裁定機会の探索に最も直結する。",
  },
  {
    id: "balanced",
    label: "総合バランス順",
    description:
      "㎡単価・築年数・駅徒歩・面積の順位を合成して候補を集める。特定の軸に偏らない。",
  },
  {
    id: "newest",
    label: "築浅順",
    description: "築年数の浅い順。建物条件を重く見るときの候補集めに向く。",
  },
  {
    id: "spacious",
    label: "広い順",
    description: "専有面積の広い順。広さを重く見るときの候補集めに向く。",
  },
  {
    id: "station",
    label: "駅近順",
    description: "駅徒歩の短い順。通勤利便を重く見るときの候補集めに向く。",
  },
  {
    id: "fresh",
    label: "新着順",
    description: "掲載開始の新しい順。まだ動かれていない出物を拾う。",
  },
] as const;

export type CandidateStrategy = (typeof CANDIDATE_STRATEGIES)[number]["id"];

export const DEFAULT_CANDIDATE_STRATEGY: CandidateStrategy = "value";

export function isCandidateStrategy(value: string): value is CandidateStrategy {
  return CANDIDATE_STRATEGIES.some((s) => s.id === value);
}
