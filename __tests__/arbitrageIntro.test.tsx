import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Layout from "@/app/relocation/arbitrage/layout";
import { coreRouteLabel } from "@/lib/siteStructure";

const LAYOUT_PATH = join(
  process.cwd(),
  "src/app/relocation/arbitrage/layout.tsx",
);

function renderLayoutWithMarker() {
  return renderToStaticMarkup(
    <Layout>
      <div id="client-ui-slot">CLIENT_UI_MARKER</div>
    </Layout>,
  );
}

describe("/relocation/arbitrage 冒頭のサーバー出力", () => {
  it("入力 UI（children）より前に、結論・手順・占い上の目安・統計と方位の区別・募集一覧ではないことが出力される", () => {
    const html = renderLayoutWithMarker();
    const markerIndex = html.indexOf("CLIENT_UI_MARKER");
    expect(markerIndex).toBeGreaterThan(0);

    const beforeUi = html.slice(0, markerIndex);
    const label = coreRouteLabel("/relocation/arbitrage")!;

    // 何が分かるか（結論）
    expect(beforeUi).toContain(`${label}で分かること（結論）`);
    expect(beforeUi).toContain("八方位の吉凶");
    expect(beforeUi).toContain("地図");
    expect(beforeUi).toContain("家賃水準");
    expect(beforeUi).toContain("空き家率");
    expect(beforeUi).toContain("ログインなしで使えます");
    expect(beforeUi).not.toContain("無料");

    // 使い方の手順（順序付きリスト）
    expect(beforeUi).toContain("使い方の手順");
    expect(beforeUi).toContain("<ol");
    expect(beforeUi).toContain("生年月日と出発地");
    expect(beforeUi).toContain("対象日");

    // 占い上の目安・科学的効果の不保証
    expect(beforeUi).toContain("占い上の目安");
    expect(beforeUi).toContain("科学的な効果を保証するものではありません");

    // 家賃・空き家率の統計を方位の判定と別見出しで分け、e-Stat 出典と募集一覧ではない旨を明記
    expect(beforeUi).toContain(
      "家賃水準・空き家率の統計について（方位の判定とは別の公的統計）",
    );
    expect(beforeUi).toContain("e-Stat");
    expect(beforeUi).toContain("統計でみる市区町村のすがた");
    expect(beforeUi).toContain("住宅・土地統計調査");
    expect(beforeUi).toContain("いま募集中の部屋の一覧ではありません");
    expect(beforeUi).toContain("いま募集中の家賃や物件一覧ではなく");
  });

  it("/relocation/timing・/houi・/calendar への案内リンクが coreRouteLabel の文言で含まれる", () => {
    const html = renderLayoutWithMarker();
    const beforeUi = html.slice(0, html.indexOf("CLIENT_UI_MARKER"));

    for (const href of ["/relocation/timing", "/houi", "/calendar"] as const) {
      const label = coreRouteLabel(href);
      expect(label).toBeTruthy();
      expect(beforeUi).toContain(`href="${href}"`);
      expect(beforeUi).toContain(label!);
    }
  });

  it("誇大表現やランキング表現（「最安」「全国対応」「ランキング」「No.1」「1位」）を含まない", () => {
    const html = renderLayoutWithMarker();
    for (const banned of ["最安", "全国対応", "ランキング", "No.1", "1位"]) {
      expect(html).not.toContain(banned);
    }
  });

  it("端末内完結の誤った主張や、入力なしで結果が出るという主張を含まない", () => {
    const html = renderLayoutWithMarker();
    expect(html).not.toContain("送信しません");
    expect(html).not.toContain("端末の中だけ");
    expect(html).toContain(
      "未入力の間は地図の塗り分けと街の一覧は表示されません",
    );
  });

  it("layout.tsx にページ名の固定リテラルを書かず coreRouteLabel 経由で引いている", () => {
    const src = readFileSync(LAYOUT_PATH, "utf8");
    const label = coreRouteLabel("/relocation/arbitrage")!;
    expect(src).not.toContain(label);
    expect(src).toContain('coreRouteLabel("/relocation/arbitrage")');
  });
});
