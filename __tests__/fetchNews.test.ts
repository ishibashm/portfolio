import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllFeeds } from "@/lib/fetchNews";
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
