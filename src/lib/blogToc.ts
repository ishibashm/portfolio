/**
 * 記事の目次。本文の Markdown から h2 を抜き出す。
 *
 * 記事ページは本文を 70ch で折り返すので、1700px の器では右側が空く。
 * CLAUDE.md 3 節の方針は「器を狭めず、目次を横に置いて 2 段にする」。
 * その目次の元をここで作る。
 *
 * 対象は h2 だけ。h3 まで載せると、この記事群（h3 は流派の分岐の
 * 小見出し程度）では行数ばかり増えて一覧性が落ちる。
 *
 * id の作り方は 1 か所に置く。描画側（BlogArticleBody の h2）と目次側で
 * 別々に作ると、アンカーが微妙にずれて「押しても飛ばない目次」になる。
 */

export type BlogHeading = { id: string; text: string };

/** 見出しの文字列 → アンカー id。描画側と目次側の両方がこれを使う。 */
export function headingId(text: string): string {
  // 空白だけ潰す。日本語はそのまま使える（フラグメントは Unicode 可）。
  // ローマ字化などの変換を挟むと、変換表の違いで描画側とずれる。
  return text.trim().replace(/\s+/g, "-");
}

/** 本文から h2 を順に抜き出す。コードブロックの中は見ない。 */
export function extractHeadings(body: string): BlogHeading[] {
  const out: BlogHeading[] = [];
  let inFence = false;

  for (const line of body.split("\n")) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // "## " だけ。"###" は 3 文字目が # なので \s に当たらない。
    const m = line.match(/^##\s+(.+)$/);
    if (!m) continue;

    // 見出しの中の強調・コード記号は落とす。描画側は React の子から
    // 文字だけを集めるので記号は残らない。ここで残すと id がずれる。
    const text = m[1].replace(/[*`]/g, "").trim();
    if (text) out.push({ text, id: headingId(text) });
  }

  return out;
}
