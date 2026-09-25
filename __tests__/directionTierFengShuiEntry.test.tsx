import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DirectionTierOverview,
  type DirectionTierRow,
} from "@/components/relocation/DirectionTierOverview";

/**
 * /relocation/arbitrage の「方位ごとの内訳」から、風水（八宅）を併記できること
 * （利用者の指摘、2026-09-25「風水の評価も入っているのを教えてほしい」）。
 *
 * 遊星の列は前からあったが、**入口がシミュレータにしか無かった。**そこで
 * 一度「併記する」を押した人にしか出ず、この頁から風水を見られることが
 * 分からなかった。
 *
 * 併記であって合算ではない。気学の段階・並び・色は変えない。
 */

const rows: DirectionTierRow[] = [
  { direction: "N", directionLabel: "北", tier: "A", blocked: false, count: 3 },
  { direction: "S", directionLabel: "南", tier: "C", blocked: false, count: 5 },
];

/* 1990 年生まれ（公開の例示用の日付。利用者の値ではない） */
const BIRTH = "1990-06-15T12:00";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function mount(birthDate?: string) {
  render(
    <DirectionTierOverview
      rows={rows}
      selectedDirection="ALL"
      onSelectDirection={() => {}}
      birthDate={birthDate}
    />,
  );
}

describe("風水（八宅）の入口", () => {
  it("未設定なら、並べられることと「併記する」を出す", () => {
    mount(BIRTH);
    expect(
      screen.getByText(/風水（八宅）の吉凶も、方位ごとに右端へ並べられます/),
    ).toBeTruthy();
    expect(screen.getByText("既定では判定に使っていません")).toBeTruthy();
    expect(screen.getByRole("button", { name: "併記する" })).toBeTruthy();
  });

  it("「併記する」→ 性別を選ぶと、右端に遊星が出る（気学とは足さない旨も）", () => {
    mount(BIRTH);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "併記する" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "男性" }));
    });
    expect(screen.getByText(/右端は風水（八宅）の遊星です/)).toBeTruthy();
    expect(
      screen.getByText("気学の段階とは足し合わせていません。"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "併記する" })).toBeNull();
  });

  it("生年月日が無ければ入口を出さない（本命卦が決まらない）", () => {
    mount(undefined);
    expect(screen.queryByRole("button", { name: "併記する" })).toBeNull();
  });
});
