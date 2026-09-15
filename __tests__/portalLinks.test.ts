import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  ALLOWED_PORTAL_URLS,
  PORTAL_LINK_DISCLAIMER,
  portalLinksForPref,
  suumoCitySearchUrl,
  municipalityCodeFromPortalUrl,
} from "@/lib/portalLinks";
import { PREF_REGION, prefNameByCode } from "@/lib/prefContent";
import { AREAS } from "@/lib/areaContent";

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

  /* 利用者が実物を貼ってくれた 9 地方ぶん（2026-09-13）。**1 文字ずつ
     そのまま**。ここを書き換えるときは、必ず実物を見てからにする */
  const SAMPLES: [string, string, string][] = [
    ["01101", "北海道札幌市中央区", "ar=010&bs=040&ta=01&sc=01101"],
    ["04101", "宮城県仙台市青葉区", "ar=020&bs=040&ta=04&sc=04101"],
    ["13103", "東京都港区", "ar=030&bs=040&ta=13&sc=13103"],
    ["17201", "石川県金沢市", "ar=040&bs=040&ta=17&sc=17201"],
    ["23106", "愛知県名古屋市中区", "ar=050&bs=040&ta=23&sc=23106"],
    ["27127", "大阪府大阪市北区", "ar=060&bs=040&ta=27&sc=27127"],
    ["37201", "香川県高松市", "ar=070&bs=040&ta=37&sc=37201"],
    ["34101", "広島県広島市中区", "ar=080&bs=040&ta=34&sc=34101"],
    ["40132", "福岡県福岡市博多区", "ar=090&bs=040&ta=40&sc=40132"],
  ];

  it("実物と 1 文字ずつ同じものを組み立てる", () => {
    for (const [code, name, query] of SAMPLES) {
      expect(suumoCitySearchUrl(code), name).toBe(
        "https://suumo.jp/jj/chintai/ichiran/FR301FC001/?" +
          query +
          "&cb=0.0&ct=9999999&et=9999999&cn=9999999&mb=0&mt=9999999" +
          "&shkr1=03&shkr2=03&shkr3=03&shkr4=03&fw2=&srch_navi=1",
      );
    }
  });

  it("中国と四国を取り違えていない", () => {
    /* **地方の並び順から埋めると入れ替わる。**070 が四国で 080 が中国。
       どちらも実在する頁なのでリンクは壊れず、**別の地方が開く**だけで
       気付けない。実物を見て確かめた組を、ここで名指しで固定する */
    expect(suumoCitySearchUrl("37201")).toContain("ar=070"); // 高松（四国）
    expect(suumoCitySearchUrl("34101")).toContain("ar=080"); // 広島（中国）
  });

  it("都道府県はゼロ埋めのまま渡す", () => {
    /* `ta=1` ではなく `ta=01`。ここも実物を見るまで外していた */
    expect(suumoCitySearchUrl("01101")).toContain("ta=01&");
    expect(suumoCitySearchUrl("04101")).toContain("ta=04&");
  });

  it("47 県すべてで組み立てられる", () => {
    const missing = PREF_CODES.filter(
      (p) => suumoCitySearchUrl(`${p}201`) === null,
    ).map((p) => `${p} ${prefNameByCode(p)}`);
    expect(missing).toEqual([]);
  });

  it("壊れたコードでは組み立てない", () => {
    for (const bad of ["", "13", "131030", "abcde", "1310a"]) {
      expect(suumoCitySearchUrl(bad)).toBeNull();
    }
  });

  it("こちらで検索の条件を足していない", () => {
    /* 賃料・面積・築年数・敷礼は「指定なし」の既定のまま渡す。絞るのは
       向こうの画面で利用者がやること */
    const url = suumoCitySearchUrl("13103")!;
    expect(url).toContain("cb=0.0&ct=9999999");
    expect(url).toContain("fw2=&srch_navi=1");
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

/*
  貼られた URL の**綴りから**市区町村コードを読む（2026-09-15。利用者の依頼）。

  ## これは取得ではない

  **URL を開きに行かない。**文字列を読むだけ。取りに行けばスクレイピングで、
  nifty の特約が名指しで禁じている（backlog 29 節）。取得しないことは
  `userSpotUrlNeverFetched` が母集団ごと見張っている。

  ## 気にしていること

  1. **組み立てと読み取りが往復する。**`suumoCitySearchUrl` が作った URL から
     同じコードが読めること。片方だけ直すと、貼っても場所が決まらなくなる
  2. **物件詳細の URL からは読めない。**id しか入っていないので、当てずっぽう
     で決めない（違う街の方位を出すほうが害が大きい）
  3. **知らないホストの綴りを推測しない**
*/
describe("URL の綴りから市区町村を読む", () => {
  it("組み立てた URL から同じコードが読める（往復する）", () => {
    for (const code of ["13103", "23106", "01100", "47201", "26104"]) {
      const url = suumoCitySearchUrl(code);
      expect(url, code).not.toBeNull();
      expect(municipalityCodeFromPortalUrl(url), code).toBe(code);
    }
  });

  it("実在する市区町村を広く通しても往復する", () => {
    /* 空回り防止。1 件だけ通して満足しない */
    let checked = 0;
    for (const a of AREAS.slice(0, 120)) {
      const url = suumoCitySearchUrl(a.code);
      if (!url) continue;
      expect(municipalityCodeFromPortalUrl(url), a.full).toBe(a.code);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("物件詳細の URL からは読めない（当てずっぽうで決めない）", () => {
    /* id しか入っていない。違う街の方位を出すほうが害が大きい */
    expect(
      municipalityCodeFromPortalUrl("https://suumo.jp/chintai/jnc_000012345/"),
    ).toBeNull();
    expect(
      municipalityCodeFromPortalUrl(
        "https://suumo.jp/chintai/bc_100123456789/",
      ),
    ).toBeNull();
  });

  it("知らないホスト・https 以外・壊れた値は読まない", () => {
    for (const bad of [
      "https://example.com/?sc=13103",
      "https://www.homes.co.jp/?sc=13103",
      "http://suumo.jp/?sc=13103",
      "javascript:alert(1)",
      "suumo.jp/?sc=13103",
      "",
      "   ",
      null,
      13103,
    ]) {
      expect(
        municipalityCodeFromPortalUrl(bad as never),
        String(bad),
      ).toBeNull();
    }
  });

  it("5 桁でない sc と、県として成り立たない先頭 2 桁は落とす", () => {
    for (const sc of ["1310", "131030", "abcde", "00100", "48201", "99999"]) {
      expect(
        municipalityCodeFromPortalUrl(
          `https://suumo.jp/jj/chintai/ichiran/FR301FC001/?sc=${sc}`,
        ),
        sc,
      ).toBeNull();
    }
  });

  it("www つきでも読める", () => {
    expect(
      municipalityCodeFromPortalUrl("https://www.suumo.jp/x/?sc=13103"),
    ).toBe("13103");
  });
});
