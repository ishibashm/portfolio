import { describe, expect, it } from "vitest";
import { NEWS_FEEDS, NEWS_LINKS } from "@/data/newsSources";

/**
 * /news の台帳が二重・不整合になっていないか。
 *
 * ## なぜ要るか（2026-09-03 に実際に起きかけた）
 *
 * UR 都市機構はリンク集に載っていた。フィードの URL が分かったので
 * フィードへ上げたが、**リンク集から外し忘れると同じ媒体が 1 つの頁に
 * 2 回出る。**フィードの札には siteUrl があるので、リンク集の役目は
 * 「フィードの無い媒体」だけ。
 *
 * URL の生存は本番でしか確かめられない（開発環境は外に出られない）。
 * ここで見るのは**形の整合だけ**で、生きているかは見ない。
 */
describe("/news の台帳", () => {
  it("id が重複していない（取得キャッシュのキーになる）", () => {
    const ids = NEWS_FEEDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("同じフィードを 2 回取りに行かない", () => {
    const urls = NEWS_FEEDS.flatMap((f) => [
      f.feedUrl,
      ...(f.altFeedUrls ?? []),
    ]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("フィードのある媒体をリンク集にも置いていない", () => {
    /* ホスト名で見る。フィードの URL と人が読む URL は別経路のことが
       あるので、両方を突き合わせる */
    const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
    const feedHosts = new Set(
      NEWS_FEEDS.flatMap((f) => [host(f.feedUrl), host(f.siteUrl)]),
    );
    const duplicated = NEWS_LINKS.filter((l) => feedHosts.has(host(l.url)));
    expect(duplicated.map((l) => l.name)).toEqual([]);
  });

  it("URL が https で、出典と説明が空でない", () => {
    for (const f of NEWS_FEEDS) {
      expect(f.feedUrl.startsWith("https://"), f.id).toBe(true);
      expect(f.siteUrl.startsWith("https://"), f.id).toBe(true);
      for (const alt of f.altFeedUrls ?? []) {
        expect(alt.startsWith("https://"), f.id).toBe(true);
      }
      expect(f.name.length, f.id).toBeGreaterThan(0);
      expect(f.note.length, f.id).toBeGreaterThan(0);
    }
    for (const l of NEWS_LINKS) {
      expect(l.url.startsWith("https://"), l.name).toBe(true);
      expect(l.note.length, l.name).toBeGreaterThan(0);
    }
  });

  it("UR はフィードとして載っている", () => {
    /* 利用者から URL の指定があったもの。リンク集へ戻すと
       新着の並びに出なくなる */
    const ur = NEWS_FEEDS.find((f) => f.id === "ur-release");
    expect(ur?.feedUrl).toBe("https://www.ur-net.go.jp/news/ur_release.xml");
  });
});
