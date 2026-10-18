import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { loadSettings, savePlacePoint } = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  savePlacePoint: vi.fn(),
}));
vi.mock("@/lib/userSettings", async (original) => ({
  ...(await original<typeof import("@/lib/userSettings")>()),
  loadSettings,
}));
vi.mock("@/lib/placePoint", () => ({ savePlacePoint }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ArbitrageMap", () => ({
  ArbitrageMap: (props: { baseLat: number; baseLon: number }) => (
    <div data-testid="map">
      {props.baseLat},{props.baseLon}
    </div>
  ),
}));
vi.mock("@/components/layout/MetaphysicalConfigBar", () => ({
  MetaphysicalConfigBar: () => null,
}));
vi.mock("@/components/profile/ActiveProfileBadge", () => ({
  ActiveProfileBadge: () => null,
}));
vi.mock("@/components/relocation/TransactionsPanel", () => ({
  TransactionsPanel: () => null,
}));
vi.mock("@/components/relocation/LandPriceByDirection", () => ({
  LandPriceByDirection: () => null,
}));
vi.mock("@/components/relocation/HousingStatsByDirection", () => ({
  HousingStatsByDirection: () => null,
}));
vi.mock("@/components/relocation/SpotVerdict", () => ({
  SpotVerdict: () => null,
}));
vi.mock("@/components/relocation/PlaceInput", () => ({
  PlaceInput: () => null,
}));
vi.mock("@/components/inputs/QuickChoices", () => ({
  OriginChooser: ({
    onPick,
  }: {
    onPick: (origin: { name: string; lat?: number; lon?: number }) => void;
  }) => (
    <>
      <button
        onClick={() =>
          onPick({ name: "名古屋駅", lat: 35.1709, lon: 136.8815 })
        }
      >
        選ぶ
      </button>
      <button onClick={() => onPick({ name: "東京駅" })}>名前のみ</button>
    </>
  ),
}));
import Page from "@/app/relocation/arbitrage/page";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/relocation/arbitrage");
  loadSettings.mockResolvedValue({ settings: {} });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("クラウド読込を待ち、未登録なら質問し、選んだ地点だけ保存する", async () => {
  let finish!: (value: { settings: object }) => void;
  loadSettings.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Page />);
  expect(screen.queryByText("どこから引越しますか？")).toBeNull();
  await act(async () => finish({ settings: {} }));
  expect(screen.getByText("どこから引越しますか？")).toBeTruthy();
  expect(savePlacePoint).not.toHaveBeenCalled();
  const opened = vi.fn();
  window.addEventListener("metaphysical-config-open", opened);
  fireEvent.click(screen.getByText("設定バーを開く"));
  expect(opened).toHaveBeenCalledTimes(1);
  window.removeEventListener("metaphysical-config-open", opened);
  fireEvent.click(screen.getByText("選ぶ"));
  expect(savePlacePoint).toHaveBeenCalledWith(
    "base",
    35.1709,
    136.8815,
    "名古屋駅",
  );
  expect(screen.getByTestId("map").textContent).toBe("35.1709,136.8815");
  expect(screen.queryByText("どこから引越しますか？")).toBeNull();
  expect(screen.getByText("詳しい条件").closest("details")?.open).toBe(false);
});

it.each(["local", "cloud", "url"])(
  "%s の出発地は聞き直さず保存もしない",
  async (source) => {
    const settings = { base_lat: 35.1709, base_lon: 136.8815 };
    if (source === "local")
      localStorage.setItem("tactical_config_v1", JSON.stringify(settings));
    if (source === "cloud") loadSettings.mockResolvedValue({ settings });
    if (source === "url")
      window.history.replaceState(
        null,
        "",
        "?baseLat=35.1709&baseLon=136.8815",
      );
    render(<Page />);
    await waitFor(() =>
      expect(screen.getByTestId("map").textContent).toBe("35.1709,136.8815"),
    );
    expect(screen.queryByText("どこから引越しますか？")).toBeNull();
    expect(savePlacePoint).not.toHaveBeenCalled();
  },
);

it.each(["radiusKm=100", "tenchusatsuMode=off", "involuntaryMove=false"])(
  "URL の条件 %s は詳細を開いて残す",
  async (query) => {
    window.history.replaceState(
      null,
      "",
      `?baseLat=35.1709&baseLon=136.8815&${query}`,
    );
    render(<Page />);
    expect(screen.getByText("詳しい条件").closest("details")?.open).toBe(true);
  },
);

it("名前だけの選択は既存の geocode で解決する", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ lat: 35.6812, lon: 139.7671, name: "東京駅" }),
  } as Response);
  render(<Page />);
  fireEvent.click(await screen.findByText("名前のみ"));
  await waitFor(() =>
    expect(savePlacePoint).toHaveBeenCalledWith(
      "base",
      35.6812,
      139.7671,
      "東京駅",
    ),
  );
  expect(fetch).toHaveBeenCalledWith(
    `/api/geocode?q=${encodeURIComponent("東京駅")}`,
  );
});

it("解決に失敗したら保存せず再選択を促す", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  render(<Page />);
  fireEvent.click(await screen.findByText("名前のみ"));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(savePlacePoint).not.toHaveBeenCalled();
});

it.each([
  { radius_km: "200" },
  { involuntary_move: true },
  { tenchusatsu_mode: "off" },
])("保存済みの非既定条件 %j は詳細を開く", (condition) => {
  localStorage.setItem(
    "tactical_config_v1",
    JSON.stringify({ base_lat: 35.1709, base_lon: 136.8815, ...condition }),
  );
  render(<Page />);
  expect(screen.getByText("詳しい条件").closest("details")?.open).toBe(true);
});
