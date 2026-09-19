import {
  directionLabelName,
  haLabelForLayer,
  type BoardLayer,
} from "@/lib/directionLabels";
import { isFatalNoise, isNoise } from "@/utils/noiseSeverity";

/**
 * **なぜその方位が塞がっているか**を、1 日 × 1 方位につき 2 文字の符号で持つ。
 *
 * 時期の走査（API の mode=timeline）は方位ごとに段階（S〜X）しか返して
 * いなかった。段階の名前は「五大凶殺あり」までで、**本命殺なのか五黄殺
 * なのかを画面が言えない。**同行者の帯で「私（東）が 506 日『五大凶殺
 * あり』」と出ても、それが年盤の本命的殺（＝その気学年は待っても戻ら
 * ない）だとは伝わらず、天中殺が入っているのではと推測させた
 * （利用者報告 2026-09-19）。
 *
 * 符号は `盤 + 凶` の 2 文字。盤は y/m/d、凶は下の表。転送量は段階と
 * 同じ桁（730 日 × 8 方位 × 2 文字）。
 *
 * **年盤 → 月盤 → 日盤の順で、最初に見つかった凶を採る。**年盤の凶は
 * その気学年のあいだ日取りでは戻らないので、いちばん先に言うべき理由。
 * 五大凶殺（段階 X の理由）を軽い凶（段階 D の理由）より先に採る。
 *
 * `auspiciousDays` は暦エンジンを引くので、ここは葉（`directionLabels` と
 * `noiseSeverity` だけ）にして、画面の側が名前に戻すときにエンジンを
 * 載せずに済むようにする。
 */

const LAYER_OF_CODE: Record<string, BoardLayer> = {
  y: "year",
  m: "month",
  d: "day",
};

const LAYER_NAME: Record<string, string> = {
  y: "年盤",
  m: "月盤",
  d: "日盤",
};

/** 凶 → 1 文字。ここに無い NOISE_* は "?"（名前は「凶」に戻す）。 */
const NOISE_CODE: Record<string, string> = {
  NOISE_GOU: "G",
  NOISE_ANKEN: "A",
  NOISE_HA: "H",
  NOISE_HONMEI: "M",
  NOISE_TEKI: "T",
  NOISE_VOID: "V",
  NOISE_NODE: "N",
  NOISE_DOYO: "Y",
  NOISE_GETSUMEI: "E",
  NOISE_GETSUTEKI: "F",
};

const NOISE_OF_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(NOISE_CODE).map(([status, code]) => [code, status]),
);

/**
 * 3 盤の状態から符号を作る。凶が無ければ空文字。
 *
 * 五大凶殺を先に、次に軽い凶を、それぞれ年→月→日の順で探す。
 */
export function encodeBlockCause(
  yearLayer: string | undefined,
  monthLayer: string | undefined,
  dayLayer: string | undefined,
): string {
  const layers: [string, string | undefined][] = [
    ["y", yearLayer],
    ["m", monthLayer],
    ["d", dayLayer],
  ];
  for (const pick of [isFatalNoise, isNoise]) {
    for (const [layer, status] of layers) {
      if (pick(status)) return layer + (NOISE_CODE[status!] ?? "?");
    }
  }
  return "";
}

/**
 * 符号 → 「年盤の本命殺」のような名前。読めない符号は空文字。
 *
 * 破は盤で名前が変わる（歳破・月破・日破）ので `haLabelForLayer` に任せる。
 */
export function decodeBlockCause(code: string | undefined): string {
  if (!code || code.length !== 2) return "";
  const layerName = LAYER_NAME[code[0]];
  if (!layerName) return "";
  const status = NOISE_OF_CODE[code[1]];
  if (!status) return code[1] === "?" ? `${layerName}の凶` : "";
  const noise =
    status === "NOISE_HA"
      ? haLabelForLayer(LAYER_OF_CODE[code[0]])
      : directionLabelName(status);
  return `${layerName}の${noise}`;
}
