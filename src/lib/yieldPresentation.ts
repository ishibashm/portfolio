import { SEQUENTIAL_RAMP, rampColor } from "@/lib/panelPalette";

/**
 * 表面利回りの見せ方を決める。**色と閾値をここ 1 か所に置く。**
 *
 * 地図・凡例・一覧が別々に色を決めると、同じ利回りが場所によって
 * 違う色になる。実際に他の画面で起きた（#485〜#487）。
 *
 * ## 色は「順序尺度」を使う
 *
 * 利回りは**大きさ**なので、単一色相の薄→濃（SEQUENTIAL_RAMP）で表す。
 * 緑・赤は判定（吉凶）に予約してある色なので使わない。「利回りが高い＝
 * 良い」ではないことにも合っている。**高利回りは、その地域の価格が
 * 上がっていないという意味でもある。**良し悪しは読む人が決める。
 */

/**
 * 色の目盛りを固定する（年利）。
 *
 * **データに合わせて伸縮させない。**週次で集計し直すので、伸縮させると
 * 同じ 7% が先週と今週で違う色になる。実測（2026-08-22）の p10 が 4.87%、
 * p90 が 14.11% だったので、その外側で切りのよい 4%〜14% に置く。
 */
export const YIELD_DOMAIN_MIN = 0.04;
export const YIELD_DOMAIN_MAX = 0.14;

/** 区画 1 つの色。目盛りの外は端の色に張り付く。 */
export function yieldColor(grossYield: number): string {
  if (!Number.isFinite(grossYield)) return SEQUENTIAL_RAMP[0];
  const span = YIELD_DOMAIN_MAX - YIELD_DOMAIN_MIN;
  return rampColor((grossYield - YIELD_DOMAIN_MIN) / span);
}

/**
 * 都道府県のまとめを「そのまま読んでよい」とみなす区画数の下限。
 *
 * 区画 1 つは片側 5 件以上（MIN_SAMPLES_PER_SIDE）で作ってあるが、
 * **都道府県のまとめには下限が無かった。**実測で秋田県は区画 2 つ
 * しかなく、それで「秋田県の中央値」と出すのは弱すぎる。
 *
 * 10 区画なら賃貸 50 件・成約 50 件が下敷きになる。**隠さずに印を
 * 付ける。**数が少ないこと自体が「その県では取引が薄い」という情報で、
 * 消すとそれも消える。
 */
export const MIN_CELLS_FOR_PREFECTURE = 10;

export function isPrefectureReliable(cells: number): boolean {
  return cells >= MIN_CELLS_FOR_PREFECTURE;
}

/** 画面に出す文字列。年利を小数 1 桁の % に。 */
export function formatYield(grossYield: number): string {
  if (!Number.isFinite(grossYield)) return "—";
  return `${(grossYield * 100).toFixed(1)}%`;
}

/**
 * 凡例の見本。**目盛りと同じ関数から色を引く。**
 *
 * 凡例だけ別に色を書くと、目盛りを変えたときに凡例が取り残される。
 */
export const YIELD_LEGEND = [0.04, 0.06, 0.08, 0.11, 0.14].map((v) => ({
  value: v,
  label: formatYield(v),
  color: yieldColor(v),
}));

/**
 * 画面に必ず添える断り書き。
 *
 * **数字だけ出すと、根拠のある数字に見えてしまう。**元の制約は
 * src/utils/yieldStats.ts に書いてあるが、読むのは開発者だけなので
 * 画面用にここへ写す。増やすときは両方を直すこと。
 */
export const YIELD_CAVEATS = [
  "分子は募集賃料で、成約賃料ではありません。値下げ交渉やフリーレントがあるぶん、実際の利回りはこれより下がります。",
  "表面利回りです。管理費・修繕積立金・固定資産税・空室期間・仲介手数料を引いていません。実質はこれより数ポイント下がります。",
  "同じ部屋の賃料と売買価格ではなく、同じ地域の賃貸相場と売買相場を割っています。",
  "分母は中古マンションだけです。戸建や土地は㎡の意味が違うため外してあります。",
  "分子は構造で絞れません。木造アパートも RC マンションも混ざるため、利回りはやや低めに出ます。",
  "白い地域は「成約価格が無い」のではなく「賃貸を集めていない」場所です。",
] as const;
