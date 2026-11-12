import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCurrentDirections,
  buildTodayDirections,
} from "@/lib/todayDirections";
import { calculateTimeSlots } from "@/lib/timeSlots";
import { getHonmeiStar } from "@/utils/ephemerisEngine";
import { parseJapanDateTime } from "@/utils/japanDate";
import { CurrentDirections } from "@/components/houi/CurrentDirections";
import { readFileSync } from "node:fs";
import { loadSettings } from "@/lib/userSettings";
vi.mock("@/lib/userSettings", () => ({
  loadSettings: vi.fn(async () => ({ settings: {} })),
  readSettingsSync: () => ({}),
  settingString: (s: Record<string, string>, k: string) => s[k],
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("現在の刻", () => {
  it("全9星の早見表およびdashboardの刻と一致する", () => {
    const now = new Date("2026-11-04T12:00:00+09:00");
    for (let year = 1980; year < 1989; year++) {
      const birthDate = `${year}-05-15`;
      const current = buildCurrentDirections(now, birthDate);
      const star = getHonmeiStar(parseJapanDateTime(birthDate)).classical;
      const row = buildTodayDirections(now)
        .stars.find((s) => s.star === star)!
        .hours.find((s) => s.branch === current.branch)!;
      expect(current.lucky).toEqual(row.lucky);
      expect(current.unlucky).toEqual(row.unlucky);
      const slot = calculateTimeSlots({
        birthDate,
        lat: 35.68,
        lon: 139.6917,
        date: "2026-11-04",
      }).slots.find((s) => new Date(s.start) <= now && now < new Date(s.end))!;
      expect(new Date(current.start)).toEqual(new Date(slot.start));
      expect(new Date(current.end)).toEqual(new Date(slot.end));
    }
  });
  it("一般向けは個人の吉凶を混ぜず、日破を残す", () => {
    const result = buildCurrentDirections(
      new Date("2026-11-04T12:00:00+09:00"),
    );
    expect(result.starName).toBeNull();
    expect(result.lucky).toEqual([]);
    expect(result.unlucky.join()).not.toMatch(/本命/);
    expect(result.unlucky.join()).toContain("日破");
  });
  it("JST日付変更・夜の翌日表・経度の異なる境界を扱う", () => {
    for (const lon of [122, 139.6917, 154])
      for (const stamp of [
        "2026-11-04T23:59:59+09:00",
        "2026-11-05T00:00:00+09:00",
      ]) {
        const now = new Date(stamp);
        const result = buildCurrentDirections(now, undefined, lon);
        expect(result.date).toBe(stamp.slice(0, 10));
        expect(new Date(result.start).getTime()).toBeLessThanOrEqual(+now);
        expect(new Date(result.end).getTime()).toBeGreaterThan(+now);
        expect(
          buildCurrentDirections(new Date(result.end), undefined, lon).start,
        ).toBe(result.end);
      }
  });
  it("季節による正午補正のずれでも全時間をカバーする", () => {
    for (const month of [2, 5, 8, 11])
      for (const lon of [122, 154]) {
        const now = new Date(
          `2026-${String(month).padStart(2, "0")}-04T00:00:00+09:00`,
        );
        const first = buildCurrentDirections(now, undefined, lon);
        expect(new Date(first.start).getTime()).toBeLessThanOrEqual(+now);
        const late = buildCurrentDirections(
          new Date(+now + 23 * 3600000),
          undefined,
          lon,
        );
        expect(
          buildCurrentDirections(new Date(late.end), undefined, lon).start,
        ).toBe(late.end);
      }
  });
  it("プロフィールを自動反映し、入力は現在地ボタンのみ", async () => {
    vi.mocked(loadSettings).mockResolvedValueOnce({
      settings: { birth_date: "1990-05-15" },
      synced: false,
    });
    render(<CurrentDirections />);
    await waitFor(() =>
      expect(screen.getByText(/保存済みプロフィール/)).toBeTruthy(),
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("開いたままでもJSTの日付変更を更新する", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T23:59:59+09:00"));
    const interval = vi.spyOn(window, "setInterval");
    render(<CurrentDirections />);
    await screen.findByText(/2026-11-04/);
    vi.setSystemTime(new Date("2026-11-05T00:00:01+09:00"));
    const update = interval.mock.calls[0][0] as () => void;
    await act(async () => {
      update();
    });
    await screen.findByText(/2026-11-05/);
  });
  it.each(["denied", "unavailable", "success"])("現在地: %s", async (mode) => {
    vi.stubGlobal(
      "navigator",
      mode === "unavailable"
        ? {}
        : {
            geolocation: {
              getCurrentPosition: (
                ok: (p: unknown) => void,
                fail: () => void,
              ) =>
                mode === "success"
                  ? ok({ coords: { longitude: 135, latitude: 35 } })
                  : fail(),
            },
          },
    );
    render(<CurrentDirections />);
    await screen.findByText(/一般向け/);
    fireEvent.click(screen.getByRole("button", { name: "現在地で調べる" }));
    expect(screen.getByRole("status").textContent).toContain(
      mode === "success" ? "現在地基準" : "東京基準",
    );
    if (mode !== "success")
      expect(screen.getByRole("status").textContent).toContain("取得できない");
    await act(async () => {});
  });
  it("両入口からリンクがあり、一白水星の固定展開をしない", () => {
    for (const file of ["src/app/page.tsx", "src/app/houi/page.tsx"])
      expect(readFileSync(file, "utf8")).toContain('href="/houi/today"');
    const page = readFileSync("src/app/houi/today/page.tsx", "utf8");
    expect(page).not.toContain("open={star.star === 1}");
    expect(page.indexOf("<CurrentDirections")).toBeLessThan(
      page.indexOf("<header"),
    );
  });
});
