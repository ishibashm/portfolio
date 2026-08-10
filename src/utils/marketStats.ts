/**
 * 家賃市場の計量分析。株式の定量分析で常用される道具を家賃に当てる。
 *
 *   ヘドニック回帰（OLS）    … ファクターモデル。家賃を広さ・築年・駅徒歩に
 *                              分解し、説明しきれない残差を「割安・割高」と読む
 *   対数正規フィット         … 家賃分布は右に裾を引く。株価と同じく対数で扱う
 *   分位点・歪度・尖度       … 分布の形。平均だけでは市場は読めない
 *   Kaplan-Meier 生存曲線    … 掲載がどれだけ速く消えるか＝市場の流動性。
 *                              現役の掲載は「まだ消えていない」打ち切りとして
 *                              正しく扱う（消えた物件だけで平均すると偏る）
 *   変動係数（CV）           … 市区町村ごとの価格のばらつき＝ボラティリティ
 *
 * ここには純粋な計算だけを置く。DB からの取り出しは
 * scripts/build_market_stats.ts、表示は /relocation/market。
 * 計算はすべてテストで検証できる形にする。
 */

/** 逐次追加できる OLS の正規方程式。行を保持せず X'X と X'y だけ持つ */
export class OlsAccumulator {
  /** 説明変数の数（定数項を含む） */
  readonly k: number;
  private xtx: number[][];
  private xty: number[];
  private _n = 0;
  private sumY = 0;
  private sumY2 = 0;

  constructor(k: number) {
    this.k = k;
    this.xtx = Array.from({ length: k }, () => Array(k).fill(0));
    this.xty = Array(k).fill(0);
  }

  /** x は定数項 1 を先頭に含めた長さ k のベクトル */
  add(x: number[], y: number): void {
    for (let i = 0; i < this.k; i++) {
      for (let j = i; j < this.k; j++) {
        this.xtx[i][j] += x[i] * x[j];
      }
      this.xty[i] += x[i] * y;
    }
    this._n += 1;
    this.sumY += y;
    this.sumY2 += y * y;
  }

  /** 別の accumulator を吸収する（県ごとの結果を全国へ合流するため） */
  merge(other: OlsAccumulator): void {
    if (other.k !== this.k) throw new Error("k mismatch");
    for (let i = 0; i < this.k; i++) {
      for (let j = i; j < this.k; j++) this.xtx[i][j] += other.xtx[i][j];
      this.xty[i] += other.xty[i];
    }
    this._n += other._n;
    this.sumY += other.sumY;
    this.sumY2 += other.sumY2;
  }

  get n(): number {
    return this._n;
  }

  /**
   * 係数と決定係数を解く。標本が変数より少ない・多重共線で解けないときは null。
   * R² は残差平方和から出す（TSS - b'X'y の恒等式）。
   */
  solve(): { beta: number[]; r2: number; n: number } | null {
    if (this._n <= this.k) return null;
    // 上三角しか埋めていないので対称に複製してから消去する
    const a = this.xtx.map((row, i) =>
      row.map((v, j) => (j >= i ? v : this.xtx[j][i])),
    );
    const b = [...this.xty];
    const k = this.k;
    // 部分ピボット付きガウス消去
    for (let col = 0; col < k; col++) {
      let pivot = col;
      for (let r = col + 1; r < k; r++) {
        if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
      }
      if (Math.abs(a[pivot][col]) < 1e-10) return null;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
      for (let r = col + 1; r < k; r++) {
        const f = a[r][col] / a[col][col];
        for (let c = col; c < k; c++) a[r][c] -= f * a[col][c];
        b[r] -= f * b[col];
      }
    }
    const beta = Array(k).fill(0);
    for (let r = k - 1; r >= 0; r--) {
      let s = b[r];
      for (let c = r + 1; c < k; c++) s -= a[r][c] * beta[c];
      beta[r] = s / a[r][r];
    }
    // R² = 1 - SSR/TSS。SSR = y'y - b'X'y（正規方程式の恒等式）
    const ssr =
      this.sumY2 - beta.reduce((acc, bi, i) => acc + bi * this.xty[i], 0);
    const tss = this.sumY2 - (this.sumY * this.sumY) / this._n;
    const r2 = tss > 0 ? Math.max(0, Math.min(1, 1 - ssr / tss)) : 0;
    return { beta, r2, n: this._n };
  }

  predict(beta: number[], x: number[]): number {
    return beta.reduce((acc, b, i) => acc + b * x[i], 0);
  }
}

/** ソート済み配列の分位点（線形補間）。空なら NaN */
export function quantileSorted(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface DistributionSummary {
  n: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  /** 標準偏差（標本） */
  sd: number;
  /** 変動係数 sd/mean。市場のボラティリティとして読む */
  cv: number;
  /** 歪度。正なら右に裾（高額側に外れ値） */
  skewness: number;
  /** 超過尖度。正なら裾が厚い */
  kurtosis: number;
}

export function summarizeDistribution(
  values: number[],
): DistributionSummary | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n < 2) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((a, x) => a + x, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of v) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const sd = Math.sqrt((m2 * n) / (n - 1));
  return {
    n,
    mean,
    median: quantileSorted(sorted, 0.5),
    p10: quantileSorted(sorted, 0.1),
    p25: quantileSorted(sorted, 0.25),
    p75: quantileSorted(sorted, 0.75),
    p90: quantileSorted(sorted, 0.9),
    sd,
    cv: mean !== 0 ? sd / mean : NaN,
    skewness: m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0,
    kurtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0,
  };
}

export interface HistogramBucket {
  /** バケット下端 */
  x0: number;
  x1: number;
  count: number;
}

