import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AreaQuickFind,
  matchAreas,
  nearestArea,
  type QuickFindArea,
} from "@/components/houi/AreaQuickFind";
import { SETTINGS_KEY } from "@/lib/userSettings";
import Page from "@/app/houi/area/page";

/**
 * エリア一覧（/houi/area）で自分の県・市区町村へすぐ行けること
 * （利用者の指摘、2026-09-30「スクロールして自分の居住都道府県を探すの
 * 大変かな」）。
 *
 * - 県は JIS の県番号順（北海道が先頭）。以前は静岡県が先頭だった
 * - 地方ごとの県の目次があり、どのリンクも頁内の県の見出しに飛べる
 * - 市区町村名で絞れる（表記の揺れ ヶ／ケ・全角半角を畳む）
 * - 登録した出発地がある人には、いちばん近い市区町村への近道を出す
 */

const AREAS: QuickFindArea[] = [
  ["13112", "13", "東京都世田谷区", 35.646, 139.653],
  ["12224", "12", "千葉県鎌ヶ谷市", 35.777, 140.001],
  ["01101", "01", "北海道札幌市中央区", 43.055, 141.341],
  ["47201", "47", "沖縄県那覇市", 26.212, 127.681],
];

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("名前で探す", () => {
  it("部分一致で拾う", () => {
    expect(matchAreas(AREAS, "世田谷").map((a) => a[0])).toEqual(["13112"]);
    expect(matchAreas(AREAS, "札幌").map((a) => a[0])).toEqual(["01101"]);
  });

  it("ヶ／ケと全角・空白の揺れを畳む", () => {
    expect(matchAreas(AREAS, "鎌ケ谷").map((a) => a[0])).toEqual(["12224"]);
    expect(matchAreas(AREAS, "那 覇").map((a) => a[0])).toEqual(["47201"]);
  });

  it("空なら何も出さない", () => {
    expect(matchAreas(AREAS, "  ")).toEqual([]);
  });
});

describe("いちばん近い市区町村", () => {
  it("那覇の近くなら那覇市、札幌の近くなら札幌市中央区", () => {
    expect(nearestArea(AREAS, 26.3, 127.8)?.[0]).toBe("47201");
    expect(nearestArea(AREAS, 43.0, 141.3)?.[0]).toBe("01101");
  });
});

describe("部品", () => {
  it("出発地が無ければ近道は出さない", () => {
    render(<AreaQuickFind areas={AREAS} />);
    expect(screen.queryByText(/登録した出発地にいちばん近い/)).toBeNull();
  });

  it("出発地があれば、近い市区町村と県の一覧への飛び先を出す", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ base_lat: 35.65, base_lon: 139.66 }),
    );
    render(<AreaQuickFind areas={AREAS} />);
    const link = screen.getByRole("link", { name: "東京都世田谷区" });
    expect(link.getAttribute("href")).toBe("/houi/area/13112");
    expect(
      screen.getByRole("link", { name: "この県の一覧へ" }).getAttribute("href"),
    ).toBe("#pref-13");
  });

  it("入力すると候補が出て、見つからなければそう書く", () => {
    render(<AreaQuickFind areas={AREAS} />);
    const box = screen.getByLabelText("市区町村名で探す");
    fireEvent.change(box, { target: { value: "那覇" } });
    expect(
      screen.getByRole("link", { name: "沖縄県那覇市" }).getAttribute("href"),
    ).toBe("/houi/area/47201");
    fireEvent.change(box, { target: { value: "架空市" } });
    expect(screen.getByText(/は見つかりませんでした/)).toBeTruthy();
  });
});

describe("頁（/houi/area）", () => {
  it("県は北海道から県番号順に並び、目次のリンクはどれも頁内の見出しに飛べる", () => {
    const { container } = render(<Page />);
    const ids = [...container.querySelectorAll("section[id^='pref-']")].map(
      (s) => s.id,
    );
    expect(ids[0]).toBe("pref-01");
    expect([...ids].sort()).toEqual(ids);
    const toc = [
      ...container.querySelectorAll("nav[aria-label='都道府県の目次'] a"),
    ].map((a) => a.getAttribute("href"));
    expect(toc.length).toBe(ids.length);
    for (const href of toc) expect(ids).toContain(href!.slice(1));
  });
});
