import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HomePortal, { type HomePortalProps } from "@/components/home/HomePortal";
import { ratingForStatus } from "@/lib/verdictRating";
import {
  getDailySolarSchedule,
  getZonedDateTimeFields,
} from "@/utils/solarTime";

const props: HomePortalProps = {
  onOpenTab: vi.fn(),
  evalDate: new Date("2026-10-10T12:00:00+09:00"),
  vectors: {},
  schedule: [],
  personalVoidZodiac: [],
  honmeiStar: null,
  useClassicalBoard: true,
  forecast: null,
  kpIndex: null,
  pressure: null,
  declination: null,
  profileIsSample: true,
};

afterEach(cleanup);

describe("方位の順位と吉凶を混同しない要点表示", () => {
  // 各段階と八方位で、既存の判定をそのまま表示することを確かめる。
  // 元の実装は全件凶でも「いま良い方位」と緑文字で表示していた。
  for (const status of [
    "OPTIMAL",
    "OPTIMAL_REGULAR",
    "SAFE",
    "WARNING",
    "NOISE_VOID",
    "NOISE_GOU",
  ]) {
    for (const dir of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) {
      it(`${dir} / ${status} の最上位表示は判定表と同じ段階・色`, () => {
        render(<HomePortal {...props} vectors={{ [dir]: status }} />);
        const summary = screen.getByText("方位の比較で最上位").parentElement!;
        const rating = ratingForStatus(status);
        const badge = Array.from(summary.querySelectorAll("span")).find(
          (el) => el.textContent === rating.rating,
        )!;
        expect(badge).toBeDefined();
        for (const name of rating.color.split(" "))
          expect(badge.classList.contains(name)).toBe(true);
        expect(screen.queryByText("いま良い方位")).toBeNull();
      });
    }
  }

  it("データが無い場合は吉方位なしと断定しない", () => {
    render(<HomePortal {...props} />);
    expect(screen.getByText("方位を計算中です")).toBeTruthy();
    expect(screen.queryByText("いま吉方位はありません")).toBeNull();
  });

  it("時間帯の終了を既存スケジュールの日本時間で示す", () => {
    const schedule = getDailySolarSchedule(props.evalDate, 139.6917);
    const current = schedule.find(
      (row) =>
        row.startStandard <= props.evalDate && props.evalDate < row.endStandard,
    )!;
    const end = getZonedDateTimeFields(current.endStandard, 9);
    const endLabel = `${String(end.hours).padStart(2, "0")}:${String(end.minutes).padStart(2, "0")}まで`;
    render(<HomePortal {...props} schedule={schedule} />);
    expect(screen.getByText(endLabel)).toBeTruthy();
    expect(screen.getByText("（日本時間・方位の切替時刻とは別）")).toBeTruthy();
  });

  it("日時と場所・時間帯の入口が既存の詳細を開く", () => {
    const onOpenTab = vi.fn();
    render(<HomePortal {...props} onOpenTab={onOpenTab} />);
    fireEvent.click(screen.getByRole("button", { name: "日付・場所を変更 →" }));
    expect(onOpenTab).toHaveBeenLastCalledWith("destination");
    fireEvent.click(
      screen.getByRole("button", { name: "時間帯の一覧を見る →" }),
    );
    expect(onOpenTab).toHaveBeenLastCalledWith("timing");
  });
});
