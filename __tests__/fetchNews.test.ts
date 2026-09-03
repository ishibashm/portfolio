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
 *
 * ## 仕組みは台帳の中身に依存させない（2026-09-03 に直した）
 *
 * 以前は「台帳から予備を持つ配信元を探す」形で、**台帳から予備が
 * 無くなった時点で 3 件とも落ちた。**予備は「確かめた URL が見つかる
 * までの繋ぎ」で、確かめられたら消えるもの（BUILT がそうなった）。
 * 仕組みの検査は作った台帳で行い、本物の台帳には「1 配信元 1 回」
 * だけを当てる。
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

/** 仕組みを確かめるための台帳。本物の中身に左右されない。 */
const MAIN = "https://alt.example/main.xml";
const ALT = "https://alt.example/alt.xml";
const PLAIN = "https://plain.example/main.xml";
const FIXTURE = [
  {
    id: "with-alt",
    name: "予備あり",
    feedUrl: MAIN,
    altFeedUrls: [ALT],
    siteUrl: "https://alt.example/",
    note: "検査用",
  },
  {
    id: "no-alt",
    name: "予備なし",
    feedUrl: PLAIN,
    siteUrl: "https://plain.example/",
    note: "検査用",
  },
];

/** 作った台帳で fetchAllFeeds を読み込む。 */
async function withFixture(registry: readonly unknown[] = FIXTURE) {
  vi.doMock("@/data/newsSources", () => ({
    NEWS_FEEDS: registry,
    NEWS_LINKS: [],
  }));
  return await import("@/lib/fetchNews");
}

/** 同じホストに N 本ぶら下がる台帳。同時数の上限を見るため。 */
function sameHostRegistry(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `many-${i}`,
    name: `多い-${i}`,
    feedUrl: `https://many.example/${i}.xml`,
    siteUrl: "https://many.example/",
    note: "検査用",
    group: "many",
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("@/data/newsSources");
});

describe("fetchAllFeeds", () => {
  it("本物の台帳でも、1 配信元につき 1 回しか行かない", () => {
    /* 相手サーバーの負荷を上げない、の担保。予備を持つ配信元が
       台帳に無くても成り立つ形にしてある */
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return xmlResponse(RSS);
      }),
    );

    return fetchAllFeeds().then(() => {
      expect(NEWS_FEEDS.length).toBeGreaterThan(0);
      expect(calls).toHaveLength(NEWS_FEEDS.length);
      /* 呼んだのは本命だけ */
      const mains = NEWS_FEEDS.map((f) => f.feedUrl);
      expect([...calls].sort()).toEqual([...mains].sort());
    });
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

    const mod = await withFixture();
    await mod.fetchAllFeeds();

    expect(calls).toEqual([MAIN, PLAIN]);
    expect(calls).not.toContain(ALT);
  });

  it("同じホストへ一度に投げるのは 4 本まで（相手への瞬間のレート）", async () => {
    /*
      UR 都市機構のように配信を 12 本に分けている発信元を台帳へ
      入れると、素の Promise.all では 12 本が同時にそのサーバへ
      当たる。1 日 4 回という総量は変わらないが、瞬間のレートは
      12 倍。**上限を外すとこの検査が落ちる。**
    */
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return xmlResponse(RSS);
      }),
    );

    const mod = await withFixture(sameHostRegistry(12));
    const results = await mod.fetchAllFeeds();

    expect(results).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(4);
    /* 絞っても全部は取る。取りこぼしていないこと */
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("ホストが違えば並行に投げる（絞りすぎていない）", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return xmlResponse(RSS);
      }),
    );

    const registry = Array.from({ length: 8 }, (_, i) => ({
      id: `host-${i}`,
      name: `別ホスト-${i}`,
      feedUrl: `https://h${i}.example/feed.xml`,
      siteUrl: `https://h${i}.example/`,
      note: "検査用",
    }));
    const mod = await withFixture(registry);
    await mod.fetchAllFeeds();

    expect(peak).toBe(8);
  });

  it("並びは取得の速さでなく台帳の順", async () => {
    /* ホストごとに束ねて取るので、返ってくる順は取得の速さで
       変わりうる。画面の札の並びが日替わりにならないよう戻す */
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        /* 後ろのものほど速く返す */
        const n = Number(/(\d+)\.xml$/.exec(url)?.[1] ?? 0);
        await new Promise((r) => setTimeout(r, (12 - n) * 2));
        return xmlResponse(RSS);
      }),
    );

    const mod = await withFixture(sameHostRegistry(6));
    const results = await mod.fetchAllFeeds();

    expect(results.map((r) => r.source.id)).toEqual([
      "many-0",
      "many-1",
      "many-2",
      "many-3",
      "many-4",
      "many-5",
    ]);
  });

  it("本命が落ちたときだけ予備を試し、読めれば ok になる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url === ALT ? xmlResponse(RSS) : notFound)),
    );

    const mod = await withFixture();
    const results = await mod.fetchAllFeeds();
    const target = results.find((r) => r.source.id === "with-alt")!;

    expect(target.ok).toBe(true);
    expect(target.usedUrl).toBe(ALT);
    expect(target.items).toHaveLength(1);

    /* 予備を持たない情報源は落ちたまま。usedUrl は null */
    const other = results.find((r) => r.source.id === "no-alt")!;
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

  it("1 つの束の取り分は 4 件まで（他の発信元を押し出さない）", () => {
    /*
      UR 都市機構は配信が 12 本ある。束で数えないと、発信元は 1 つ
      なのに 24 枠のうち 12 枠以上を取り、他の媒体が一覧から消える。
      **束の上限を外すとこの検査が落ちる**（12 件すべてが並ぶ）。
    */
    const grouped = (i: number) => ({
      ...src(`ur-${i}`),
      group: "ur",
    });
    const feeds: FeedResult[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        source: grouped(i),
        ok: true,
        usedUrl: "u",
        /* どれも「他の媒体」より新しい */
        items: [item(`/ur${i}`, "2026-08-30T00:00:00+09:00")],
      })),
      {
        source: src("other"),
        ok: true,
        usedUrl: "u",
        items: [item("/other", "2026-08-01T00:00:00+09:00")],
      },
    ];

    const merged = mergeLatest(feeds, 24);
    const fromGroup = merged.filter((m) => m.source.group === "ur");
    expect(fromGroup).toHaveLength(4);
    /* 押し出されずに残っている */
    expect(merged.some((m) => m.source.id === "other")).toBe(true);
  });

  it("束を持たない配信元は自分だけの束として数える", () => {
    /* 束の無い配信元 1 つで 6 件出しても、上限は自分にだけ掛かる */
    const feeds: FeedResult[] = [
      {
        source: src("solo"),
        ok: true,
        usedUrl: "u",
        items: Array.from({ length: 6 }, (_, i) =>
          item(`/s${i}`, `2026-08-2${i}T00:00:00+09:00`),
        ),
      },
    ];
    expect(mergeLatest(feeds, 24)).toHaveLength(4);
  });
});
