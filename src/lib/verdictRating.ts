import { isFatalNoise } from "@/utils/noiseSeverity";

/**
 * 方位の判定を「大吉／吉／平穏／注意／凶／大凶」の 6 語に畳む、唯一の実装。
 *
 * 引越しシミュレータ（relocation/simulator）と移動履歴（api/relocation/history）が
 * 同じ内容の switch 文をそれぞれ持っていた。写しなので文言は揃っていたが、
 * 重さの付け方が凶の唯一の定義（utils/noiseSeverity）と食い違っていた。
 *
 *   本命殺・本命的殺 … 五大凶殺なのに「凶」(-30) に格下げされていた
 *   天中殺方位       … 五大凶殺ではないのに「大凶」(-100) に格上げされていた
 *
 * 五大凶殺は「移転で妥協しない集合」と定義されている（noiseSeverity.ts:18-24）。
 * 本命殺の方位が、時期分析では最悪の X なのにシミュレータでは中位の「凶」、
 * 逆に天中殺方位が時期分析では D なのにシミュレータでは「大凶」、という
 * 逆転が起きていた。ここで isFatalNoise に寄せて向きを揃える。
 *
 * SAFE を「普通」ではなく「平穏」にしてあるのは directionLabels に合わせるため。
 * SAFE は「凶方位ではない」であって吉ではない。
 *
 * 色は Tailwind のクラスをそのまま返す。呼び出し側の見た目は変えない。
 */

export type VerdictRating = "大吉" | "吉" | "平穏" | "注意" | "凶" | "大凶";

export interface RatingDetails {
  rating: VerdictRating;
  /** 並べ替えと合成に使う点。大きいほど良い */
  score: number;
  color: string;
}

const OPTIMAL: RatingDetails = {
  rating: "大吉",
  score: 100,
  color: "text-emerald-400 border border-emerald-500/30 bg-emerald-500/10",
};

const GOOD: RatingDetails = {
  rating: "吉",
  score: 50,
  color: "text-emerald-500/80 border border-emerald-500/20 bg-emerald-500/5",
};

const NEUTRAL: RatingDetails = {
  rating: "平穏",
  score: 0,
  color: "text-stone-500 border border-stone-200/80 bg-stone-100/80",
};

const CAUTION: RatingDetails = {
  rating: "注意",
  score: -10,
  color: "text-amber-400 border border-amber-500/20 bg-amber-500/5",
};

/** 二次凶（天中殺方位・月命殺・月命的殺・月交点） */
const BAD: RatingDetails = {
  rating: "凶",
  score: -30,
  color: "text-orange-400 border border-orange-500/20 bg-orange-500/5",
};

/** 五大凶殺（五黄殺・暗剣殺・破・本命殺・本命的殺） */
const FATAL: RatingDetails = {
  rating: "大凶",
  score: -100,
  color: "text-red-400 border border-red-500/30 bg-red-500/10",
};

export function ratingForStatus(status: string): RatingDetails {
  if (isFatalNoise(status)) return FATAL;

  switch (status) {
    case "OPTIMAL":
      return OPTIMAL;
    case "OPTIMAL_REGULAR":
    case "OPTIMAL_BOOST":
      return GOOD;
    case "WARNING":
      return CAUTION;
    case "SAFE":
      return NEUTRAL;
    default:
      // 五大凶殺以外の NOISE_*（天中殺方位・月命殺・月命的殺・月交点）。
      // 知らないコードを画面に出さないため、既定は平穏に倒す。
      return status.startsWith("NOISE") ? BAD : NEUTRAL;
  }
}
