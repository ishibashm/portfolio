import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmailUrlChoices } from "@/components/relocation/EmailUrlChoices";

/**
 * 取り込んだ物件を 1 件 1 枚の札で見せる（利用者の指摘、2026-09-27
 * 「整形して見やすくしてほしい」）。以前は「賃料（円）: 68000」を 1 行ずつ
 * 積み、長い転送 URL を丸ごと出していた。値は架空。
 */

const long =
  "https://click.example.com/?qs=AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL";
const listings = [
  {
    url: long,
    propertyName: "架空メゾン 0302",
    rentYen: 68000,
    managementFeeYen: 5000,
    layout: "1LDK",
    floorAreaM2: 30.78,
    nearestStation: "架空線 架空駅",
    walkMinutes: 14,
    address: "架空県架空市1丁目",
    deposit: "1ヶ月",
  },
  { url: "https://www.example.jp/chintai/1/" },
];

it("物件名を見出しに、賃料・間取り・駅・所在地をまとめて出す", () => {
  render(
    <EmailUrlChoices
      urls={listings.map((l) => l.url)}
      listings={listings}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText("架空メゾン 0302")).toBeTruthy();
  expect(
    screen.getByText("68,000円 ＋ 管理費・共益費 5,000円 ／ 1LDK・30.78㎡"),
  ).toBeTruthy();
  expect(screen.getByText("架空線 架空駅 徒歩14分")).toBeTruthy();
  expect(screen.getByText("架空県架空市1丁目")).toBeTruthy();
  expect(screen.getByText("敷金 1ヶ月")).toBeTruthy();
  /* 項目名を 1 行ずつ積む形に戻っていない */
  expect(screen.queryByText(/賃料（円）/)).toBeNull();
});

it("URL は見せずにサイト名だけ書き、名前の無い物件も札になる", () => {
  render(
    <EmailUrlChoices
      urls={listings.map((l) => l.url)}
      listings={listings}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText("click.example.com の物件")).toBeTruthy();
  expect(screen.getByText("example.jp の物件")).toBeTruthy();
  expect(screen.getByText("名称なし")).toBeTruthy();
  /* 長い URL は読み上げ用の隠し文字にだけ残る */
  const hidden = screen.getAllByText(/qs=AAAA/);
  expect(hidden.every((el) => el.className.includes("sr-only"))).toBe(true);
});

it("ボタンは URL で区別でき、押すとその物件を渡す", () => {
  const onSelect = vi.fn();
  render(
    <EmailUrlChoices
      urls={listings.map((l) => l.url)}
      listings={listings}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: `${long}：この物件を選ぶ` }),
  );
  expect(onSelect).toHaveBeenCalledWith(long);
});
