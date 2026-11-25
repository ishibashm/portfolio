import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/houi/[year]/[star]/page";
import {
  contentYears,
  getMonthDirections,
  getYearDirections,
  MONTHS,
  STAR_NAMES,
  STARS,
} from "@/lib/kigakuContent";

vi.mock("@/components/ads/AdBanner", () => ({ AdBanner: () => null }));
vi.mock("@/components/practitioners/PractitionerStrip", () => ({
  PractitionerStrip: () => null,
}));
vi.mock("@/components/motion/CompassDial", () => ({ CompassDial: () => null }));

function expectedJoinDirections(names: string[]): string {
  if (names.length === 2) return `${names[0]}と${names[1]}`;
  return names.join("・");
}

function expectedAnswerText(year: number, star: number): string {
  const name = STAR_NAMES[star];
  const { verdicts } = getYearDirections(year, star, "classical");
  const good = verdicts.filter((v) => v.kind === "good");
  const bad = verdicts.filter((v) => v.kind === "bad");
  const first =
    good.length > 0
      ? `${name}の${year}年の吉方位は${expectedJoinDirections(good.map((v) => v.jp))}です。`
      : `${name}の${year}年は、吉方位にあたる方位はありません。`;
  const second =
    bad.length > 0
      ? `避けたい方位は${bad.map((v) => `${v.jp}（${v.label}）`).join("、")}です。`
      : "";
  return `${first}${second}`;
}

describe("/houi/[year]/[star] 冒頭の結論と月別早見表", () => {
  it("すべての公開年×本命星で data-testid='houi-answer' と月別早見表を先頭に出す", async () => {
    for (const year of contentYears()) {
      for (const star of STARS) {
        const html = renderToStaticMarkup(
          await Page({
            params: Promise.resolve({ year: String(year), star: String(star) }),
          }),
        );
        const doc = new DOMParser().parseFromString(html, "text/html");
        const name = STAR_NAMES[star];
        const { verdicts } = getYearDirections(year, star, "classical");
        const good = verdicts.filter((v) => v.kind === "good");

        const answer = doc.querySelector('[data-testid="houi-answer"]');
        expect(answer).not.toBeNull();
        const answerText = answer!.textContent ?? "";

        if (good.length > 0) {
          expect(answerText.startsWith(`${name}の${year}年の`)).toBe(true);
          expect(answerText).toContain(
            `${name}の${year}年の吉方位は${expectedJoinDirections(good.map((v) => v.jp))}です。`,
          );
        } else {
          expect(answerText).toContain(
            `${name}の${year}年は、吉方位にあたる方位はありません。`,
          );
        }
        expect(answerText).toBe(expectedAnswerText(year, star));

        // 結論段落の直後が早見表セクションで、その後に既存の年盤導入文が続く
        const tableSection = doc.querySelector(
          'section[aria-labelledby="houi-month-table-heading"]',
        );
        expect(tableSection).not.toBeNull();
        expect(answer!.nextElementSibling).toBe(tableSection);
        expect(
          tableSection!.querySelector("#houi-month-table-heading")?.textContent,
        ).toBe(`${year}年 ${name}の月ごとの吉方位・凶方位（早見表）`);

        const introParagraph = [...doc.querySelectorAll("p")].find((p) =>
          p.textContent?.includes("年の年盤は中宮が"),
        );
        expect(introParagraph).toBeDefined();
        expect(
          answer!.compareDocumentPosition(tableSection!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          tableSection!.compareDocumentPosition(introParagraph!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        const rows = tableSection!.querySelectorAll("table tbody > tr");
        expect(rows).toHaveLength(12);

        const prevAnnual = getYearDirections(
          year - 1,
          star,
          "classical",
        ).verdicts;
        rows.forEach((row, index) => {
          const month = MONTHS[index];
          const { verdicts: monthly } = getMonthDirections(
            year,
            month,
            star,
            "classical",
          );
          const monthlyGood = monthly.filter((v) => v.kind === "good");
          const monthlyBad = monthly.filter((v) => v.kind === "bad");
          const annual = month === 1 ? prevAnnual : verdicts;
          const bothGood = monthlyGood.filter((v) =>
            annual.some(
              (a) => a.direction === v.direction && a.kind === "good",
            ),
          );

          const th = row.querySelector('th[scope="row"]');
          const tds = row.querySelectorAll("td");
          expect(th?.textContent).toBe(`${month}月`);
          expect(tds).toHaveLength(3);
          expect(tds[0].textContent).toBe(
            bothGood.length ? bothGood.map((v) => v.jp).join("・") : "—",
          );
          expect(tds[1].textContent).toBe(
            monthlyGood.length
              ? monthlyGood.map((v) => v.jp).join("・")
              : "なし",
          );
          expect(tds[2].textContent).toBe(
            monthlyBad.length
              ? monthlyBad.map((v) => `${v.jp}（${v.label}）`).join("、")
              : "なし",
          );
        });
      }
    }
  });

  it("2028年の七赤金星でエンジンの算出結果と一致する結論テキストを出力する", async () => {
    const html = renderToStaticMarkup(
      await Page({
        params: Promise.resolve({ year: "2028", star: "7" }),
      }),
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const answer = doc.querySelector('[data-testid="houi-answer"]');
    expect(answer).not.toBeNull();
    expect(answer!.textContent).toBe(expectedAnswerText(2028, 7));
  });
});
