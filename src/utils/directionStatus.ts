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

import { worstNoise } from "@/utils/noiseSeverity";

export type LayerMode =
  | "final"
  | "year"
  | "month"
  | "day"
  | "year_month"
  | "month_day"
  | "year_day";

/**
 * 素の文字列を LayerMode に落とす。列挙外の値（壊れた保存値など）は
 * 既定の "final" に倒す。parseDirectionFilterMode と同じ約束。
 */
export function parseLayerMode(raw: string | null | undefined): LayerMode {
  switch (raw) {
    case "final":
    case "year":
    case "month":
    case "day":
    case "year_month":
    case "month_day":
    case "year_day":
      return raw;
    default:
      return "final";
  }
}

type Layer = { [dir: string]: string | undefined };

export interface DirectionLayers {
  yearLayer: Layer;
  monthLayer: Layer;
  dayLayer: Layer;
  finalVectors: Layer;
}

/**
 * 重い凶が 1 つでもあればそれを採る。
 *
 * 順序は noiseSeverity の NOISE_PRIORITY（五大凶殺が先頭）。以前は
 * このファイルが独自の順序を持ち、破を本命殺・的殺・天中殺方位より
 * 軽く扱っていた。エンジンの合成は破を五黄殺と同格の絶対格として
 * 扱うので、破と本命殺が同居する方位で、全統合表示と組み合わせ表示の
 * ラベルが食い違っていた。定義を一本化する。
 */
export function mergeStatuses(list: (string | undefined)[]): string {
  const valid = list.filter(Boolean) as string[];
  if (valid.length === 0) return "SAFE";
  // 月命殺・月命的殺を含め、優先表に無い凶も名前を保ったまま返る。
  // 一律 "NOISE" に潰すと地図のラベルも色も消えるため。
  const noise = worstNoise(valid);
  if (noise) return noise;
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

/**
 * 選んだ時間軸に対応する「方位ごとのステータス」をまとめて返す。
 *
 * `statusForLayerMode` の方位ぶん版。年・月・日の単独と全統合は、盤の
 * オブジェクトを**そのまま**返す（呼び出し側に
 * `activeVectors === finalVectors` で「全統合を見ているか」を判定する
 * 所があり、複製すると土用殺の方位が消える）。組み合わせは方位ごとに
 * `mergeStatuses` で畳んだ新しいオブジェクトを返す。
 *
 * これを置く前は、`layerMode === "year" ? yearLayer : … : finalVectors`
 * の写しが 6 か所（ホームの 3 部品・municipalities-wealth・
 * arbitrageAstro・relocation/export）にあり、**どれも組み合わせを
 * 知らなかった。**ホームで「年+月」を選ぶと、地図とヒートマップは
 * 合成を出すのに、同じ画面のスコアカード（API 経由）と目的地の札は
 * 全統合、TacticalMagneticMap は空、という食い違いが出ていた。
 */
export function vectorsForLayerMode(
  layers: DirectionLayers,
  mode: string,
): Layer {
  switch (mode) {
    case "year":
      return layers.yearLayer;
    case "month":
      return layers.monthLayer;
    case "day":
      return layers.dayLayer;
    case "year_month":
    case "month_day":
    case "year_day": {
      // 含む盤に出ている方位だけを作る。含まない盤の方位まで足すと
      // 「盤に無い方位は無い」という約束（statusForLayerMode の SAFE は
      // 引いたときの既定であって、方位を増やすものではない）が崩れる。
      const used =
        mode === "year_month"
          ? [layers.yearLayer, layers.monthLayer]
          : mode === "month_day"
            ? [layers.monthLayer, layers.dayLayer]
            : [layers.yearLayer, layers.dayLayer];
      const out: Layer = {};
      const dirs = new Set<string>(used.flatMap((l) => Object.keys(l)));
      for (const dir of dirs) out[dir] = statusForLayerMode(layers, dir, mode);
      return out;
    }
    default:
      // "final"（全統合）と知らない値。parseLayerMode と同じ倒し方。
      return layers.finalVectors;
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
