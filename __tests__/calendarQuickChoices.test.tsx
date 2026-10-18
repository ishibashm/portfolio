import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuspiciousDayFinder } from "@/components/relocation/AuspiciousDayFinder";

const { loadSettings } = vi.hoisted(() => ({ loadSettings: vi.fn() }));
vi.mock("@/lib/userSettings", async (original) => ({
  ...(await original<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));
vi.mock("@/components/profile/ProfilePicker", () => ({
  ProfilePicker: () => null,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/inputs/QuickChoices", async (original) => ({
  ...(await original<typeof import("@/components/inputs/QuickChoices")>()),
  OriginChooser: ({
    onPick,
  }: {
    onPick: (p: { name: string; lat?: number; lon?: number }) => void;
  }) => (
    <fieldset>
      <legend>どこから？</legend>
      <button
        onClick={() =>
          onPick({ name: "名古屋駅", lat: 35.1709, lon: 136.8815 })
        }
      >
        選ぶ
      </button>
      <button onClick={() => onPick({ name: "東京駅" })}>現在地</button>
    </fieldset>
  ),
}));
const saved = {
  birth_date: "1985-04-10T09:30",
  base_lat: 35.1709,
  base_lon: 136.8815,
  base_label: "名古屋駅",
  tenchusatsu_mode: "day_only",
};
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/calendar");
  loadSettings.mockResolvedValue({ settings: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ summaries: [] }), { status: 200 }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function seed() {
  localStorage.setItem("tactical_config_v1", JSON.stringify(saved));
  loadSettings.mockResolvedValue({ settings: saved });
}
async function searchParams() {
  fireEvent.click(screen.getByRole("button", { name: "吉日を出す" }));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  return new URL(
    String(vi.mocked(fetch).mock.calls.at(-1)![0]),
    "https://example.test",
  ).searchParams;
}
it("未登録ならサンプルを保存せず、年→月日と出発地を質問する", async () => {
  render(<AuspiciousDayFinder />);
  await act(async () => {});
  expect(screen.getByText("生まれ年は？")).toBeTruthy();
  expect(screen.getByText("どこから？")).toBeTruthy();
  expect(screen.queryByText("生まれた月は？")).toBeNull();
  expect(screen.getByRole("button", { name: "吉日を出す" })).toBeDisabled();
  expect(localStorage.getItem("tactical_config_v1")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  // 数字の欄は「座標を直接入れる」を開くまで描かない。
  expect(document.querySelector("#ad-lon")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
  fireEvent.click(screen.getByRole("button", { name: "1985年" }));
  fireEvent.click(screen.getByRole("button", { name: "4月" }));
  expect(localStorage.getItem("tactical_config_v1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "10日" }));
  fireEvent.click(screen.getByRole("button", { name: "選ぶ" }));
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("tactical_config_v1")!)).toMatchObject(
    {
      birth_date: "1985-04-10",
      base_lat: saved.base_lat,
      base_lon: saved.base_lon,
      base_label: saved.base_label,
    },
  );
  const params = await searchParams();
  expect(params.get("birthDate")).toBe("1985-04-10");
  expect(params.get("lon")).toBe("136.8815");
});
it("登録済みの日時をそのまま使い、URL の条件を検索へ渡す", async () => {
  seed();
  window.history.replaceState(
    {},
    "",
    "/calendar?direction=SE&targetDate=2027-04-12&tenchusatsuMode=off",
  );
  render(<AuspiciousDayFinder />);
  await act(async () => {});
  expect(screen.getByText("出発地: 名古屋駅")).toBeTruthy();
  expect(screen.queryByText("どこから？")).toBeNull();
  expect(screen.getByRole("button", { name: "南東" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const params = await searchParams();
  expect(params.get("birthDate")).toBe(saved.birth_date);
  expect(params.get("direction")).toBe("SE");
  expect(params.get("from")).toBe("2027-04-12");
  expect(params.get("tenchusatsuMode")).toBe("off");
});
it("不正な URL の条件は採用せず、期間と開始日をボタンで変えられる", async () => {
  seed();
  window.history.replaceState(
    {},
    "",
    "/calendar?direction=bad&targetDate=2027-02-30&tenchusatsuMode=bad",
  );
  render(<AuspiciousDayFinder />);
  await act(async () => {});
  expect(screen.getByRole("button", { name: "全方位" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByText("2027-02-30")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "半年" }));
  fireEvent.click(screen.getByRole("button", { name: "日付を選ぶ" }));
  fireEvent.change(screen.getByLabelText("日付を選ぶ"), {
    target: { value: "2027-04-12" },
  });
  const params = await searchParams();
  expect(params.get("from")).toBe("2027-04-12");
  expect(params.get("to")).toBe("2027-10-12");
  expect(params.get("tenchusatsuMode")).not.toBe("bad");
  expect(
    document.querySelector("#ad-tenchusatsu")?.closest("details")?.open,
  ).toBe(false);
});
it("地名だけの出発地は既存の geocode で補完する", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ lat: 35.6812, lon: 139.7671 }), {
      status: 200,
    }),
  );
  render(<AuspiciousDayFinder />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "現在地" }));
  await screen.findByText("出発地: 東京駅");
  expect(fetch).toHaveBeenCalledWith(
    `/api/geocode?q=${encodeURIComponent("東京駅")}`,
  );
  expect(JSON.parse(localStorage.getItem("tactical_config_v1")!)).toMatchObject(
    { base_lat: 35.6812, base_lon: 139.7671 },
  );
});
it("地名を解決できなければ未登録のまま再選択できる", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 404 }));
  render(<AuspiciousDayFinder />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "現在地" }));
  await screen.findByText(/出発地の座標を取得できませんでした/);
  expect(localStorage.getItem("tactical_config_v1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "選ぶ" }));
  expect(screen.getByText("出発地: 名古屋駅")).toBeTruthy();
});
it("遅い設定読み込みで利用者の選択を戻さない", async () => {
  let finish!: (value: { settings: typeof saved }) => void;
  loadSettings.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<AuspiciousDayFinder />);
  fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
  fireEvent.click(screen.getByRole("button", { name: "1986年" }));
  await act(async () => {
    finish({ settings: saved });
  });
  expect(screen.getByText("1986年")).toBeTruthy();
  expect(screen.getByText("生まれた月は？")).toBeTruthy();
  expect(screen.queryByText(/生年月日:/)).toBeNull();
});
