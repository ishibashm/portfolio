import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedResult } from "@/lib/fetchNews";

/**
 * /news の札を発信元単位に組み直す層。
 *
 * ## 何を固定するか
 *
 * UR 都市機構は配信が 12 本に分かれている（報道発表 1・賃貸 1・入札
 * 10）。台帳のまま並べると 12 枚の札が出て、他の 8 媒体が読めなく
 * なる。ここで固定するのは 3 つ。
 *
 * 1. 束を持つフィードは**1 枚の札**にまとまる
 * 2. 同じ区分のフィードは**混ぜて日付順**（本部をまたいで新しい順）
 * 3. 上限で切るのは**並べたあと**。先に切ると、先頭の本部の古い
 *    見出しが残って他の本部の新しい見出しが落ちる
 *
 * 束の一覧（FEED_GROUPS）は台帳の中身なので、ここでは作った台帳を
 * 差し込んで見る。**本物の台帳が空でも成り立つ形**にしてある
 * （fetchNews の検査で一度これを踏んだ）。
 */

const GROUP = {
  id: "test-group",
  name: "検査用の発信元",
  siteUrl: "https://group.example/",
  note: "検査用",
};

async function withGroups() {
  vi.doMock("@/data/newsSources", () => ({
    FEED_GROUPS: [GROUP],
    feedGroupOf: (id: string | undefined) => (id === GROUP.id ? GROUP : null),
  }));
  return await import("@/lib/newsGrouping");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/data/newsSources");
});

const src = (id: string, group?: string, section?: string) => ({
  id,
  name: id,
  feedUrl: `https://group.example/${id}.xml`,
  siteUrl: "https://group.example/",
  note: "",
  group,
  section,
});

const item = (link: string, publishedAt: string | null) => ({
  title: link,
  link,
  publishedAt,
  summary: null,
});

const feed = (
  source: ReturnType<typeof src>,
  items: ReturnType<typeof item>[],
  ok = true,
): FeedResult => ({ source, ok, items, usedUrl: ok ? "u" : null });

describe("groupFeeds", () => {
  it("束を持つフィードは 1 枚の札にまとまる", async () => {
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("a", GROUP.id, "報道発表"), [
          item("/a", "2026-09-01T00:00:00+09:00"),
        ]),
        feed(src("b", GROUP.id, "入札・発注"), [
          item("/b", "2026-09-02T00:00:00+09:00"),
        ]),
        feed(src("c", GROUP.id, "入札・発注"), [
          item("/c", "2026-09-03T00:00:00+09:00"),
        ]),
      ],
      10,
    );

    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].group.name).toBe("検査用の発信元");
    expect(layout.groups[0].feedCount).toBe(3);
    /* 区分は 2 つ。入札は 2 本のフィードが 1 つの見出しに */
    expect(layout.groups[0].sections.map((s) => s.name)).toEqual([
      "報道発表",
      "入札・発注",
    ]);
    expect(layout.groups[0].sections[1].feedCount).toBe(2);
    expect(layout.singles).toHaveLength(0);
  });

  it("同じ区分は本部をまたいで日付順に混ざる", async () => {
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("east", GROUP.id, "入札・発注"), [
          item("/east-old", "2026-08-01T00:00:00+09:00"),
        ]),
        feed(src("west", GROUP.id, "入札・発注"), [
          item("/west-new", "2026-09-01T00:00:00+09:00"),
        ]),
      ],
      10,
    );

    const section = layout.groups[0].sections[0];
    expect(section.items.map((m) => m.item.link)).toEqual([
      "/west-new",
      "/east-old",
    ]);
    /* 出典は消さない。どの本部から来たかが分かること */
    expect(section.items.map((m) => m.source.id)).toEqual(["west", "east"]);
  });

  it("上限で切るのは並べたあと（他の本部の新しい見出しを落とさない）", async () => {
    /*
      **先に切るとこの検査が落ちる。**先頭の本部から 2 件取ると
      /old1・/old2 が残り、より新しい /new が消える。
    */
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("first", GROUP.id, "入札・発注"), [
          item("/old1", "2026-08-02T00:00:00+09:00"),
          item("/old2", "2026-08-01T00:00:00+09:00"),
        ]),
        feed(src("second", GROUP.id, "入札・発注"), [
          item("/new", "2026-09-01T00:00:00+09:00"),
        ]),
      ],
      2,
    );

    expect(layout.groups[0].sections[0].items.map((m) => m.item.link)).toEqual([
      "/new",
      "/old1",
    ]);
  });

  it("束を持たない配信元は今までどおり 1 枚ずつ", async () => {
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("solo1"), [item("/1", "2026-09-01T00:00:00+09:00")]),
        feed(src("solo2"), [item("/2", "2026-09-01T00:00:00+09:00")]),
      ],
      10,
    );

    expect(layout.groups).toHaveLength(0);
    expect(layout.singles.map((f) => f.source.id)).toEqual(["solo1", "solo2"]);
  });

  it("取得できなかったフィードは混ぜない（別に出す側の担当）", async () => {
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("dead", GROUP.id, "報道発表"), [], false),
        feed(src("live", GROUP.id, "報道発表"), [
          item("/y", "2026-09-01T00:00:00+09:00"),
        ]),
      ],
      10,
    );

    expect(layout.groups[0].feedCount).toBe(1);
    expect(layout.groups[0].sections[0].items).toHaveLength(1);
  });

  it("区分を書いていないフィードも消えない", async () => {
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("nosection", GROUP.id), [
          item("/z", "2026-09-01T00:00:00+09:00"),
        ]),
      ],
      10,
    );

    expect(layout.groups[0].sections).toHaveLength(1);
    expect(layout.groups[0].sections[0].items).toHaveLength(1);
  });

  it("知らない束の id を書いたフィードは落とさず 1 枚で出す", async () => {
    /* 台帳の書き間違いで見出しが画面から消えるのを避ける。
       検査（newsSources）で止めるが、出す側は安全側に倒す */
    const { groupFeeds } = await withGroups();
    const layout = groupFeeds(
      [
        feed(src("typo", "no-such-group"), [
          item("/t", "2026-09-01T00:00:00+09:00"),
        ]),
      ],
      10,
    );

    expect(layout.groups).toHaveLength(0);
    expect(layout.singles.map((f) => f.source.id)).toEqual(["typo"]);
  });
});
