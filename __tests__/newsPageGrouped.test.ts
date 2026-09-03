import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /news の札が「発信元 1 つ = 1 枚」で組まれているか。
 *
 * 画面は async のサーバ部品で、中で fetch する。描画して見るには
 * 取得ごと差し替える必要があるので、ここは**書かれ方**を見る。
 * 同じやり方の検査が既にいくつかある（arbitrageBundleLeaf など）。
 *
 * ## 何を守るか
 *
 * 1. `groupFeeds` を通している（フィードの本数ぶん札を並べない）
 * 2. **たたんでも `data-feed-source` が 1 本ずつ出る。**毎朝の
 *    site-audit がこの印を数えて「いくつの配信元から見出しが出て
 *    いるか」を見る。まとめた札で印を 1 つに減らすと、UR の 12 本が
 *    1 本に見えて、落ちても気付けなくなる
 * 3. 「取得できていません」は**全滅のときだけ**。まとめた札が出て
 *    いるのに出すと嘘になる
 * 4. 媒体数は**発信元**で数える（フィードの本数ではない）
 */

const SOURCE = readFileSync(
  join(process.cwd(), "src/app/news/page.tsx"),
  "utf-8",
);

describe("/news の札", () => {
  it("groupFeeds を通している", () => {
    expect(SOURCE).toContain('from "@/lib/newsGrouping"');
    expect(SOURCE).toContain("groupFeeds(feeds, PER_SECTION_COUNT)");
  });

  it("札を並べるのは束と、束を持たない配信元（生のフィード一覧ではない）", () => {
    expect(SOURCE).toContain("layout.groups.map");
    expect(SOURCE).toContain("layout.singles.map");
    /* 以前の書き方。戻すと 12 枚の札が並ぶ */
    expect(SOURCE).not.toContain("alive.map(");
  });

  it("まとめた札でも data-feed-source を 1 本ずつ出す（site-audit の印）", () => {
    /* 束の中のフィードを 1 つずつ印にする行。これが消えると
       毎朝の監視が UR の 12 本を 1 本として数える */
    expect(SOURCE).toContain(
      "alive.filter((f) => f.source.group === card.group.id)",
    );
    expect(SOURCE).toContain("data-feed-source={f.source.id}");
    /* 束を持たない配信元のぶんも今までどおり */
    expect(SOURCE).toContain("data-feed-source={feed.source.id}");
  });

  it("「取得できていません」は全滅のときだけ", () => {
    expect(SOURCE).toContain("alive.length === 0 && (");
  });

  it("媒体の数は発信元で数える", () => {
    expect(SOURCE).toContain("layout.groups.length + layout.singles.length");
    expect(SOURCE).toContain("新着（全{sourceCount}媒体）");
  });

  it("区分に複数の配信が混ざるときは出典を添える", () => {
    /* どの本部から来た公示か分からないまま並べない */
    expect(SOURCE).toContain("section.feedCount > 1 && (");
  });
});
