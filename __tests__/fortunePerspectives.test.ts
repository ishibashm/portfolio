// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { kanshiAt, solarTermsForYear } from "@/lib/kanshi";
import { calculateMcpDirections } from "@/lib/mcpDirections";
import {
  STAGE1_PERSPECTIVE_IDS,
  compareFortunePerspectives,
  fortuneCompareFromQuery,
  fortuneCompareQueryPresent,
  fortuneCompareRobots,
  type FortunePerspective,
} from "@/lib/fortunePerspectives";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { toJapanDateString } from "@/utils/japanDate";
import { TENCHUSATSU_WEAK_NOTE } from "@/utils/tenchusatsuPolicy";
import { ratingForStatus } from "@/lib/verdictRating";

function row(
  perspectives: FortunePerspective[],
  id: string,
): FortunePerspective {
  const found = perspectives.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function day(date: string) {
  const compared = compareFortunePerspectives({ candidates: [{ date }] });
  if (!compared.ok) throw new Error(compared.error);
  return compared.result.candidates[0].perspectives;
}

/**
 * 三碧木星で午未の空亡になる架空の生年月日。
 * 年は6月15日で本命星を見てから、その年の3月以降だけを日柱で探す。
 */
function fictionalSanpekiGoumibi(): string {
  for (const year of [1997, 2006, 2015, 1979]) {
    const probe = getHonmeiStar(new Date(`${year}-06-15T12:00:00+09:00`));
    if (probe.classical !== 3) continue;
    for (let month = 3; month <= 12; month++) {
      for (let dayOfMonth = 1; dayOfMonth <= 28; dayOfMonth++) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
        const date = new Date(`${iso}T12:00:00+09:00`);
        if (getHonmeiStar(date).classical !== 3) continue;
        const voids = getPersonalVoidZodiac(date);
        if (voids.join("") === "午未") return iso;
      }
    }
  }
  throw new Error("架空の三碧・午未が見つからない");
}

