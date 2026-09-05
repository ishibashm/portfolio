import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ルートの twitter は card だけを持つ。
 *
 * ## なぜ検査するか（2026-09-05 に実測）
 *
 * `src/app/layout.tsx` の `twitter` に title・description・images を
 * 書いていたせいで、**サイト内の全ページがルートの値を継承していた。**
 *
 * Next のメタデータは項目ごとに「いちばん近い祖先で定義された値」を
 * 使う。子ページはどれも `openGraph` しか上書きしておらず、`twitter` を
 * 書いたページは 1 つも無かった。結果として:
 *
 *     og:title      北海道札幌市中央区から見た方位別のエリアと家賃相場
 *     twitter:title Cloud Palette | 引越しの方位とタイミングを決める
 *
 * この食い違いが 1,127 の市区町村ページ・47 の県ページ・27 の記事の
 * 全部で起きていた。X で共有すると、どこを共有しても同じカードになる。
 * #948 で og:image を記事ごとにしたときに、こちら側を見落としている。
 *
 * ルートを空にすると Next が各ページの title / description / og:image
 * から組む。**ビルド後の HTML で確かめた**（推測ではない）。
 *
 * ## この検査の限界
 *
 * 実際の出力は `next build` を通さないと見られないので、ここでは
 * **原因になった書き方が戻っていないこと**だけを見る。「良いカードが
 * 出ている」ことの保証ではない。
 */
describe("ルートの twitter が子ページを塗りつぶしていない", () => {
  const source = readFileSync("src/app/layout.tsx", "utf8");

  /** `twitter: { ... }` の中身を取り出す。 */
  function twitterBlock(text: string): string {
    const start = text.indexOf("twitter: {");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("},", start);
    expect(end).toBeGreaterThan(start);
    return text.slice(start, end);
  }

  it("title / description / images を持っていない", () => {
    const block = twitterBlock(source);
    const banned = ["title", "description", "images"];
    const found = banned.filter((k) => new RegExp(`\\b${k}\\s*:`).test(block));
    expect(found).toEqual([]);
  });

  it("card は残っている（既定は summary で小さい）", () => {
    expect(twitterBlock(source)).toContain('card: "summary_large_image"');
  });

  it("この検査が働いている（戻したら落ちる）", () => {
    /* 直す前の書き方をそのまま当てて、拾えることを示す。
       これが言えないと、空回りしているのと区別が付かない。 */
    const before = `  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
    images: ["/ogp.png"],
  },`;
    const block = twitterBlock(before);
    const found = ["title", "description", "images"].filter((k) =>
      new RegExp(`\\b${k}\\s*:`).test(block),
    );
    expect(found).toEqual(["title", "description", "images"]);
  });
});
