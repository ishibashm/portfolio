/**
 * 日の段階（S〜X）の型と表示名。
 *
 * auspiciousDays.ts から切り出した葉。中身も順序も変えていない。
 *
 * ## なぜ別ファイルか
 *
 * auspiciousDays は暦エンジン（lunar-javascript・astronomy-engine）を
 * 引く。段階の**名前だけ**要る client 部品（SpotVerdict など）が
 * auspiciousDays から TIER_LABELS を値で import すると、その部品を
 * 載せる頁の初回読み込みにエンジン一式（gzip で約 135 KB）が乗る。
 * 物件検索（/relocation/arbitrage）で実際にそうなっていた
 * （docs/improvement-backlog.md 17 節）。
 *
 * auspiciousDays は同じものを再輸出するので、既存の import 先は
 * そのまま動く。定義は 1 か所のまま。
 */
export type DayTier = "S" | "A" | "B" | "C" | "D" | "X";

export const TIER_ORDER: readonly DayTier[] = ["S", "A", "B", "C", "D", "X"];

export const TIER_LABELS: Record<DayTier, string> = {
  S: "三盤吉",
  A: "吉2盤・凶なし",
  B: "吉1盤・凶なし",
  C: "凶なし（平）",
  D: "軽い凶のみ",
  X: "五大凶殺あり",
};