describe("占いの観点", () => {
  it("段階1の観点だけを、決まった順で出す", () => {
    const perspectives = day("2026-01-08");
    expect(perspectives.map((item) => item.id)).toEqual([
      ...STAGE1_PERSPECTIVE_IDS,
    ]);
    expect(perspectives.map((item) => item.id).join(" ")).not.toMatch(
      /shichu|sanmei|shuku|hakkaku|qimen|horoscope|tarot|ekikyo/,
    );
  });

  it("2026-01-08 の暦注は公開されている干支の表に合う", () => {
    const perspectives = day("2026-01-08");
    expect(row(perspectives, "kanshi").value).toContain("日壬午");
    expect(row(perspectives, "tenon").value).toBe("当たる");
    expect(row(perspectives, "daimyo").value).toBe("当たる");
    expect(row(perspectives, "shinkichi").value).toBe("当たる");
    expect(row(perspectives, "sanrinbo").judgment).toBe("凶");
    expect(row(perspectives, "bokura").value).toBe("当たる");
    expect(row(perspectives, "junichoku").value).toBe("執");
    expect(row(perspectives, "kishi").value).toBe("当たらない");
    const next = day("2026-01-09");
    expect(row(next, "sanrinbo").value).toBe("当たらない");
    expect(row(next, "kanshi").value).toContain("日癸未");
  });

  it("2026年4月の不成就日は旧暦の表どおり", () => {
    for (const date of [
      "2026-04-05",
      "2026-04-13",
      "2026-04-17",
      "2026-04-25",
    ]) {
      expect(row(day(date), "fuseiju").value).toBe("当たる");
    }
    expect(row(day("2026-04-06"), "fuseiju").value).toBe("当たらない");
  });

  it("不成就日は日本の旧暦で数える（2027年2月は7日が旧正月）", () => {
    // 朔が 2027-02-07 00:56 JST なので、日本の旧正月は 2/7、中国は 2/6。
    // 正月の不成就日は 3・11・19・27 日 → 日本では 2/9・2/17・2/25・3/5。
    // 中国の暦で数えていたころは 2/8・2/16・2/24・3/4 を当てていた。
    for (const date of [
      "2027-02-09",
      "2027-02-17",
      "2027-02-25",
      "2027-03-05",
    ]) {
      expect(row(day(date), "fuseiju").value, date).toBe("当たる");
    }
    for (const date of [
      "2027-02-08",
      "2027-02-16",
      "2027-02-24",
      "2027-03-04",
    ]) {
      expect(row(day(date), "fuseiju").value, date).toBe("当たらない");
    }
  });

  it("節月が替わる正午どうしは、十二直が前日と同じ名になる", () => {
    const term = solarTermsForYear(2026).find((item) => item.name === "立春");
    expect(term).toBeTruthy();
    const termDay = term!.atJst.slice(0, 10);
    let previous = "";
    let changed = false;
    for (let offset = -2; offset <= 3; offset++) {
      const instant = new Date(
        new Date(`${termDay}T12:00:00+09:00`).getTime() + offset * 86_400_000,
      );
      const iso = toJapanDateString(instant);
      const month = kanshiAt(instant).month;
      if (previous && month !== previous) {
        const before = new Date(instant.getTime() - 86_400_000);
        expect(row(day(toJapanDateString(before)), "junichoku").value).toBe(
          row(day(iso), "junichoku").value,
        );
        changed = true;
        break;
      }
      previous = month;
    }
    expect(changed).toBe(true);
  });

  it("数秘は成分を先に畳む", () => {
    const perspectives = day("2026-01-08");
    const withBirth = compareFortunePerspectives({
      birthDate: "2000-01-01",
      candidates: [{ date: "2026-01-08" }],
    });
    if (!withBirth.ok) throw new Error(withBirth.error);
    const rows = withBirth.result.candidates[0].perspectives;
    expect(row(perspectives, "personal_year").judgment).toBe("未確認");
    expect(row(rows, "personal_year").value).toBe("3");
    expect(row(rows, "personal_day").value).toBe("3");
  });

  it("経度と方位が無い九星は未確認で、暦注は出る", () => {
    const withoutBirth = day("2026-11-04");
    expect(row(withoutBirth, "kyusei_year").judgment).toBe("未確認");
    expect(row(withoutBirth, "kyusei_year").explanation).toContain("生年月日");
    const compared = compareFortunePerspectives({
      birthDate: "2000-01-01",
      candidates: [{ date: "2026-11-04" }],
    });
    if (!compared.ok) throw new Error(compared.error);
    const perspectives = compared.result.candidates[0].perspectives;
    expect(row(perspectives, "kyusei_year").explanation).toContain("経度");
    expect(row(perspectives, "rokuyo").value.length).toBeGreaterThan(0);
    expect(row(perspectives, "tenon").value).toBe("当たる");
  });

  it("三碧・午未の架空の人は、既存の方位判定と一致し、天中殺は弱める", () => {
    const birthDate = fictionalSanpekiGoumibi();
    expect(["1997", "2006", "2015", "1979"]).toContain(birthDate.slice(0, 4));
    const direct = calculateMcpDirections({
      birthDate,
      lon: 135,
      date: "2026-11-04",
      tenchusatsuMode: "weaken",
    });
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    const north = direct.payload.directions.find(
      (item) => item.direction === "N",
    );
    expect(north).toBeTruthy();
    const compared = compareFortunePerspectives({
      birthDate,
      lon: 135,
      candidates: [{ date: "2026-11-04", direction: "N" }],
    });
    if (!compared.ok) throw new Error(compared.error);
    const perspectives = compared.result.candidates[0].perspectives;
    expect(
      row(perspectives, "kyusei_composite").value.startsWith(`${north!.tier} `),
    ).toBe(true);
    expect(row(perspectives, "kyusei_year").value).toBe(
      ratingForStatus(north!.yearLayer).rating,
    );
    expect(row(perspectives, "kyusei_month").value).toBe(
      ratingForStatus(north!.monthLayer).rating,
    );
    expect(row(perspectives, "kyusei_day").value).toBe(
      ratingForStatus(north!.dayLayer).rating,
    );
    expect(compared.result.birth.honmeiStar).toBe("三碧木星");
    expect(direct.payload.tenchusatsu.inPeriod).toBe(true);
    expect(direct.payload.blockedByTenchusatsu).toBe(false);
    const tenchu = row(perspectives, "tenchusatsu");
    expect(tenchu.judgment).toBe("弱");
    expect(tenchu.explanation).toContain(TENCHUSATSU_WEAK_NOTE);
    expect(tenchu.explanation).toContain("禁止にはしません");
    expect(row(perspectives, "kyusei_composite").judgment).not.toBe("未確認");
  });

  it("方位が無いときは八方位を列挙し、一つの判定にはしない", () => {
    const birthDate = fictionalSanpekiGoumibi();
    const compared = compareFortunePerspectives({
      birthDate,
      lon: 135,
      candidates: [{ date: "2026-11-04" }],
    });
    if (!compared.ok) throw new Error(compared.error);
    const year = row(compared.result.candidates[0].perspectives, "kyusei_year");
    expect(year.judgment).toBe("未確認");
    expect(year.value).toContain("北");
    expect(year.value).toContain("北西");
  });

  it("空のフォームは計算せず、日付の無い送信はエラーにする", () => {
    expect(fortuneCompareQueryPresent({})).toBe(false);
    expect(fortuneCompareRobots(false).index).toBe(true);
    expect(fortuneCompareRobots(true).index).toBe(false);
    expect(fortuneCompareFromQuery({}).status).toBe("blank");
    const missing = fortuneCompareFromQuery({ compare: "1" });
    expect(missing.status).toBe("error");
    expect(fortuneCompareQueryPresent({ compare: "1" })).toBe(true);
    const page = readFileSync("src/app/houi/fortune-compare/page.tsx", "utf8");
    expect(page).not.toMatch(/["']use client["']/);
    expect(page).not.toMatch(/localStorage|sessionStorage|saveSettings/);
  });

  it("11件目と実在しない日付は受け取らない", () => {
    expect(
      compareFortunePerspectives({
        candidates: Array.from({ length: 11 }, () => ({ date: "2026-01-08" })),
      }).ok,
    ).toBe(false);
    expect(
      compareFortunePerspectives({ candidates: [{ date: "2026-02-30" }] }).ok,
    ).toBe(false);
  });
});
