// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KanshiDayDetails } from "@/components/widgets/KanshiDayDetails";

afterEach(cleanup);

describe("暦の干支・節気表示", () => {
  it("立春当日は正午の干支と前後の切り替え、JST時刻を表示する", () => {
    render(<KanshiDayDetails date="2026-02-04" />);
    expect(screen.getByText(/年：丙午 ／ 月：庚寅/)).toBeTruthy();
    expect(screen.getByText(/節入り前は年乙巳・月己丑/)).toBeTruthy();
    expect(screen.getByText(/立春：2026-02-04 .* JST/)).toBeTruthy();
    expect(screen.getByText(/雨水：2026-02-19 .* JST/)).toBeTruthy();
    expect(screen.getByText(/公式暦と数分の差/)).toBeTruthy();
  });
  it("月が替わると節気一覧も変わり、通常日は境界候補を出さない", () => {
    const { rerender } = render(<KanshiDayDetails date="2026-02-04" />);
    rerender(<KanshiDayDetails date="2026-03-10" />);
    expect(screen.queryByText(/立春：/)).toBeNull();
    expect(screen.queryByText(/節入り前は/)).toBeNull();
    expect(screen.getByText(/啓蟄：2026-03-05 .* JST/)).toBeTruthy();
    expect(screen.getByText(/春分：2026-03-20 .* JST/)).toBeTruthy();
  });
});