/** 固定幅ヒストグラム。範囲外は端のバケットに寄せる */
export function histogram(
  values: number[],
  min: number,
  max: number,
  buckets: number,
): HistogramBucket[] {
  const width = (max - min) / buckets;
  const out: HistogramBucket[] = Array.from({ length: buckets }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const idx = Math.min(
      buckets - 1,
      Math.max(0, Math.floor((v - min) / width)),
    );
    out[idx].count += 1;
  }
  return out;
}

export interface SurvivalPoint {
  /** 経過日数 */
  day: number;
  /** その日数まで掲載が残っている確率 */
  survival: number;
}

/**
 * Kaplan-Meier 推定。
 *
 * durationDays: 掲載期間（日）。event=true は「掲載が消えた」観測、
 * false は「まだ掲載中」（右打ち切り）。打ち切りを落とすと長く残る物件を
 * 過小評価するので、必ず含めて渡すこと。
 */
export function kaplanMeier(
  observations: { duration: number; event: boolean }[],
  maxDay = 120,
): { curve: SurvivalPoint[]; medianDays: number | null } {
  const obs = observations
    .filter((o) => Number.isFinite(o.duration) && o.duration >= 0)
    .sort((a, b) => a.duration - b.duration);
  if (obs.length === 0) return { curve: [], medianDays: null };

  let atRisk = obs.length;
  let s = 1;
  let i = 0;
  const curve: SurvivalPoint[] = [{ day: 0, survival: 1 }];
  let medianDays: number | null = null;

  // 同じ日数の event をまとめて処理する
  while (i < obs.length) {
    const t = obs[i].duration;
    let events = 0;
    let censored = 0;
    while (i < obs.length && obs[i].duration === t) {
      if (obs[i].event) events += 1;
      else censored += 1;
      i += 1;
    }
    if (events > 0 && atRisk > 0) {
      s *= 1 - events / atRisk;
      if (t <= maxDay) curve.push({ day: t, survival: s });
      if (medianDays === null && s <= 0.5) medianDays = t;
    }
    atRisk -= events + censored;
  }
  return { curve, medianDays };
}

/** 中心移動平均ではなく後方移動平均。時系列の直近値を潰さないため */
export function trailingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 生成する JSON の形。スクリプトとページの両方がこの型を使う           */
/* ------------------------------------------------------------------ */

export interface HedonicModel {
  /** [定数項, log(size), 築年, 駅徒歩] — 目的変数は log(総家賃) */
  beta: number[];
  r2: number;
  n: number;
  /** 係数の読み下し（%表示用に変換済み） */
  effects: {
    /** 広さ弾力性: 面積+10% で家賃何% 上がるか */
    sizeElasticityPct: number;
    /** 築 1 年で何 % 下がるか */
    agePctPerYear: number;
    /** 駅徒歩 1 分で何 % 下がるか */
    stationPctPerMin: number;
  };
}

export interface PrefectureStats {
  prefecture: string;
  n: number;
  rent: DistributionSummary;
  sqmRent: DistributionSummary;
  hedonic: HedonicModel | null;
  /** 残差（log 家賃の実測 − 理論値）のヒストグラム。x は % 換算 */
  residualHist: HistogramBucket[];
  residual: DistributionSummary | null;
}

export interface MunicipalityVolatility {
  municipality: string;
  prefecture: string;
  n: number;
  medianSqmRent: number;
  /** ㎡単価の変動係数。高い＝同じ町でも価格がばらつく＝掘り出しが出やすい */
  cv: number;
  iqrPct: number;
}

/** 家賃指数の 1 点。MarketDailySummary から日次で積む */
export interface RentIndexPoint {
  date: string;
  n: number;
  medianRent: number;
  medianSqmRent: number;
}

export interface MarketStats {
  generatedAt: string | null;
  totalListings: number;
  /**
   * 全国の家賃指数の推移（㎡単価中央値・直近180日）。
   * 蓄積は MarketDailySummary テーブル。導入日から積み始めるので、
   * 最初は点が少ない。
   */
  rentIndexSeries: RentIndexPoint[];
  national: {
    rentHist: HistogramBucket[];
    rent: DistributionSummary | null;
    sqmRent: DistributionSummary | null;
    hedonic: HedonicModel | null;
    residualHist: HistogramBucket[];
  };
  /** 直近 90 日の新規掲載数（株価の出来高に相当） */
  dailyNewListings: { date: string; count: number }[];
  /** 掲載の生存曲線（流動性）。日数と残存確率 */
  survival: { curve: SurvivalPoint[]; medianDays: number | null; n: number };
  prefectures: PrefectureStats[];
  volatilityRanking: MunicipalityVolatility[];
}

export function buildHedonicModel(acc: OlsAccumulator): HedonicModel | null {
  const solved = acc.solve();
  if (!solved) return null;
  const [, bSize, bAge, bStation] = solved.beta;
  return {
    beta: solved.beta,
    r2: solved.r2,
    n: solved.n,
    effects: {
      // log-log なので弾力性。面積 +10% の効果 = (1.1^bSize - 1)
      sizeElasticityPct: (Math.pow(1.1, bSize) - 1) * 100,
      // 半対数なので exp(b) - 1
      agePctPerYear: (Math.exp(bAge) - 1) * 100,
      stationPctPerMin: (Math.exp(bStation) - 1) * 100,
    },
  };
}

/** ヘドニック回帰の説明変数ベクトルを 1 か所で定義する */
export function hedonicX(
  sizeSqm: number,
  buildingAge: number,
  stationMin: number,
): number[] {
  return [1, Math.log(sizeSqm), buildingAge, stationMin];
}
