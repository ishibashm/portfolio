import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/rssParse";

/**
 * /news のフィード解析。対象は RSS 2.0・RSS 1.0（RDF）・Atom の 3 形式。
 * 官公庁は RSS 1.0 が多く（国交省のプレスリリースがそう）、
 * WordPress 系の媒体は RSS 2.0、ブログ基盤は Atom が混ざる。
 */

const RSS2 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>建設ニュース</title>
  <item>
    <title><![CDATA[（仮称）京都駅前計画の建築計画のお知らせ]]></title>
    <link>https://example.com/a1</link>
    <pubDate>Fri, 29 Aug 2026 09:00:00 +0900</pubDate>
  </item>
  <item>
    <title>解体工事のお知らせ &amp; 近隣説明会</title>
    <link>https://example.com/a2</link>
    <pubDate>Sat, 30 Aug 2026 09:00:00 +0900</pubDate>
  </item>
</channel></rss>`;

const RSS1 = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.go.jp/"><title>報道発表</title></channel>
  <item rdf:about="https://example.go.jp/p1">
    <title>地価ＬＯＯＫレポートの公表について</title>
    <link>https://example.go.jp/p1</link>
    <dc:date>2026-08-28T10:00:00+09:00</dc:date>
  </item>
</rdf:RDF>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>住まいの記事</title>
  <entry>
    <title>木造 3 階建ての設計事例</title>
    <link rel="alternate" href="https://example.net/e1"/>
    <link rel="edit" href="https://example.net/edit/e1"/>
    <updated>2026-08-27T12:00:00Z</updated>
  </entry>
  <entry>
    <title>編集部より</title>
    <link href="https://example.net/e2"/>
    <published>2026-08-26T12:00:00Z</published>
  </entry>
</feed>`;

describe("RSS 2.0", () => {
  it("見出し・リンク・日付を取り出し、新しい順に並べる", () => {
    const got = parseFeed(RSS2);
    expect(got).toHaveLength(2);
    expect(got[0]).toEqual({
      title: "解体工事のお知らせ & 近隣説明会",
      link: "https://example.com/a2",
      publishedAt: "2026-08-30T00:00:00.000Z",
    });
    expect(got[1].title).toBe("（仮称）京都駅前計画の建築計画のお知らせ");
  });
});

describe("RSS 1.0（RDF。官公庁の形）", () => {
  it("dc:date を日付として読む", () => {
    const got = parseFeed(RSS1);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({
      title: "地価ＬＯＯＫレポートの公表について",
      link: "https://example.go.jp/p1",
      publishedAt: "2026-08-28T01:00:00.000Z",
    });
  });
});

describe("Atom", () => {
  it("rel=alternate の href を採り、edit は採らない", () => {
    const got = parseFeed(ATOM);
    expect(got).toHaveLength(2);
    expect(got[0].link).toBe("https://example.net/e1");
    expect(got[1].link).toBe("https://example.net/e2");
    expect(got[1].publishedAt).toBe("2026-08-26T12:00:00.000Z");
  });
});

describe("壊れた記事はフィード全体を道連れにしない", () => {
  it("見出しやリンクの無い記事だけ捨てる", () => {
    const got = parseFeed(`<rss><channel>
      <item><title>リンクが無い</title></item>
      <item><link>https://example.com/no-title</link></item>
      <item><title>正常</title><link>https://example.com/ok</link></item>
      <item><title>擬似リンク</title><link>javascript:alert(1)</link></item>
    </channel></rss>`);
    expect(got).toHaveLength(1);
    expect(got[0].link).toBe("https://example.com/ok");
  });

  it("日付が読めない記事は最後に回る（捨てない）", () => {
    const got = parseFeed(`<rss><channel>
      <item><title>日付なし</title><link>https://example.com/x</link><pubDate>そのうち</pubDate></item>
      <item><title>日付あり</title><link>https://example.com/y</link><pubDate>Fri, 28 Aug 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`);
    expect(got.map((i) => i.title)).toEqual(["日付あり", "日付なし"]);
    expect(got[1].publishedAt).toBeNull();
  });

  it("フィードですらない入力は空", () => {
    expect(parseFeed("<html><body>404 Not Found</body></html>")).toEqual([]);
    expect(parseFeed("")).toEqual([]);
  });

  it("HTML の混ざった見出しはタグを剥がして実体参照を戻す", () => {
    const got = parseFeed(`<rss><channel>
      <item><title>&lt;b&gt;強調&lt;/b&gt;と&amp;#12354;</title><link>https://example.com/z</link></item>
    </channel></rss>`);
    expect(got[0].title).toBe("強調とあ");
  });

  it("limit で件数を絞れる", () => {
    const many = Array.from(
      { length: 30 },
      (_, i) =>
        `<item><title>記事${i}</title><link>https://example.com/${i}</link></item>`,
    ).join("");
    expect(parseFeed(`<rss><channel>${many}</channel></rss>`)).toHaveLength(20);
    expect(parseFeed(`<rss><channel>${many}</channel></rss>`, 5)).toHaveLength(
      5,
    );
  });
});
