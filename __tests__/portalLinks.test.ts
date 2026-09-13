import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  ALLOWED_PORTAL_URLS,
  PORTAL_LINK_DISCLAIMER,
  portalLinksForPref,
} from "@/lib/portalLinks";
import { PREF_REGION, prefNameByCode } from "@/lib/prefContent";

/*
  ## 何を守る検査か

  外部サイトへのリンクは、**規約で名指しされた URL だけ**を出す。
  SUUMO は「全国と各地域のトップのみ（例外 a〜c を除く）」、HOME'S は
  「トップページのみ」。市区町村の検索結果ページへ組み立てて飛ばす作りに
  すると、両社の規約から外れる（2026-09-13 に利用者が本文を貼って確認）。

  2026-09-10 に nifty で「規約を読まずに出どころを決めた」ので、**許可の
  範囲をコードではなく検査で固定する。**
*/

const PREF_CODES = Array.from({ length: 47 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

describe("外部サイトへのリンクは規約の範囲を出ない", () => {
  it("47 県のどれから引いても、許可された URL しか出ない", () => {
    const bad: string[] = [];
    for (const code of PREF_CODES) {
      for (const link of portalLinksForPref(code)) {
        if (!ALLOWED_PORTAL_URLS.includes(link.href)) {
          bad.push(`${code} ${prefNameByCode(code)}: ${link.href}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("許可された URL は規約に並んでいた 10 個だけ", () => {
    /* SUUMO の全国 + 8 地域、HOME'S のトップ。増えていたら、規約を
       読み直したかどうかを疑う */
    expect([...ALLOWED_PORTAL_URLS].sort()).toEqual(
      [
        "https://suumo.jp/",
        "https://suumo.jp/chugoku/",
        "https://suumo.jp/hokkaido/",
        "https://suumo.jp/kansai/",
        "https://suumo.jp/kanto/",
        "https://suumo.jp/koshinetsu/",
        "https://suumo.jp/kyushu/",
        "https://suumo.jp/shikoku/",
        "https://suumo.jp/tohoku/",
        "https://suumo.jp/tokai/",
        "https://www.homes.co.jp/",
      ].sort(),
    );
  });

  it("市区町村や検索条件を URL に組み立てていない", () => {
    /* 「_ct」「?」「rent/」のような、条件つきの頁を指す形が出ないこと。
       深いリンクは SUUMO の例外 a〜c に当たる場合だけで、当てはめるのは
       利用者の判断（lib の註） */
    const suspicious = /[?&=]|_ct|\/rent\/|\/chintai\/|\/list\//;
    const bad = PREF_CODES.flatMap((code) =>
      portalLinksForPref(code)
        .filter((l) => suspicious.test(l.href))
        .map((l) => `${code}: ${l.href}`),
    );
    expect(bad).toEqual([]);
  });

  it("県ごとの地方分けは prefContent と同じものを使っている", () => {
    /* 同じ地方分けを 2 通り持たない（docs/site-spec.md の方針）。
       PREF_REGION を書き換えたら、こちらの URL も追随することを見る */
    const byRegion = new Map<string, Set<string>>();
    for (const code of PREF_CODES) {
      const region = PREF_REGION[code];
      const href = portalLinksForPref(code)[0].href;
      if (!byRegion.has(region)) byRegion.set(region, new Set());
      byRegion.get(region)!.add(href);
    }
    /* 1 つの地方が 2 つの URL に割れていない・別の地方と同じ URL でもない */
    for (const [region, urls] of byRegion) {
      expect(
        urls.size,
        `${region} が ${[...urls].join(" / ")} に割れている`,
      ).toBe(1);
    }
    const all = [...byRegion.values()].map((s) => [...s][0]);
    expect(new Set(all).size).toBe(byRegion.size);
  });

  it("知らない県コードでは地方を当てずっぽうで決めない", () => {
    const [suumo] = portalLinksForPref("99");
    expect(suumo.href).toBe("https://suumo.jp/");
  });

  it("rel は両社のサンプルに合わせる", () => {
    for (const link of portalLinksForPref("13")) {
      expect(link.rel).toContain("nofollow");
      expect(link.rel).toContain("noopener");
    }
  });

  it("呼び方は規約のサンプルのまま（縮めない）", () => {
    const [suumo, homes] = portalLinksForPref("13");
    expect(suumo.name).toBe("リクルートの不動産・住宅サイト SUUMO(スーモ)");
    expect(homes.name).toBe(
      "不動産・住宅情報サービス【LIFULL HOME'S/ライフルホームズ】",
    );
  });

  it("誤認を避ける一言がある", () => {
    /* HOME'S の「提携または協力関係にあるものと誤認される…サイトからの
       リンクはお断りいたします」への手当て */
    expect(PORTAL_LINK_DISCLAIMER).toContain("提携");
  });

  it("台帳に規約の出典と読んだ日が書いてある", () => {
    /* 出どころを足すときに、本文・出典・読んだ日を一緒に書く決め。
       字面で見るのは、註が消えたことに気付けるようにするため */
    const src = readFileSync("src/lib/portalLinks.ts", "utf8");
    expect(src).toContain("https://suumo.jp/help/link.html");
    expect(src).toContain("https://www.homes.co.jp/linkpolicy/");
    expect(src).toContain("2026-09-13");
  });
});
