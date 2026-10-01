import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfficialRentNote } from "@/components/houi/OfficialRentNote";
import { officialRentsForPref } from "@/lib/officialRentForPlace";
import estatRent from "@/data/estatRent.json";
import type { EstatRentSnapshot } from "@/utils/estatRent";

/**
 * 県・市区町村の頁の、毎月の民営家賃の札。いつの値か・単位・出典を
 * 必ず添える（値は毎月入れ替わるので、写しから期待値を作る）。
 */

afterEach(cleanup);
const SNAP = estatRent as EstatRentSnapshot;

describe("民営家賃の札", () => {
  it("千葉県: 市ごとの額・㎡あたり・前年同月比と、月と出典", () => {
    const rents = officialRentsForPref(SNAP, "12");
    render(
      <OfficialRentNote
        heading="千葉県の市の民営家賃"
        rents={rents}
        month="2026-08"
      />,
    );
    expect(
      screen.getByText("千葉県の市の民営家賃（2026年8月、毎月の公的統計）"),
    ).toBeTruthy();
    for (const r of rents) {
      expect(
        screen.getByText(new RegExp(`3.3㎡あたり ${r.yen.toLocaleString()}円`)),
      ).toBeTruthy();
    }
    expect(screen.getByText(/出典：政府統計の総合窓口\(e-Stat\)/)).toBeTruthy();
  });

  it("当たる市が無ければ何も出さない", () => {
    const { container } = render(
      <OfficialRentNote heading="x" rents={[]} month="2026-08" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("県の頁に置いてある（写しの最新月を渡す）", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/houi/pref/[code]/page.tsx"),
      "utf8",
    );
    expect(src).toContain("<OfficialRentNote");
    expect(src).toContain("officialRentsForPref(");
    expect(src).toContain("retail.latestMonth");
  });
});
