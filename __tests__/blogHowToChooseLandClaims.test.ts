import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import purchaseStats from "@/data/purchaseStats.json";

/**
 * 公開記事 how-to-choose-land の数字を、購入の相場の集計
 * （src/data/purchaseStats.json）と照合する（2026-10-01 の監査。
 * どのテストからも参照されていなかった）。
 *
 * 数え直したら全部一致した（全国の 3 種の件数と㎡単価の中央値、
 * 7 都道府県の建物比率）。
 *
 * ## 完全一致ではなく幅で見る
 *
 * 集計は bot が毎週作り直して master に直接載せる（chore(data):
 * 購入の相場を更新する）。記事は「2026 年 8 月時点」の数字なので、
 * 完全一致にすると**データの更新だけで master が赤くなる。**記事が
 * 言っているのは**順序と桁**（土地のみ < 土地と建物 < マンション、
 * 東京は建物比率が低く秋田は半々）なので、順序は厳密に、値は幅で見る。
 * 幅を超えて動いたら記事の数字が古くなったしるしなので、そのとき
 * 記事を書き直す。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/how-to-choose-land.md"),
  "utf-8",
);

type ByType = { type: string; count: number; unitPrice: { median: number } };
const byType = (t: string): ByType => {
  const r = (purchaseStats.national.byType as ByType[]).find(
    (x) => x.type === t,
  );
  expect(r, t).toBeTruthy();
  return r!;
};
const ratioOf = (pref: string): number => {
  const r = purchaseStats.prefectures.find((x) => x.prefecture === pref);
  expect(r?.medianBuildingRatio, pref).toBeTypeOf("number");
  return r!.medianBuildingRatio as number;
};

/** 記事の表の値（万）を、集計の値と比べる。幅は相対で 10%。 */
function near(actual: number, stated: number, tol = 0.1) {
  expect(Math.abs(actual - stated) / stated).toBeLessThan(tol);
}

describe("記事: 土地の選び方", () => {
  const ROWS = [
    { label: "宅地（土地のみ）", type: "宅地(土地)", count: 45.0, unit: 5.7 },
    {
      label: "宅地（土地と建物）",
      type: "宅地(土地と建物)",
      count: 89.7,
      unit: 16.5,
    },
    {
      label: "中古マンション等",
      type: "中古マンション等",
      count: 70.9,
      unit: 45.0,
    },
  ];

  it("全国の表（件数と㎡単価の中央値）が集計に近い", () => {
    for (const r of ROWS) {
      const line = md.split("\n").find((l) => l.startsWith(`| ${r.label} `));
      expect(line, r.label).toContain(`約 ${r.count.toFixed(1)} 万件`);
      expect(line, r.label).toContain(`約 ${r.unit.toFixed(1)} 万円`);
      const t = byType(r.type);
      near(t.count / 10000, r.count);
      near(t.unitPrice.median / 10000, r.unit);
    }
  });

  it("順序は 土地のみ < 土地と建物 < マンション（記事の主張）", () => {
    const [land, house, mansion] = ROWS.map(
      (r) => byType(r.type).unitPrice.median,
    );
    expect(land).toBeLessThan(house);
    expect(house).toBeLessThan(mansion);
  });

  const PREFS: [string, number][] = [
    ["東京都", 17],
    ["京都府", 25],
    ["大阪府", 29],
    ["愛知県", 37],
    ["北海道", 38],
    ["島根県", 46],
    ["秋田県", 48],
  ];

  it("建物比率の表が集計に近い（±2 ポイント）", () => {
    for (const [pref, pct] of PREFS) {
      const line = md.split("\n").find((l) => l.startsWith(`| ${pref} `));
      expect(line, pref).toMatch(new RegExp(`\\| ${pct}%\\s+\\|`));
      expect(Math.abs(ratioOf(pref) * 100 - pct), pref).toBeLessThan(2);
    }
  });

  it("建物比率は表の並び（東京が最も低く、秋田が最も高い）のまま", () => {
    const ratios = PREFS.map(([p]) => ratioOf(p));
    for (let i = 1; i < ratios.length; i++) {
      /* 愛知（36.6%）と北海道（38.2%）のように近い所もあるので、
         同値までは許す */
      expect(ratios[i], PREFS[i][0]).toBeGreaterThanOrEqual(ratios[i - 1]);
    }
  });

  it("「東京で 4,000 万円なら 3,300 万円以上が土地代」が建物比率から出る", () => {
    expect(md).toContain("東京で 4,000 万円の中古戸建てを買うと");
    expect(md).toContain("3,300 万円以上が土地代");
    expect(4000 * (1 - ratioOf("東京都"))).toBeGreaterThanOrEqual(3300);
  });
});
