import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import stats from "@/data/marketStats.json";
import MarketAnalyticsPage from "@/app/relocation/market/page";

/**
 * 家賃市場の頁（/relocation/market）の推移のグラフは、掲載の取り込みを
 * 止めた日で終わっている。題に最終日を出し、今も動いているように見せない
 * （利用者の指摘、2026-09-30「スクレイピングは止まっていると思うけど、
 * このデータは最新？」）。
 */

afterEach(() => cleanup());

it("家賃指数と新規掲載の推移の題に、系列の最終日と「で停止」が出る", () => {
  render(<MarketAnalyticsPage />);
  const lastIndex = stats.rentIndexSeries.at(-1)!.date;
  const lastDaily = stats.dailyNewListings.at(-1)!.date;
  expect(
    screen.getByRole("heading", {
      name: `家賃指数の推移（全国・㎡単価中央値）— ${lastIndex} で停止`,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      name: `新規掲載の推移（出来高）— ${lastDaily} で停止`,
    }),
  ).toBeTruthy();
});
