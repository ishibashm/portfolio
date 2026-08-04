/**
 * 方位ごとの吉凶ステータスを、選んだ時間軸（年・月・日とその組み合わせ）で 1 つに畳む。
 *
 * 地図とヒートマップは同じ「時間軸」ボタンを共有しているのに、畳み方を別々に
 * 持っていた。地図は 年+月 / 月+日 / 年+日 を実際に合成していたが、
 * ヒートマップ側（filterVectors）は年・月・日の単独しか見ておらず、
 * 組み合わせを渡されると黙って「全統合」を返していた。
 *
 * 実測（2026-08-04・既定プロフィール）では、年+日 を選んだとき 8 方位のうち 2 方位で
 * 地図とヒートマップの判定が食い違っていた（東: 地図=本命的殺 / ヒートマップ=暗剣殺、
 * 西: 地図=本命殺 / ヒートマップ=五黄殺）。月盤の五黄・暗剣が他の凶を覆い隠すため、
 * 月盤を外した途端に差が出る。年+月 と 月+日 はたまたま結果が一致していたので、
 * 特定の組み合わせでしか露見しない。
 *
 * 両方がこのファイルを使うことで、時間軸の解釈が 1 か所になる。
 */

export type LayerMode =
  | "final"
  | "year"
  | "month"
  | "day"
  | "year_month"
  | "month_day"
  | "year_day";

type Layer = { [dir: string]: string | undefined };

export interface DirectionLayers {
  yearLayer: Layer;
  monthLayer: Layer;
  dayLayer: Layer;
  finalVectors: Layer;
}

/**
 * 重い凶が 1 つでもあればそれを採る。
 * 順序は「避けるべき度合い」で、五黄殺・暗剣殺が最も重い。
 */
const PRIORITY = [
  "NOISE_GOU",
  "NOISE_ANKEN",
  "NOISE_HONMEI",
  "NOISE_TEKI",
  "NOISE_VOID",
  "NOISE_HA",
  "NOISE_NODE",
];

export function mergeStatuses(list: (string | undefined)[]): string {
  const valid = list.filter(Boolean) as string[];
  if (valid.length === 0) return "SAFE";
  for (const p of PRIORITY) {
    if (valid.includes(p)) return p;
  }
  // 月命殺・月命的殺のように優先順表に載っていない凶。以前はここで一律 "NOISE" に
  // 潰していたため、単独の盤なら「月命的殺」と出るものが、組み合わせにした途端に
  // 名前を失っていた。名前を残す。
  const otherNoise = valid.find((s) => s.startsWith("NOISE"));
  if (otherNoise) return otherNoise;
  if (valid.includes("OPTIMAL")) return "OPTIMAL";
  if (valid.includes("OPTIMAL_REGULAR")) return "OPTIMAL_REGULAR";
  return "SAFE";
}

/** 選んだ時間軸に対応する、その方位のステータス。 */
export function statusForLayerMode(
  layers: DirectionLayers,
  dir: string,
  mode: string,
): string {
  switch (mode) {
    case "year":
      return layers.yearLayer[dir] || "SAFE";
    case "month":
      return layers.monthLayer[dir] || "SAFE";
    case "day":
      return layers.dayLayer[dir] || "SAFE";
    case "year_month":
      return mergeStatuses([layers.yearLayer[dir], layers.monthLayer[dir]]);
    case "month_day":
      return mergeStatuses([layers.monthLayer[dir], layers.dayLayer[dir]]);
    case "year_day":
      return mergeStatuses([layers.yearLayer[dir], layers.dayLayer[dir]]);
    default:
      // "final"（全統合）。合成済みの値をそのまま使う。
      return layers.finalVectors[dir] || "SAFE";
  }
}

export const ALL_LAYER_MODES: LayerMode[] = [
  "final",
  "year",
  "month",
  "day",
  "year_month",
  "month_day",
  "year_day",
];
