/**
 * 移住先マップの点の見た目と、その凡例。両方をここから引く。
 *
 * QA #15「凡例の色と実際の点の色が一致しない」の原因は、凡例が点の描画とは別に
 * 書かれていて、片方だけ育っていたこと。点も凡例も同じ関数・同じ表から作る。
 *
 * 点は 2 つの軸を同時に表している。
 *   - 大きさ … 方位の吉凶（大吉 > 吉 > それ以外）
 *   - 色     … 一人当たり所得のグラデーション。ただし偏角警告があれば琥珀で上書き
 * 1 軸の一覧にすると「大吉かつ偏角警告（大きい琥珀の点）」がどの行にも当てはまらない。
 */

/**
 * API が返す astrologyStatus は "OPTIMAL + DECLINATION_WARNING,JUPITER_ASC" のような
 * 合成文字列（src/app/api/municipalities-wealth/route.ts）。
 * 以前は文字列全体に includes() をかけていたため、"NOISE_GOU + DECLINATION_WARNING" が
 * 「WARNING を含む」と見なされて凶方位なのに地図へ出ていた。基準値と付帯フラグを分ける。
 */
export function parseWealthStatus(raw: string): {
  status: string;
  flags: string[];
} {
  const [base, rest] = raw.split(" + ");
  return {
    status: (base ?? "").trim(),
    flags: rest ? rest.split(",").map((f) => f.trim()) : [],
  };
}

export interface WealthMarkerStyle {
  radius: number;
  opacity: number;
  /** "income" なら所得グラデーション、それ以外は色コードそのもの。 */
  fill: "income" | string;
  stroke: string | null;
  strokeWidth: number;
}

/** 地図に出す点の見た目。凶方位は出さないので null。 */
export function resolveWealthMarker(raw: string): WealthMarkerStyle | null {
  const { status, flags } = parseWealthStatus(raw);
  if (status.startsWith("NOISE")) return null;

  const isOptimal = status.startsWith("OPTIMAL");
  const isSafe = status === "SAFE";
  const hasDeclinationWarning = flags.includes("DECLINATION_WARNING");

  return {
    radius: isOptimal ? 6 : isSafe ? 4 : hasDeclinationWarning ? 3 : 2,
    opacity: isOptimal ? 0.9 : 0.6,
    fill: hasDeclinationWarning ? "#fbbf24" : "income",
    stroke: isOptimal ? "#fff" : hasDeclinationWarning ? "#f59e0b" : null,
    strokeWidth: isOptimal || hasDeclinationWarning ? 1 : 0,
  };
}

/** 凡例に出す見本。実際の点と同じ resolveWealthMarker から作る。 */
export const WEALTH_LEGEND_SAMPLES: {
  /** 見本を作るための astrologyStatus。 */
  sample: string;
  label: string;
}[] = [
  { sample: "OPTIMAL", label: "大吉方位（大きい・白フチ）" },
  { sample: "SAFE", label: "吉方位（中）" },
  { sample: "OPTIMAL + DECLINATION_WARNING", label: "偏角警告（琥珀）" },
];

export const WEALTH_LEGEND_NOTES = [
  "点の色は一人当たり所得。偏角警告があるときだけ琥珀で上書きされます",
  "凶方位の市区町村は地図に出ません",
];
