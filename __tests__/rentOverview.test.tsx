import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import housingStats from "@/data/housingStats.json";
import { AREAS, neighboursByDirection } from "@/lib/areaContent";
import {
  housingFiguresFor,
  type HousingSnapshotData,
} from "@/lib/housingSnapshot";
import {
  nearbyRentPlaces,
  rankRents,
  rentRows,
  rentSummary,
  rentFaqs,
  rentComparison,
} from "@/lib/rentOverview";
import {
  RentOverview,
  RentComparisonTable,
  RentFaq,
} from "@/components/houi/RentOverview";

const snapshot = housingStats as unknown as HousingSnapshotData;
const places = AREAS.filter((a) => a.code.startsWith("11"));

describe("公表データだけで作る家賃の説明", () => {
  it.each(["11218", "12101", "23101"])(
    "%s の単価・面積・月額は実データと既存の換算に一致する",
    (code) => {
      const a = snapshot.areas[code];
      const f = housingFiguresFor(snapshot, code)!;
      const text = rentSummary(snapshot, code, a.name);
      expect(text).toContain(
        `${a.rentPerTatamiYen!.toLocaleString("ja-JP")}円/月`,
      );
      expect(text).toContain(`${f.rentPerSqm!.toLocaleString("ja-JP")}円/月`);
      expect(text).toContain(`${a.floorAreaPerRental}㎡`);
      expect(text).toContain(`${a.tatamiPerRental}畳`);
      expect(text).toContain(
        `${f.monthlyRentEstimate!.toLocaleString("ja-JP")}円/月`,
      );
      expect(text).toContain(
        `${((a.vacantDwellings! / a.totalDwellings!) * 100).toFixed(1)}%`,
      );
    },
  );

  it("全県の順位・同順位は公表値だけで決まり、欠測は混ざらない", () => {
    for (const pref of new Set(AREAS.map((a) => a.code.slice(0, 2)))) {
      const pool = AREAS.filter((a) => a.code.startsWith(pref));
      const expected = pool.filter(
        (a) => snapshot.areas[a.code]?.rentPerTatamiYen != null,
      );
      for (const order of ["asc", "desc"] as const) {
        const ranked = rankRents(snapshot, pool, order);
        expect(ranked).toHaveLength(expected.length);
        for (const row of ranked) {
          const value = Math.round(
            snapshot.areas[row.code].rentPerTatamiYen! / 1.62,
          );
          expect(row.figures.rentPerSqm).toBe(value);
          expect(row.rank).toBe(
            1 +
              expected.filter((a) => {
                const other = Math.round(
                  snapshot.areas[a.code].rentPerTatamiYen! / 1.62,
                );
                return order === "asc" ? other < value : other > value;
              }).length,
          );
        }
      }
    }
  });

  it("近隣は同県・方位一覧の近い順で、掲載の家賃を参照しない", () => {
    const origin = AREAS.find((a) => a.code === "11218")!;
    const candidates = Object.values(neighboursByDirection(origin)).flat();
    const nearby = nearbyRentPlaces(candidates, "11");
    expect(nearby.map((a) => a.code)).toEqual(
      candidates
        .filter((a) => a.code.startsWith("11"))
        .sort(
          (a, b) => a.distanceKm - b.distanceKm || a.code.localeCompare(b.code),
        )
        .slice(0, 8)
        .map((a) => a.code),
    );
    const base = housingFiguresFor(snapshot, origin.code)!;
    for (const r of rentRows(snapshot, nearby)) {
      expect(r.figures).toEqual(housingFiguresFor(snapshot, r.code));
      if (r.figures?.rentPerSqm != null) {
        const diff = Math.round(
          ((r.figures.rentPerSqm - base.rentPerSqm!) / base.rentPerSqm!) * 100,
        );
        expect(rentComparison(base, r.figures)).toContain(`${Math.abs(diff)}%`);
      }
    }
    expect(rentComparison(null, base)).toBe("比較できません");
  });

  it("実在する欠測・行なしを0円や月額で補わない", () => {
    const missingRent = AREAS.find(
      (a) => snapshot.areas[a.code]?.rentPerTatamiYen === null,
    )!;
    const missingRow = AREAS.find((a) => !snapshot.areas[a.code])!;
    for (const p of [missingRent, missingRow]) {
      const answer = rentFaqs(snapshot, p.city, places, p.code)[0].answer;
      expect(answer).not.toContain("円/月");
      expect(rankRents(snapshot, [p])).toEqual([]);
    }
    expect(rentSummary(snapshot, missingRent.code, missingRent.city)).toContain(
      "家賃が公表されていません",
    );
    expect(rentSummary(snapshot, missingRow.code, missingRow.city)).toContain(
      "行がありません",
    );
  });

  it("県・全国の平均を作らず、可視FAQとJSON-LDが一致する", () => {
    expect(snapshot.areas["00000"]).toBeUndefined();
    expect(snapshot.areas["12000"]).toBeUndefined();
    const faqs = rentFaqs(snapshot, "埼玉県", places);
    const html = renderToStaticMarkup(<RentFaq items={faqs} />);
    const json = JSON.parse(
      html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1],
    );
    for (const [i, faq] of faqs.entries()) {
      expect(json.mainEntity[i].name).toBe(faq.question);
      expect(json.mainEntity[i].acceptedAnswer.text).toBe(faq.answer);
      expect(html).toContain(
        `<dt class="text-sm font-bold">${faq.question}</dt>`,
      );
      expect(html).toContain(faq.answer);
    }
    const first = rankRents(snapshot, places)[0];
    expect(faqs[1].answer).toContain(first.city);
    expect(faqs[1].answer).toContain(
      first.figures.rentPerSqm.toLocaleString("ja-JP"),
    );
    expect(faqs[0].answer).toContain(
      "県平均・全国平均との差は表示していません",
    );
  });

  it("要点の出典・生成日時・計算式と表のリンクを表示する", () => {
    const html = renderToStaticMarkup(
      <RentOverview
        snapshot={snapshot}
        code="11218"
        name="深谷市"
        count={rankRents(snapshot, places).length}
        source={<p>出典の欄</p>}
      />,
    );
    expect(html).toContain(snapshot.generatedAt);
    expect(html).toContain("出典の欄");
    expect(html).toContain(`${snapshot.year}年`);
    expect(html).toContain("1畳あたり家賃×借家1戸あたり畳数");
    expect(html).toContain("延べ面積にこの単価を掛ける計算はしていません");
    const rows = rankRents(snapshot, places).slice(0, 5);
    const table = renderToStaticMarkup(
      <RentComparisonTable title="比較" rows={rows} />,
    );
    for (const row of rows) expect(table).toContain(`/houi/area/${row.code}`);
    expect(table).toContain("空き家率");
  });
});
