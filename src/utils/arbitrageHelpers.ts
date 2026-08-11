// Real Estate Arbitrage astrology and pin color helper functions

import { isFatalNoise } from "@/utils/noiseSeverity";
import { tierPinColors } from "@/utils/tierDisplay";

/**
 * 方位そのものの凶。空亡・月交点は「方位の凶」ではないので含めない。
 *
 * 判定は arbitrageAstro.ts にあったが、あちらは天体暦エンジンと
 * lunar-javascript を読み込むため、画面（クライアント）から使うには重すぎる。
 * 文字列を見るだけの純粋な判定なのでここに置き、あちらから再輸出している。
 */
export function isNoiseStatus(status: string): boolean {
  if (!status) return false;
  return (
    status.startsWith("NOISE") &&
    status !== "NOISE_VOID" &&
    status !== "NOISE_NODE"
  );
}

/**
 * 移転の可否として「避けるべき」に倒すべき判定か。
 *
 * isNoiseStatus は方位そのものの凶（五黄殺など）を見るもので、
 * 空亡・月交点は除外している。順位付けで下げる判断はそれより広く、
 * 天中殺（期間の禁止）と空亡も含める。
 */
export function isAvoidStatus(status: string): boolean {
  if (!status) return false;
  return (
    isNoiseStatus(status) ||
    status === "NOISE_TENCHU" ||
    status === "NOISE_VOID"
  );
}

/** カードと地図で共通して使う、おすすめ度の星数。 */
export function getRecommendationStarCount(
  score: number,
  status?: string,
): number {
  if (status && isAvoidStatus(status)) return 1;
  return score >= 80
    ? 5
    : score >= 70
      ? 4
      : score >= 60
        ? 3
        : score >= 50
          ? 2
          : 1;
}

/**
 * 物件ピンの色。
 *
 * @param tier その物件の方位の、選択日の三盤段階（S〜X）。渡されたときは
 *   色・ラベルは完全にこの段階で決まり、扇形・県塗り・時期パネルと同じ
 *   語彙（三盤吉/吉2盤/吉1盤/平/軽い凶/五大凶殺/天中殺）になる。
 *
 *   ピンの色は元々 astrologyStatus（サーバが layerMode ＝既定は年盤で
 *   出した単盤の判定）だけで決めていて、「超大吉・超吉・吉・警告・注意・
 *   大凶・通常」という独自の語彙だった。地図の扇形と時期パネルは三盤を
 *   合成した段階で判定するので、年盤だけ吉の方位が「赤い扇形の中に緑の
 *   ピン」として出るし、同じ地図の中に評価の言葉が 3 系統並ぶことに
 *   なっていた。同じ方位の同じ日の吉凶は物件によらず同一なので、ピンの
 *   吉凶も方位の段階そのもの。物件ごとの違い（条件の良さ）は星数と
 *   スコアが担い、盤ごとの内訳はポップアップに残る。
 * @param blocked 天中殺で塞がっている方位か。
 *
 * tier が無いとき（生年月日・出発地が未入力）だけ、従来どおり
 * astrologyStatus からの推定に落ちる。
 */
export const getPropertyPinColors = (
  prop: any,
  tier?: string,
  blocked?: boolean,
) => {
  if (tier || blocked) {
    const unified = tierPinColors(tier ?? "C", blocked);
    if (unified) return unified;
  }

  const targetDay = prop.dateScores?.[3];
  const isUltra = targetDay?.isUltraLucky;

  if (prop.astrologyStatus === "OPTIMAL_BOOST") {
    // 🌟 ゴールド（超大吉）
    return {
      fillColor: "#fbbf24",
      borderColor: "#b45309",
      textClass:
        "text-amber-500 dark:text-amber-400 font-extrabold animate-pulse",
      bgClass:
        "bg-amber-500/20 border-amber-500/40 shadow-[0_0_10px_rgba(251,191,36,0.5)]",
      label: "超大吉",
    };
  }

  if (prop.astrologyStatus === "WARNING") {
    // 🟧 オレンジ（警告・調整）
    return {
      fillColor: "#f97316",
      borderColor: "#7c2d12",
      textClass: "text-orange-500 dark:text-orange-400 font-semibold",
      bgClass: "bg-orange-500/10 border-orange-500/30",
      label: "警告",
    };
  }

  // 五大凶殺。定義は noiseSeverity.ts（時期スクリーニングの X と同じ集合）
  const isHeavyBad = isFatalNoise(prop.astrologyStatus);

  if (isHeavyBad) {
    // 🟥 赤（警告）
    return {
      fillColor: "#ef4444",
      borderColor: "#7f1d1d",
      textClass: "text-red-500 dark:text-red-400",
      bgClass: "bg-red-500/10 border-red-500/30",
      label: "大凶",
    };
  }

  const details = targetDay?.scoreDetails;
  const hasLightBad =
    (details && (details.doyouPenalty < 0 || details.voidPenalty < 0)) ||
    ["NOISE_VOID", "NOISE_NODE", "NOISE_GETSUMEI", "NOISE_GETSUTEKI"].includes(
      prop.astrologyStatus,
    );
  // SAFE を吉に数えていた。SAFE は「凶方位ではない」であって吉ではなく、
  // 判定の本体（auspiciousDays.isAuspicious）は OPTIMAL 系だけを吉とする。
  // ここが入っていたため、平穏な方位の物件に緑の「吉」ピンが立ち、
  // 同じ方位が記事では「平」と出ていた。落として既定（平穏）に流す。
  const hasLucky =
    prop.isTendo ||
    ["OPTIMAL", "OPTIMAL_REGULAR", "OPTIMAL_BOOST"].includes(
      prop.astrologyStatus,
    ) ||
    prop.astroFlags?.some((f: string) => f.endsWith("_LINE"));

  if (isUltra) {
    // 🌟 ゴールド（超吉）
    return {
      fillColor: "#fbbf24",
      borderColor: "#b45309",
      textClass: "text-amber-500 dark:text-amber-400 font-bold",
      bgClass: "bg-amber-500/10 border-amber-500/30",
      label: "超吉",
    };
  }

  if (hasLucky && !hasLightBad) {
    // 🟩 緑（吉）
    return {
      fillColor: "#10b981",
      borderColor: "#065f46",
      textClass: "text-emerald-500 dark:text-emerald-400",
      bgClass: "bg-emerald-500/10 border-emerald-500/30",
      label: "吉",
    };
  }

  if (hasLightBad) {
    // 🟨 黄（注意）
    return {
      fillColor: "#f59e0b",
      borderColor: "#78350f",
      textClass: "text-amber-600 dark:text-amber-500",
      bgClass: "bg-amber-500/5 border-amber-500/20",
      label: "注意",
    };
  }

  // ⬜ グレー（平穏・ネイビーグレー）➔ 地図と同化しないように境界線を濃く
  //
  // 「通常」と書いていたが、この段は SAFE と同じ「凶方位ではない」状態。
  // directionLabels の SAFE と同じ語にする。三盤で判定できるときは
  // tierPinColors 側が「平」と出すので、意味も揃う。
  return {
    fillColor: "#475569", // slate-600
    borderColor: "#1e293b", // slate-900
    textClass: "text-slate-500 dark:text-slate-400",
    bgClass: "bg-slate-500/10 border-slate-500/30",
    label: "平穏",
  };
};
