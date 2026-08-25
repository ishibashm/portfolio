/**
 * 配色を目で見ずに検査するための計算。
 *
 * `docs/site-spec.md` は「色を変えるときは必ず検証スクリプトに掛ける」と
 * 決めているが、**掛ける先がリポジトリに無かった**（`scripts/validate_palette.js`
 * は履歴を遡っても存在しない）。規則はあるのに実行できないので、実際には
 * 誰も掛けられなかった。ここに計算だけを置いて、検証はテストで自動的に回す。
 *
 * 見るのは 2 つだけ。**どちらも「隣り合う色を見分けられるか」**で、
 * 段階の意味が色の違いに乗っているこのサイトでは、ここが崩れると
 * 「大吉」と「吉」が同じ色になる。実際に起きている（site-spec 3.4：
 * S と A が実測 ΔE 5.4 で、文字ラベルの無い地図の扇形では区別できなかった）。
 *
 *   通常の視覚   OKLab の距離 ×100 が 15 以上
 *   色覚多様性   1 型・2 型を模した色で 8 以上
 *
 * ΔE は OKLab 上のユークリッド距離を 100 倍したもの。OKLab は
 * 「距離が見た目の差に比例する」ように作られた色空間なので、
 * RGB の差や色相の差より当てになる。
 *
 * 色覚の模擬は Machado, Oliveira & Fernandes (2009) の重症度 1.0 の行列。
 * **模擬の仕方と閾値は対になっている**ので、行列を差し替えるなら閾値も
 * 測り直すこと。
 */

/** 通常の視覚で、隣り合う色に必要な最小の ΔE。 */
export const NORMAL_DELTA_E_FLOOR = 15;

/** 1 型・2 型色覚を模した色で、隣り合う色に必要な最小の ΔE。 */
export const CVD_DELTA_E_FLOOR = 8;

/** Machado ほか (2009) の重症度 1.0。線形 RGB に掛ける。 */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

export type CvdKind = keyof typeof MACHADO;

/** `#rrggbb` を線形 RGB（0〜1）にする。 */
function linearRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`色は #rrggbb で書くこと: ${hex}`);
  const n = parseInt(m[1], 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return [channels[0], channels[1], channels[2]];
}

/** 線形 RGB を OKLab にする。 */
function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** 色覚多様性を模した線形 RGB を返す。0〜1 に丸める。 */
function simulate(
  rgb: [number, number, number],
  kind: CvdKind,
): [number, number, number] {
  const M = MACHADO[kind];
  const clamp = (c: number) => Math.min(1, Math.max(0, c));
  return [
    clamp(M[0][0] * rgb[0] + M[0][1] * rgb[1] + M[0][2] * rgb[2]),
    clamp(M[1][0] * rgb[0] + M[1][1] * rgb[1] + M[1][2] * rgb[2]),
    clamp(M[2][0] * rgb[0] + M[2][1] * rgb[1] + M[2][2] * rgb[2]),
  ];
}

/**
 * 2 色の見た目の差。OKLab のユークリッド距離 ×100。
 *
 * `kind` を渡すとその色覚で見た場合の差になる。渡さなければ通常の視覚。
 */
export function deltaE(a: string, b: string, kind?: CvdKind): number {
  const toLab = (hex: string) => {
    const rgb = linearRgb(hex);
    return oklab(kind ? simulate(rgb, kind) : rgb);
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * 色覚多様性で見たときの差。**1 型と 2 型の悪いほう**を返す。
 *
 * 片方だけで判断すると、もう片方で潰れている組を見逃す。
 */
export function worstCvdDeltaE(a: string, b: string): number {
  return Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"));
}

export interface AdjacentCheck {
  from: string;
  to: string;
  normal: number;
  cvd: number;
  ok: boolean;
}

/**
 * 並びの隣り合う組をすべて調べる。
 *
 * 段階（S→A→B→C→D→X）のように**順序のある色**は、隣どうしが
 * 見分けられれば足りる。離れた段は元々別の色になっている。
 */
export function checkAdjacent(colors: readonly string[]): AdjacentCheck[] {
  const out: AdjacentCheck[] = [];
  for (let i = 0; i + 1 < colors.length; i++) {
    const normal = deltaE(colors[i], colors[i + 1]);
    const cvd = worstCvdDeltaE(colors[i], colors[i + 1]);
    out.push({
      from: colors[i],
      to: colors[i + 1],
      normal,
      cvd,
      ok: normal >= NORMAL_DELTA_E_FLOOR && cvd >= CVD_DELTA_E_FLOOR,
    });
  }
  return out;
}
