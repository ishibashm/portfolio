import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllFeeds, mergeLatest, type FeedResult } from "@/lib/fetchNews";
import { NEWS_FEEDS } from "@/data/newsSources";

/**
 * /news の取得。ここで固定したいのは 2 つだけ。
 *
 * 1. **平常時に相手へ 1 回しか行かない。**予備 URL（altFeedUrls）を
 *    台帳に書いても、本命が読めたら予備は取りに行かない。
 *    「相手サーバーの負荷を上げない」という決め事の担保。
 * 2. 本命が落ちたときだけ予備に回り、読めたら ok になる。
 *
 * 予備の口を入れた動機は、BUILT（ITmedia）の見出しが本番で出なかった
 * こと。ITmedia は媒体により RSS 2.0 と 1.0 のどちらかしか無い。
 */

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>テスト見出し</title>
    <link>https://example.com/x1</link>
    <pubDate>Fri, 29 Aug 2026 09:00:00 +0900</pubDate>
  </item>
</channel></rss>`;

function xmlResponse(body: string) {
  return {
    ok: true,
    headers: { get: () => "application/xml; charset=utf-8" },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

const notFound = { ok: false, headers: { get: () => null } };

/** 予備 URL を持つ情報源（台帳から引く。無くなったら気付けるように） */
const withAlt = NEWS_FEEDS.find((f) => (f.altFeedUrls?.length ?? 0) > 0);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllFeeds", () => {
  it("台帳に予備 URL を持つ情報源がある（この検証の前提）", () => {
    expect(withAlt).toBeDefined();
  });

  it("本命が読めたら予備は取りに行かない（相手への頻度を上げない）", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return xmlResponse(RSS);
      }),
    );

    await fetchAllFeeds();

    /* 情報源の数だけ。予備の URL は 1 つも呼ばれていない */
    expect(calls).toHaveLength(NEWS_FEEDS.length);
    for (const alt of withAlt!.altFeedUrls!) {
      expect(calls).not.toContain(alt);
    }
  });

  it("本命が落ちたときだけ予備を試し、読めれば ok になる", async () => {
    const alt = withAlt!.altFeedUrls![0];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url === alt ? xmlResponse(RSS) : notFound)),
    );

    const results = await fetchAllFeeds();
    const target = results.find((r) => r.source.id === withAlt!.id)!;

    expect(target.ok).toBe(true);
    expect(target.usedUrl).toBe(alt);
    expect(target.items).toHaveLength(1);

    /* 予備を持たない情報源は落ちたまま。usedUrl は null */
    const other = results.find((r) => r.source.id !== withAlt!.id)!;
    expect(other.ok).toBe(false);
    expect(other.usedUrl).toBeNull();
  });
});

describe("mergeLatest", () => {
  const src = (id: string) => ({
    id,
    name: id,
    feedUrl: `https://example.com/${id}`,
    siteUrl: `https://example.com/${id}/`,
    note: "",
  });

  const item = (link: string, publishedAt: string | null) => ({
    title: link,
    link,
    publishedAt,
    summary: null,
  });

  it("配信元をまたいで新しい順に並べる", () => {
    const feeds: FeedResult[] = [
      {
        source: src("a"),
        ok: true,
        usedUrl: "u",
        items: [item("/a1", "2026-08-28T00:00:00+09:00")],
      },
      {
        source: src("b"),
        ok: true,
        usedUrl: "u",
        items: [
          item("/b1", "2026-08-30T00:00:00+09:00"),
          item("/b2", "2026-08-29T00:00:00+09:00"),
        ],
      },
    ];

    expect(mergeLatest(feeds, 10).map((m) => m.item.link)).toEqual([
      "/b1",
      "/b2",
      "/a1",
    ]);
  });

  it("取得できなかった配信元は混ぜない", () => {
    const feeds: FeedResult[] = [
      {
        source: src("dead"),
        ok: false,
        usedUrl: null,
        items: [item("/x", "2026-08-30T00:00:00+09:00")],
      },
      {
        source: src("live"),
        ok: true,
        usedUrl: "u",
        items: [item("/y", "2026-08-01T00:00:00+09:00")],
      },
    ];

    expect(mergeLatest(feeds, 10).map((m) => m.item.link)).toEqual(["/y"]);
  });

  it("日付の読めない見出しは最後に回す（消さない）", () => {
    const feeds: FeedResult[] = [
      {
        source: src("a"),
        ok: true,
        usedUrl: "u",
        items: [
          item("/none", null),
          item("/dated", "2026-08-20T00:00:00+09:00"),
        ],
      },
    ];

    expect(mergeLatest(feeds, 10).map((m) => m.item.link)).toEqual([
      "/dated",
      "/none",
    ]);
  });

  it("同じ URL は 1 回だけ（先に載っている配信元が勝つ）", () => {
    const feeds: FeedResult[] = [
      {
        source: src("first"),
        ok: true,
        usedUrl: "u",
        items: [item("/same", "2026-08-30T00:00:00+09:00")],
      },
      {
        source: src("second"),
        ok: true,
        usedUrl: "u",
        items: [item("/same", "2026-08-30T00:00:00+09:00")],
      },
    ];

    const merged = mergeLatest(feeds, 10);
    expect(merged).toHaveLength(1);
    expect(merged[0].source.id).toBe("first");
  });

  it("limit で打ち切る", () => {
    const feeds: FeedResult[] = [
      {
        source: src("a"),
        ok: true,
        usedUrl: "u",
        items: [
          item("/1", "2026-08-30T00:00:00+09:00"),
          item("/2", "2026-08-29T00:00:00+09:00"),
          item("/3", "2026-08-28T00:00:00+09:00"),
        ],
      },
    ];

    expect(mergeLatest(feeds, 2).map((m) => m.item.link)).toEqual(["/1", "/2"]);
  });
});
