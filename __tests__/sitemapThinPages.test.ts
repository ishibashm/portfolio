import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import path from "path";

/**
 * 雛形を展開しただけのページを、サイトマップから外したことの固定。
 *
 * AdSense に「有用性の低いコンテンツ」でサイト全体の配信を止められた。
 * 索引の対象になっているページの 97% が同じ雛形で、
 *
 *   /houi/area/{code}            1,022（地の文は全 URL 同一。地名と数字だけ違う）
 *   /houi/{year}/{star}/{month}    216（月盤の数値だけ違う）
 *
 * が大半を占めていた。Search Console の実測でも事実上索引されておらず
 * （878 URL のうち登録済み 78 / 検出only 811 / 表示回数ほぼ 0）、外して
 * 失う流入は無い。ページ自体は道具として残す（noindex, follow）。
 *
 * ## ここで何を見張るか
 *
 * **除外の当たる範囲**。1 段間違えると
 *
 *   - 広すぎる → 年別 27 ページや /houi/area 本体まで消える
 *   - 狭すぎる → 1,022 ページが載り続ける
 *
 * のどちらかが**無言で**起きる。生成物を見ないと気付けない。
 *
 * ## 照合の規則について
 *
 * next-sitemap は minimatch も fast-glob も使わず、**独自の matcher**を
 * 持っている（`dist/cjs/utils/matcher.js`）。実装はこの 2 行で、
 *
 *   pattern = escapeStringRegexp(pattern).replace(/\\\*|g/, '[\\s\\S]*')
 *   new RegExp(`^${pattern}$`, 'i')
 *
 * **アスタリスクは `/` を越える**（glob の常識と逆）。最初この照合を
 * minimatch で書いてしまい、たまたま同じ答えが出ていた。同じにならない
 * 場面があるので、ここでは実装どおりの規則を写して使う。
 *
 * 使っているパターンは、どちらの解釈でも同じ答えになる形に選んである
 * （下の「規則そのもの」で両方を確かめている）。
 */

const require_ = createRequire(import.meta.url);
const sitemapConfig = require_(
  path.resolve(process.cwd(), "next-sitemap.config.js"),
);

const excluded: string[] = sitemapConfig.exclude ?? [];

/** next-sitemap の matcher.js と同じ作り方。 */
function toRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, "[\\s\\S]*");
  return new RegExp(`^${escaped}$`, "i");
}

/** どれか 1 つに当たれば、そのページはサイトマップに載らない。 */
function isExcluded(url: string): boolean {
  return excluded.some((pattern) => toRegExp(pattern).test(url));
}

describe("雛形展開ページのサイトマップ除外", () => {
  it("市区町村別（1,022 ページ）は載せない", () => {
    for (const url of [
      "/houi/area/13101", // 東京都千代田区
      "/houi/area/26100", // 京都市
      "/houi/area/01100", // 札幌市
      "/houi/area/47201", // 那覇市
    ]) {
      expect(isExcluded(url), `${url} が除外されていない`).toBe(true);
    }
  });

  it("月別（216 ページ）は載せない", () => {
    for (const url of ["/houi/2026/1/1", "/houi/2026/9/12", "/houi/2027/5/8"]) {
      expect(isExcluded(url), `${url} が除外されていない`).toBe(true);
    }
  });

  it("年別（27 ページ）は載せる — 一緒に消していないこと", () => {
    // 本命星ごとに吉凶の並びがまるごと変わり、利用者の記録も付く。
    // 段数を 1 つ広く書くとここが巻き添えになる。
    for (const url of ["/houi/2026/1", "/houi/2027/9", "/houi/2028/5"]) {
      expect(isExcluded(url), `${url} が巻き添えで除外されている`).toBe(false);
    }
  });

  it("索引ページと記事は載せる", () => {
    for (const url of [
      "/",
      "/houi",
      "/houi/area", // エリア別の索引。配下だけ外し、本体は残す
      "/blog",
      "/blog/why-directions-were-thought-lucky",
      "/guide",
      "/calendar",
      "/calendar/2026-08",
      "/relocation/arbitrage",
      "/about",
      "/privacy",
    ]) {
      expect(isExcluded(url), `${url} が除外されている`).toBe(false);
    }
  });

  it("規則そのもの: アスタリスクは / を越える（glob と逆）", () => {
    // これを glob だと思い込むと、除外の範囲を読み間違える。
    expect(toRegExp("/houi/*").test("/houi/area/13101")).toBe(true);

    // 使っているパターンは、glob 解釈でも同じ答えになる形に選んである。
    // 「段数がぴったり合うか」で判断でき、越えるかどうかに依らない。
    expect(excluded).toContain("/houi/area/*");
    expect(excluded).toContain("/houi/*/*/*");

    const segments = (u: string) => u.split("/").length;
    expect(segments("/houi/area/13101")).toBe(segments("/houi/area/*"));
    expect(segments("/houi/2026/1/8")).toBe(segments("/houi/*/*/*"));
    // 年別は段数が足りないので、どちらの解釈でも当たらない。
    expect(segments("/houi/2026/1")).toBeLessThan(segments("/houi/*/*/*"));
  });
});
