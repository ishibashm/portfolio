import { describe, it, expect } from "vitest";
import { NEWS_FEEDS } from "@/data/newsSources";
import type { FeedSource } from "@/data/newsSources";
import type { MergedNewsItem } from "@/lib/fetchNews";
import {
  SECTION_TOPICS,
  SOURCE_TOPICS,
  TOPICS,
  countByTopic,
  topicOf,
} from "@/lib/newsTopics";

/**
 * 見出しの話題分け。
 *
 * **外れても画面には何も出ない**（札が付かないだけ）ので、目視では
 * 気付けない。台帳との突き合わせと、順番が意味を持つ規則を固定する。
 */

function entry(
  title: string,
  source: Partial<FeedSource> = {},
): MergedNewsItem {
  return {
    item: {
      title,
      link: "https://example.com/x",
      publishedAt: null,
      summary: null,
    },
    source: {
      id: "test",
      name: "テスト",
      feedUrl: "https://example.com/f.xml",
      siteUrl: "https://example.com/",
      note: "検査用",
      ...source,
    },
  };
}

describe("見出しの話題分け", () => {
  it("台帳に無い配信元 id を書いていない", () => {
    // 鍵が 1 文字違うと黙って外れる。実際に suumo / built などと
    // 書いていて、正しくは suumo-journal / itmedia-built だった。
    const ids = new Set(NEWS_FEEDS.map((f) => f.id));
    for (const id of Object.keys(SOURCE_TOPICS)) {
      expect(ids.has(id), `台帳に無い id: ${id}`).toBe(true);
    }
  });

  it("台帳に無い区分を書いていない", () => {
    const sections = new Set(
      NEWS_FEEDS.map((f) => f.section).filter((s): s is string => Boolean(s)),
    );
    for (const name of Object.keys(SECTION_TOPICS)) {
      expect(sections.has(name), `台帳に無い区分: ${name}`).toBe(true);
    }
  });

  it("区分は見出しの語より強い", () => {
    // 入札の公告に「住宅」が入っていても入札のまま
    const e = entry("○○団地 住宅改修工事の公告", { section: "入札・発注" });
    expect(topicOf(e)).toBe("bid");
  });

  it("強い語から順に当てる", () => {
    // 「改修」はリフォームだが、入札の語があればそちらが勝つ
    expect(topicOf(entry("耐震改修工事の一般競争入札"))).toBe("bid");
    expect(topicOf(entry("省エネ改修の補助を拡充"))).toBe("reform");
    // 「地価」は統計。「公示」も統計側に置いてある
    expect(topicOf(entry("地価公示の結果を公表"))).toBe("stats");
  });

  it("語で当たらなければ配信元の性格に落ちる", () => {
    expect(topicOf(entry("○○社が新体制へ", { id: "decn" }))).toBe("building");
    expect(topicOf(entry("お知らせ", { id: "mlit-press" }))).toBe("policy");
  });

  it("どれにも当たらなければ null（間違った札を付けない）", () => {
    expect(topicOf(entry("お知らせ"))).toBeNull();
  });

  it("0 件の話題は数えに出さない", () => {
    const counts = countByTopic([entry("賃貸住宅の募集"), entry("お知らせ")]);
    expect(counts).toEqual([{ topic: "rent", count: 1 }]);
  });

  it("話題の一覧に重複が無い", () => {
    const ids = TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
