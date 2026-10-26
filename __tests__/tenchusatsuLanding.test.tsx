import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { fireEvent, render, screen } from "@testing-library/react";
import { calculateTenchusatsu } from "@/utils/tenchusatsu";
import {
  tenchusatsuForCivilDate,
  TENCHUSATSU_GROUPS,
} from "@/utils/tenchusatsuCore";
import { tenchusatsuTimeline } from "@/lib/tenchusatsuTimeline";
import { solarTermsForYear } from "@/lib/kanshi";
import { TenchusatsuChecker } from "@/components/houi/TenchusatsuChecker";
import { createRequire } from "module";

const now = new Date("2026-10-26T12:00:00+09:00");

describe("天中殺LP", () => {
  it("軽量日柱が既存のlunar-javascriptと全60干支・閏年・世紀境界で一致する", () => {
    for (const year of [1900, 1904, 1999, 2000, 2026, 2050, 2100]) {
      for (let offset = 0; offset < 366; offset += 3) {
        const date = new Date(Date.UTC(year, 0, 1 + offset));
        const y = date.getUTCFullYear(),
          m = date.getUTCMonth() + 1,
          d = date.getUTCDate();
        const lunar = Solar.fromYmdHms(y, m, d, 12, 0, 0)
          .getLunar()
          .getEightChar();
        expect(tenchusatsuForCivilDate(y, m, d).ganZhi).toBe(
          lunar.getDayGan() + lunar.getDayZhi(),
        );
      }
    }
    expect(
      new Set(
        Array.from(
          { length: 60 },
          (_, i) => tenchusatsuForCivilDate(2000, 1, 7 + i).tenchusatsu.name,
        ),
      ).size,
    ).toBe(6);
  });
  it("JSTの日界と23時の既存sect=2を維持する", () => {
    for (const time of ["00:00:00", "22:59:59", "23:00:00", "23:59:59"]) {
      expect(
        calculateTenchusatsu(new Date(`2000-01-07T${time}+09:00`)).ganZhi,
      ).toBe("甲子");
    }
    expect(calculateTenchusatsu(new Date("2000-01-07T15:00:00Z")).ganZhi).toBe(
      "乙丑",
    );
  });
  it("36節月を表示し、未公開の月別URLは作らない", () => {
    const data = tenchusatsuTimeline(now);
    expect(data.months).toHaveLength(36);
    expect(data.months[0].slug).toBe("2026-10");
    expect(data.months[35].slug).toBe("2029-09");
    expect(data.months.filter((m) => m.href !== "/calendar")).toHaveLength(18);
    for (const group of TENCHUSATSU_GROUPS) {
      expect(
        data.months.filter((m) => group.voidBranches.includes(m.branch)),
      ).toHaveLength(6);
    }
  });
  it("立春の瞬間に年と月が切り替わる", () => {
    const boundary = new Date(
      solarTermsForYear(2026).find((t) => t.name === "立春")!.atJst,
    );
    const before = tenchusatsuTimeline(new Date(boundary.getTime() - 1000));
    const after = tenchusatsuTimeline(boundary);
    expect([before.yearBranch, before.monthBranch]).toEqual(["巳", "丑"]);
    expect([after.yearBranch, after.monthBranch]).toEqual(["午", "寅"]);
  });
  it("入力で結果と36か月が表示され、不正・未来の入力で結果を消す", () => {
    render(<TenchusatsuChecker timeline={tenchusatsuTimeline(now)} />);
    const input = screen.getByLabelText("生年月日から天中殺を調べる");
    fireEvent.change(input, { target: { value: "2000-01-07" } });
    expect(screen.getByText(/あなたは戌亥天中殺/)).toBeTruthy();
    expect(screen.getAllByText("天中殺月", { exact: true })).toHaveLength(6);
    fireEvent.change(input, { target: { value: "2027-01-01" } });
    expect(screen.queryByText(/あなたは/)).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("動的LPをサイトマップへ明示的に含める", async () => {
    const config = createRequire(import.meta.url)("../next-sitemap.config.js");
    const paths = await config.additionalPaths(config);
    expect(
      paths.some((p: { loc: string }) => p.loc === "/houi/tenchusatsu"),
    ).toBe(true);
  });
});
