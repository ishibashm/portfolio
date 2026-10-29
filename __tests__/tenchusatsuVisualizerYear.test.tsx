import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenchusatsuVisualizer } from "@/components/TenchusatsuVisualizer";
import { calculateTenchusatsu, getYearBranch } from "@/utils/tenchusatsu";
import { honmeiYearFor } from "@/utils/honmeiYear";

/**
 * 「今年の状態」の札と中身が、**同じ年**を指しているか。
 *
 * この部品は VOID / CLEAR の判定を `honmeiYearFor`（立春切り）で出す
 * のに、その横に出す年の札だけ `new Date().getFullYear()`（暦年）で
 * 作っていた。1 月 1 日から立春までの 5 週間は 2 つが 1 年ずれるので、
 * **同じ枠の中で「2025 年の状態」に「2026」の札が付いていた。**
 *
 * 直す前の実装（下の LEGACY）をここに写してある。旧挙動に戻すと
 * 1 つ目のテストが落ちる。
 */

/** 直す前の実装。暦年で切っていた。 */
const legacyLabelYear = () => new Date().getFullYear();

afterEach(() => {
  vi.useRealTimers();
});

/** 午未天中殺の人。年の状態が年によって変わるので札のずれが見える。 */
const BIRTH = "1990-01-02";

describe("天中殺の「今年の状態」の札", () => {
  it("立春前（1/20）は節年の 2025 を出す。暦年の 2026 ではない", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T09:00:00+09:00"));

    /* 節年と暦年が食い違う日であることを先に固定する。ここが同じ日を
       選んでいると、下の検査は何も見ていないことになる */
    expect(honmeiYearFor(new Date())).toBe(2025);
    expect(legacyLabelYear()).toBe(2026);

    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);

    expect(screen.getByText(/今年（2025 年・立春から）/)).toBeInTheDocument();
    expect(screen.queryByText(/今年（2026 年・立春から）/)).toBeNull();
  });

  it("札の年と、VOID / CLEAR の中身の年が一致する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T09:00:00+09:00"));

    const expected = calculateTenchusatsu(new Date(BIRTH), 2025);
    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);

    const phase = expected.isYearTenchusatsu ? "年の天中殺" : "天中殺ではない";
    expect(screen.getByText(phase)).toBeInTheDocument();
    expect(screen.getByText(/今年（2025 年・立春から）/)).toBeInTheDocument();
  });

  it("12 年の帯を描く（見出しの「周期」の実体）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00+09:00"));

    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);

    const strip = screen.getByRole("list", { name: "前後 12 年の天中殺" });
    const cells = strip.querySelectorAll("li");
    expect(cells).toHaveLength(12);
    // 5 年前から 6 年先まで。今年が含まれる。
    expect(strip.textContent).toContain("2021");
    expect(strip.textContent).toContain("2026");
    expect(strip.textContent).toContain("2032");
    // 12 年の窓には天中殺の年が必ず 2 つ入る。
    const voidCells = Array.from(cells).filter((c) =>
      c.textContent?.includes("天中殺"),
    );
    expect(voidCells).toHaveLength(2);
  });

  it("立春を過ぎていれば今までどおり暦年と同じ", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00+09:00"));

    expect(honmeiYearFor(new Date())).toBe(legacyLabelYear());

    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);
    expect(screen.getByText(/今年（2026 年・立春から）/)).toBeInTheDocument();
  });
});

// 甲子の日から 10 日ずつ進め、6 つの旬（天中殺グループ）を網羅する。
const GROUP_BIRTHS = [
  ["戌亥", "2000-01-07"],
  ["申酉", "2000-01-17"],
  ["午未", "2000-01-27"],
  ["辰巳", "2000-02-06"],
  ["寅卯", "2000-02-16"],
  ["子丑", "2000-02-26"],
] as const;

describe.each([2026, 2027, 2033])("%i 年の 12 年の帯", (year) => {
  it.each(GROUP_BIRTHS)(
    "%s は赤いセルがちょうど 2 枚になる",
    (group, birth) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${year}-06-01T12:00:00+09:00`));
      const data = calculateTenchusatsu(
        new Date(`${birth}T00:00:00+09:00`),
        year,
      );
      expect(data.tenchusatsu.name).toBe(group);

      render(<TenchusatsuVisualizer birthDateStr={birth} />);
      const strip = screen.getByRole("list", { name: "前後 12 年の天中殺" });
      const cells = Array.from(strip.querySelectorAll("li"));
      expect(cells).toHaveLength(12);
      expect(
        cells.filter((cell) => cell.classList.contains("bg-red-50")),
      ).toHaveLength(2);
      // 年の十二支を独立した基準（2020 年＝子）から検証する。
      const branches = "子丑寅卯辰巳午未申酉戌亥";
      cells.forEach((cell, index) => {
        const cellYear = year - 5 + index;
        const expected = group.includes(
          branches[(((cellYear - 2020) % 12) + 12) % 12],
        );
        expect(cell.children[0]).toHaveTextContent(String(cellYear));
        expect(cell.children[1]).toHaveTextContent(expected ? "天中殺" : "—");
        expect(cell.classList.contains("bg-red-50")).toBe(expected);
        if (cellYear === year) {
          expect(cell).toHaveClass("ring-1");
          expect(expected).toBe(data.isYearTenchusatsu);
        }
      });
      if (year === 2033 && group === "子丑") {
        expect(
          cells.filter((cell) => cell.classList.contains("bg-red-50")),
        ).toEqual([cells[4], cells[5]]); // 2032・2033 年
      }
    },
  );
});

describe("getYearBranch", () => {
  it.each([
    [1996, "子"],
    [2007, "亥"],
    [2008, "子"],
    [2026, "午"],
    [2027, "未"],
    [2032, "子"],
    [2033, "丑"],
    [2044, "子"],
  ])("%i 年は %s", (year, branch) => {
    expect(getYearBranch(year)).toBe(branch);
  });
});
