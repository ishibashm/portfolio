import type { CompassDirection } from "@/utils/directionGeo";
import { AstroEngine } from "@/utils/ephemerisEngine";
import { getZonedDateTimeFields } from "@/utils/solarTime";

/**
 * 風水（八宅）の判定。**九星気学とは独立した層。**
 *
 * ## 混ぜない
 *
 * 九星気学の点に足し合わせない。流派が違うものを足すと、**どちらの
 * 答えでもない数字**ができる。並べて出し、両方を見て利用者が決める。
 *
 * 評価に入れるかどうかも利用者が選ぶ。**既定は「入れない」。**
 * このサイトは長いあいだ「風水は使っていない」と案内してきたので、
 * 黙って混ぜると、以前と同じ入力で違う答えが出る人が生まれる。
 *
 * ## 八宅を選んだ理由
 *
 * 風水にはいくつも流派があるが、八宅は**人 → 方位 → 吉凶**という形で、
 * 九星気学とちょうど同じ土俵に乗る。並べて比べられる。
 *
 * 玄空飛星は建物の**坐向と建築期**が要る。いま持っていないので、
 * 物件側の情報が揃ってから別に足す。
 *
 * ## 本命卦には性別が要る
 *
 * 八宅は生年と性別で本命卦が決まる。**性別はクラウドに送らない。**
 * 端末にだけ置く（userSettings の SYNCED_FIELDS に入れない）。
 * 集めてしまった個人情報は消せないので、集めない側に倒す。
 */

/** 立春の太陽黄経。節年の始まり。 */
const LICHUN_LONGITUDE = 315;

/** 八卦。数字は洛書の定位（五は本命卦にならない）。 */
export type Gua = 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;

/** 八宅の遊星。吉 4 つと凶 4 つ。 */
export type YouXing =
  | "生気"
  | "天医"
  | "延年"
  | "伏位"
  | "絶命"
  | "五鬼"
  | "六殺"
  | "禍害";

/** 吉の 4 つ。ここに無ければ凶。 */
export const AUSPICIOUS_YOUXING: readonly YouXing[] = [
  "生気",
  "天医",
  "延年",
  "伏位",
];

export const GUA_NAME: Record<Gua, string> = {
  1: "坎",
  2: "坤",
  3: "震",
  4: "巽",
  6: "乾",
  7: "兌",
  8: "艮",
  9: "離",
};

/** 東四命（坎・離・震・巽）と西四命（坤・乾・兌・艮）。 */
export const EAST_GROUP: readonly Gua[] = [1, 9, 3, 4];
export const WEST_GROUP: readonly Gua[] = [2, 6, 7, 8];

export function guaGroup(gua: Gua): "東四命" | "西四命" {
  return EAST_GROUP.includes(gua) ? "東四命" : "西四命";
}

/**
 * 本命卦ごとの、方位 → 遊星の対応。**八宅の中核。**
 *
 * 出典は八宅の標準的な表。**この表が正しいことは、東四命／西四命の
 * 吉方位が決まった 4 方位になる、という性質で検算できる**
 * （__tests__/fengShuiEngine.test.ts）。写し間違えるとそこが落ちる。
 */
const YOUXING_TABLE: Record<Gua, Record<CompassDirection, YouXing>> = {
  // 坎（北）
  1: {
    SE: "生気",
    E: "天医",
    S: "延年",
    N: "伏位",
    SW: "絶命",
    NE: "五鬼",
    NW: "六殺",
    W: "禍害",
  },
  // 坤（南西）
  2: {
    NE: "生気",
    W: "天医",
    NW: "延年",
    SW: "伏位",
    N: "絶命",
    SE: "五鬼",
    S: "六殺",
    E: "禍害",
  },
  // 震（東）
  3: {
    S: "生気",
    N: "天医",
    SE: "延年",
    E: "伏位",
    W: "絶命",
    NW: "五鬼",
    SW: "六殺",
    NE: "禍害",
  },
  // 巽（南東）
  4: {
    N: "生気",
    S: "天医",
    E: "延年",
    SE: "伏位",
    NE: "絶命",
    SW: "五鬼",
    W: "六殺",
    NW: "禍害",
  },
  // 乾（北西）
  6: {
    W: "生気",
    NE: "天医",
    SW: "延年",
    NW: "伏位",
    S: "絶命",
    E: "五鬼",
    N: "六殺",
    SE: "禍害",
  },
  // 兌（西）
  7: {
    NW: "生気",
    SW: "天医",
    NE: "延年",
    W: "伏位",
    E: "絶命",
    N: "五鬼",
    SE: "六殺",
    S: "禍害",
  },
  // 艮（北東）
  8: {
    SW: "生気",
    NW: "天医",
    W: "延年",
    NE: "伏位",
    SE: "絶命",
    S: "五鬼",
    E: "六殺",
    N: "禍害",
  },
  // 離（南）
  9: {
    E: "生気",
    SE: "天医",
    N: "延年",
    S: "伏位",
    NW: "絶命",
    W: "五鬼",
    NE: "六殺",
    SW: "禍害",
  },
};

