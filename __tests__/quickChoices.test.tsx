import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  BirthYearPicker,
  DateChips,
  MonthDayPicker,
  OriginChooser,
  presetDate,
} from "@/components/inputs/QuickChoices";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("月末・閏年・年越しをJSTの日付として扱う", () => {
  expect(presetDate("today", "2026-12-31")).toBe("2026-12-31");
  expect(presetDate("month", "2024-01-31")).toBe("2024-02-29");
  expect(presetDate("month", "2025-01-31")).toBe("2025-02-28");
  expect(presetDate("quarter", "2026-11-30")).toBe("2027-02-28");
  expect(presetDate("half", "2026-08-31")).toBe("2027-02-28");
});
it("日付チップを選び、必要なときだけ日付欄を開く", () => {
  const onChange = vi.fn();
  render(
    <DateChips today="2026-10-18" value="2026-10-18" onChange={onChange} />,
  );
  expect(screen.getByRole("button", { name: "今日" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByLabelText("日付を選ぶ")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "3か月後" }));
  expect(onChange).toHaveBeenLastCalledWith("2027-01-18");
  fireEvent.click(screen.getByRole("button", { name: "日付を選ぶ" }));
  fireEvent.change(screen.getByLabelText("日付を選ぶ"), {
    target: { value: "2027-01-25" },
  });
  expect(onChange).toHaveBeenLastCalledWith("2027-01-25");
});
it("年代→年→月→日で閏日を選び、月変更で日を消す", () => {
  function Picker() {
    const [year, setYear] = useState("");
    const [date, setDate] = useState("");
    return (
      <>
        <BirthYearPicker value={year} onChange={setYear} />
        {year && (
          <MonthDayPicker
            key={year}
            year={year}
            value={date}
            onChange={setDate}
          />
        )}
        <output>{date}</output>
      </>
    );
  }
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
  fireEvent.click(screen.getByRole("button", { name: "1988年" }));
  fireEvent.click(screen.getByRole("button", { name: "2月" }));
  expect(screen.queryByRole("button", { name: "30日" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "29日" }));
  expect(screen.getByRole("status")).toHaveTextContent("1988-02-29");
  fireEvent.click(screen.getByRole("button", { name: "4月" }));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
  expect(screen.queryByRole("button", { name: "31日" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "変える" }));
  expect(screen.getByRole("button", { name: "1940年代" })).toBeTruthy();
});
it("平年の2月は28日まで", () => {
  render(<MonthDayPicker year="1990" onChange={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "2月" }));
  expect(screen.queryByRole("button", { name: "29日" })).toBeNull();
});
it("現在地はタップ後だけ取得し、丸めた座標から市区町村名を返す", async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({
      coords: { latitude: 35.170915, longitude: 136.881537 },
    } as GeolocationPosition),
  ); // 名古屋駅
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  const fetcher = vi.fn(async () =>
    Response.json({ data: { name: "愛知県名古屋市中村区" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const onPick = vi.fn();
  render(<OriginChooser onPick={onPick} />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "現在地" }));
  await screen.findByRole("button", { name: "現在地" });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/geocode/reverse?lat=35.17&lon=136.88",
  );
  expect(onPick).toHaveBeenCalledWith({ name: "愛知県名古屋市中村区" });
});
it("位置情報の拒否と非対応を表示する", () => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (_: PositionCallback, error: PositionErrorCallback) =>
        error({} as GeolocationPositionError),
    },
  });
  render(<OriginChooser onPick={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "現在地" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "位置情報を取得できませんでした",
  );
  vi.stubGlobal("navigator", {});
  fireEvent.click(screen.getByRole("button", { name: "現在地" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "この端末では位置情報を利用できません",
  );
});
it("登録地と都道府県→市区町村の選択は通信しない", async () => {
  const onPick = vi.fn();
  const onUseSaved = vi.fn();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <OriginChooser
      onPick={onPick}
      savedLabel="名古屋駅"
      onUseSaved={onUseSaved}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "登録した出発地（名古屋駅）" }),
  );
  expect(onUseSaved).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "選ぶ" }));
  fireEvent.click(await screen.findByRole("button", { name: "愛知県" }));
  fireEvent.click(screen.getByRole("button", { name: "名古屋市中村区" }));
  expect(onPick).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "愛知県名古屋市中村区",
      lat: expect.any(Number),
      lon: expect.any(Number),
    }),
  );
  expect(fetcher).not.toHaveBeenCalled();
});
