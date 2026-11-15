import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import TimingLayout from "@/app/relocation/timing/layout";

describe("/relocation/timing 冒頭導入と広告予約枠", () => {
  it("サーバー側の導入に料金の一般的な傾向・条件注記・方位の確認手順（占い上の目安）を分けて出し、誇大表現を含まない", () => {
    const html = renderToStaticMarkup(
      createElement(
        TimingLayout,
        null,
        createElement("div", { id: "child-placeholder" }, "本体"),
      ),
    );

    // 1) 引っ越し料金が抑えやすい時期の一般的な傾向と条件注記・公開資料の出典
    expect(html).toContain("一般的な傾向");
    expect(html).toContain("SUUMO引越し");
    expect(html).toContain("2〜4月");
    expect(html).toContain("5月〜翌1月");
    expect(html).toContain("3月下旬〜4月上旬");
    expect(html).toContain("下旬");
    expect(html).toContain("上旬");
    expect(html).toContain("地域・日程・荷物量・移動距離・業者などの条件");
    expect(html).toContain("https://hikkoshi.suumo.jp/oyakudachi/788.html");
    expect(html).toContain("https://hikkoshi.suumo.jp/soba/");
    expect(html).toContain(
      "https://www.mlit.go.jp/report/press/content/001863859.pdf",
    );
    expect(html).toContain("https://hikkoshi-pedia.com/yen/536/");
    expect(html).toContain("https://hikkoshizamurai.jp/prices/");
    expect(html).toContain("/blog/what-is-hidori-for-moving");

    // サイト内記事へのリンクは公開資料の出典より後に置かれていること
    expect(html.indexOf("/blog/what-is-hidori-for-moving")).toBeGreaterThan(
      html.indexOf("https://hikkoshizamurai.jp/prices/"),
    );

    // 2) 方位の確認手順（占い上の目安）と既存導線
    expect(html).toContain("占い上の目安");
    expect(html).toContain("/relocation/arbitrage");
    expect(html).toContain("走査を始める");
    expect(html).toContain("カレンダーヒートマップ");
    expect(html).toContain("/calendar");

    // 禁止表現（断定・誇大表現）および「大安」を含まない
    for (const forbidden of [
      "最安",
      "全国対応",
      "ランキング",
      "No.1",
      "1位",
      "大安",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("分析結果の後（読み方と限界の直後）に空の広告予約枠があり、既存のハコブ掲載も維持されている", () => {
    const timingPage = readFileSync(
      join(process.cwd(), "src/app/relocation/timing/page.tsx"),
      "utf8",
    );

    // 既存のハコブ掲載が残っていること
    expect(timingPage).toContain("hakobuOfferForPref(destPref)");
    expect(timingPage).toContain("<AffiliatePlacement");

    // 「読み方と限界」セクションの後に空の広告予約枠があること
    const limitsIdx = timingPage.indexOf('title="読み方と限界"');
    const reservationIdx = timingPage.indexOf(
      'data-ad-reservation="timing-after-results"',
    );
    expect(limitsIdx).toBeGreaterThan(-1);
    expect(reservationIdx).toBeGreaterThan(limitsIdx);
  });
});
