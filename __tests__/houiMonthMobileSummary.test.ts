import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// U2: 月ページの 1 画面目は吉方位・凶方位・注意日だけ。詳細は <details> に畳み、HTML には残す。
it("月ページは結論の要約を先に置き、8方位の詳細を折りたたむ", () => {
  const src = readFileSync(
    "src/app/houi/[year]/[star]/[month]/page.tsx",
    "utf8",
  );
  const summary = src.indexOf('data-testid="month-summary"');
  const details = src.indexOf("8方位の詳しい判定を開く");
  expect(summary).toBeGreaterThan(0);
  expect(details).toBeGreaterThan(summary);
  for (const label of ["吉方位</dt>", "凶方位</dt>", "注意日</dt>"])
    expect(src).toContain(label);
  expect(src).toContain("<details");
});