/** 遊星の意味。画面にそのまま出す。 */
export const YOUXING_MEANING: Record<YouXing, string> = {
  生気: "最も勢いのある方位。新しいことを始めるのに向く",
  天医: "健康と回復の方位。療養や立て直しに向く",
  延年: "人間関係と持続の方位。腰を据えるのに向く",
  伏位: "本命卦そのものの方位。穏やかで安定する",
  絶命: "八宅でもっとも避ける方位",
  五鬼: "揉め事や出費が起きやすいとされる方位",
  六殺: "人間関係のこじれが起きやすいとされる方位",
  禍害: "小さな障りが続きやすいとされる方位",
};

export type Sex = "male" | "female";

/**
 * 本命卦を出す。
 *
 * **年は立春基準。**1 月 1 日ではない。呼び出す側が立春で切った年を
 * 渡すこと（このサイトは ephemerisEngine が同じ切り方をしている）。
 *
 *   男性 1900 年代  (100 − 下2桁) mod 9
 *   男性 2000 年代  (99 − 下2桁) mod 9
 *   女性 1900 年代  (下2桁 − 4) mod 9
 *   女性 2000 年代  (下2桁 + 6) mod 9
 *
 * 余りが 0 なら 9。5 になった場合は本命卦にならないので、
 * **男性は 2（坤）、女性は 8（艮）**に振り替える。
 */
export function honmeiGua(year: number, sex: Sex): Gua {
  const yy = year % 100;
  const century2000 = year >= 2000;

  let n: number;
  if (sex === "male") {
    n = (((century2000 ? 99 - yy : 100 - yy) % 9) + 9) % 9;
  } else {
    n = (((century2000 ? yy + 6 : yy - 4) % 9) + 9) % 9;
  }
  if (n === 0) n = 9;
  if (n === 5) return sex === "male" ? 2 : 8;
  return n as Gua;
}

export interface FengShuiDirection {
  direction: CompassDirection;
  youxing: YouXing;
  auspicious: boolean;
  meaning: string;
}

export interface FengShuiReading {
  gua: Gua;
  guaName: string;
  group: "東四命" | "西四命";
  /** 8 方位ぶん。並びは directionGeo の COMPASS_DIRECTIONS と同じ順で返す */
  directions: FengShuiDirection[];
}

const ORDER: readonly CompassDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

/** その人にとっての 8 方位の見立て。 */
export function readFengShui(year: number, sex: Sex): FengShuiReading {
  const gua = honmeiGua(year, sex);
  const table = YOUXING_TABLE[gua];
  return {
    gua,
    guaName: GUA_NAME[gua],
    group: guaGroup(gua),
    directions: ORDER.map((direction) => {
      const youxing = table[direction];
      return {
        direction,
        youxing,
        auspicious: AUSPICIOUS_YOUXING.includes(youxing),
        meaning: YOUXING_MEANING[youxing],
      };
    }),
  };
}

/** 1 方位だけ引く。 */
export function fengShuiFor(
  year: number,
  sex: Sex,
  direction: CompassDirection,
): FengShuiDirection {
  const reading = readFengShui(year, sex);
  const found = reading.directions.find((d) => d.direction === direction);
  /* ORDER が 8 方位を網羅しているので、ここには来ない。 */
  if (!found) throw new Error(`方位が不正: ${direction}`);
  return found;
}

/**
 * 生年月日から本命卦に使う年を出す。**立春で切る。**
 *
 * 1 月 1 日で切ると、2 月上旬までに生まれた人の本命卦がひとつずれる。
 * 「よく年を間違える」の実体はこれで、暦の年ではなく節年で数える。
 *
 * 立春の判定は**太陽黄経 315 度**で行う。日付表を別に持たない。
 * 年盤の切り替わりも `ephemerisEngine` の太陽黄経から出ているので、
 * ここだけ別の暦を見ると、同じ人の年盤と本命卦が食い違う年が出る。
 *
 * 日本時間で読む。`Solar.fromDate` と同じ罠（実行環境のタイムゾーンで
 * 日付が変わる）を踏まないよう、`getZonedDateTimeFields(date, 9)` を通す。
 *
 * 1〜2 月の太陽黄経は 280〜333 度の範囲にしか来ないので、315 度との
 * 大小だけで立春の前後が決まる（黄経の折り返しをまたがない）。
 * 3〜12 月は必ず立春を過ぎているので、その年をそのまま使う。
 */
export function honmeiYearFor(birthDate: Date): number {
  const f = getZonedDateTimeFields(birthDate, 9);
  if (f.month > 2) return f.year;
  return AstroEngine.getSolarLongitude(birthDate) < LICHUN_LONGITUDE
    ? f.year - 1
    : f.year;
}
