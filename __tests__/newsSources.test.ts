import { describe, expect, it } from "vitest";
import {
  FEED_GROUPS,
  NEWS_FEEDS,
  NEWS_LINKS,
  feedGroupOf,
} from "@/data/newsSources";

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

  it("HOME'S はリンク集（確かめられたフィードの URL が無い）", () => {
    /*
      2026-09-03 の site-audit で、推測して置いた 3 つの URL が全部
      外れていた（homes-press が「取得できていない配信元」に出た）。
      台帳の決まりは「RSS の無い媒体は links に置く。勝手にスクレイプ
      してフィード化しない」。**確かめた URL が手に入るまでフィードに
      戻さない。**
    */
    expect(NEWS_FEEDS.some((f) => f.id === "homes-press")).toBe(false);
    expect(NEWS_LINKS.some((l) => l.url.includes("homes.co.jp"))).toBe(true);
  });

  it("UR はフィードとして載っている", () => {
    /* 利用者から URL の指定があったもの。リンク集へ戻すと
       新着の並びに出なくなる */
    const ur = NEWS_FEEDS.find((f) => f.id === "ur-release");
    expect(ur?.feedUrl).toBe("https://www.ur-net.go.jp/news/ur_release.xml");
  });

  it("束の id は FEED_GROUPS にあるものだけ", () => {
    /*
      書き間違えても画面からは消えない（groupFeeds が 1 枚の札に
      落とす）ので、**ここで止めないと気付けない**。まとまって
      いないことに気付くのは、12 枚の札が並んでからになる。
    */
    const unknown = NEWS_FEEDS.filter(
      (f) => f.group && !feedGroupOf(f.group),
    ).map((f) => `${f.id} → ${f.group}`);
    expect(unknown).toEqual([]);
  });

  it("区分は束を持つフィードにだけ書く", () => {
    /* 束が無いと区分は使われない。書いてあれば書き間違いのしるし */
    const orphan = NEWS_FEEDS.filter((f) => f.section && !f.group).map(
      (f) => f.id,
    );
    expect(orphan).toEqual([]);
  });

  it("束は少なくとも 2 本のフィードを持つ（1 本なら束にしない）", () => {
    /* 1 本しか無い束は、札の中に見出しが 1 つ増えるだけで
       読みにくくなる。素直に 1 枚の札で出せばよい */
    for (const g of FEED_GROUPS) {
      const members = NEWS_FEEDS.filter((f) => f.group === g.id);
      expect(members.length, g.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("UR の 12 本が束としてそろっている", () => {
    /*
      利用者の指定した一覧（ur-net.go.jp/site/rss.html）を
      probe-news-feeds の --list に当てた実測（run 33816205060）。
      13 本の候補のうち中身があったのは 12 本。載せていないのは
      /orders/im-reconstruction/order.xml で、200 だが 0 件。
    */
    const ur = NEWS_FEEDS.filter((f) => f.group === "ur");
    expect(ur).toHaveLength(12);

    const sections = new Map<string, number>();
    for (const f of ur) {
      sections.set(f.section!, (sections.get(f.section!) ?? 0) + 1);
    }
    expect([...sections.entries()]).toEqual([
      ["報道発表", 1],
      ["賃貸の募集・抽選", 1],
      ["入札・発注", 10],
    ]);

    /* 全部 ur-net.go.jp。ホストごとの同時数の絞りが効く前提 */
    for (const f of ur) {
      expect(new URL(f.feedUrl).host, f.id).toBe("www.ur-net.go.jp");
    }
  });

  it("中身が 0 件だったフィードは載せない", () => {
    /* 載せると「取得できていない配信元」に毎日出続けて、本当に
       落ちたフィードと見分けが付かなくなる */
    expect(
      NEWS_FEEDS.some((f) => f.feedUrl.includes("im-reconstruction")),
    ).toBe(false);
  });

  it("束の説明と入口が空でない", () => {
    for (const g of FEED_GROUPS) {
      expect(g.name.length, g.id).toBeGreaterThan(0);
      expect(g.note.length, g.id).toBeGreaterThan(0);
      expect(g.siteUrl.startsWith("https://"), g.id).toBe(true);
    }
  });
});
