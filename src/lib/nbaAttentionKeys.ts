/**
 * 自己アテンション行列の**鍵（列）の並び**。
 *
 * `utils/nbaEngine` の `keys` と 1 対 1 で対応する。**片方だけ変えると
 * 列がずれる。**実際に #380 でずれた。
 *
 * #380 でヴェーダのティティ（月相）を鍵から抜き、エンジン側の添字は
 * 5 → 4 に直したが、**画面側の見出しを 6 列のまま残していた。**その結果、
 *
 *   「月相」の列に  宇宙（Kp）の値
 *   「宇宙」の列に  リスクの値
 *   「リスク」の列は 空
 *
 * が出ていた。既定値の配列も 6 個のままだった。
 *
 * 同じ事故を繰り返さないよう、**見出しも tooltip もこの 1 か所から引く。**
 * 数が合っているかは `__tests__/nbaAttentionKeys.test.ts` が
 * エンジンの出力と突き合わせて見張る。
 */
export const NBA_ATTENTION_KEYS = [
  { short: "年星", title: "Year Star" },
  { short: "月星", title: "Month Star" },
  { short: "日星", title: "Day Star" },
  { short: "宇宙", title: "Space Kp" },
  { short: "リスク", title: "VIX Risk" },
] as const;

/**
 * 行（問い）の並び。`queries` と対応する。
 *
 * **本命と月命の行は、点数には効いていない。**読まれているのは
 * `attentionMatrix[2][4]`（日主 → リスク）だけで、行 0・1 は計算して
 * 捨てられている。ここに出るのは表示用の数字。
 */
export const NBA_ATTENTION_QUERIES = ["本命", "月命", "日主"] as const;

/** 行列が来なかったときの見た目。均等（1/鍵の数）にする。 */
export const NBA_ATTENTION_FALLBACK = NBA_ATTENTION_KEYS.map(
  () => 1 / NBA_ATTENTION_KEYS.length,
);
