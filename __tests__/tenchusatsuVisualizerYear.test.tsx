import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenchusatsuVisualizer } from "@/components/TenchusatsuVisualizer";
import { calculateTenchusatsu } from "@/utils/tenchusatsu";
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

  it("8 年の帯を描く（見出しの「周期」の実体）", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00+09:00"));

    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);

    const strip = screen.getByRole("list", { name: "前後 8 年の天中殺" });
    const cells = strip.querySelectorAll("li");
    expect(cells).toHaveLength(8);
    // 3 年前から 4 年先まで。今年が含まれる。
    expect(strip.textContent).toContain("2023");
    expect(strip.textContent).toContain("2026");
    expect(strip.textContent).toContain("2030");
    // 12 年に 2 年なので、8 年の窓に天中殺の年は 1 つか 2 つ入る。
    const voidCells = Array.from(cells).filter((c) =>
      c.textContent?.includes("天中殺"),
    );
    expect(voidCells.length).toBeGreaterThanOrEqual(1);
    expect(voidCells.length).toBeLessThanOrEqual(2);
  });

  it("立春を過ぎていれば今までどおり暦年と同じ", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00+09:00"));

    expect(honmeiYearFor(new Date())).toBe(legacyLabelYear());

    render(<TenchusatsuVisualizer birthDateStr={BIRTH} />);
    expect(screen.getByText(/今年（2026 年・立春から）/)).toBeInTheDocument();
  });
});
