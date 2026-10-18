import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CityPanel from "@/components/city3d/CityPanel";
import type { Settings } from "@/lib/userSettings";

const mocks = vi.hoisted(() => ({
  local: {} as Settings,
  account: vi.fn(),
  tiles: vi.fn(),
  locate: vi.fn(),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/city3d/CityPlan", () => ({ default: () => null }));
vi.mock("@/lib/webglSupport", () => ({ supportsWebGL: () => false }));
vi.mock("@/lib/city3d/loadTiles", () => ({ loadTiles: mocks.tiles }));
vi.mock("@/lib/userSettings", async (original) => ({
  ...(await original<object>()),
  readSettingsSync: () => mocks.local,
  loadSettings: mocks.account,
}));
const nagoya = { lat: 35.1709, lon: 136.8815 };

beforeEach(() => {
  mocks.local = {};
  mocks.account.mockResolvedValue({ settings: {} });
  mocks.tiles.mockResolvedValue({ failedTiles: 0 });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: mocks.locate },
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
  );
  window.history.replaceState(null, "", "/houi/3d");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("街の表示を入力せずに始める", () => {
  it("未登録では自動取得・見本・保存をせず、現在地は押したときだけ直接使う", async () => {
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<CityPanel />);
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /登録した出発地で見る/ }),
    ).toBeNull();
    expect(screen.getByLabelText("住所・地名で探す")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "現在地で見る" }));
    act(() =>
      mocks.locate.mock.calls[0][0]({
        coords: { latitude: nagoya.lat, longitude: nagoya.lon },
      }),
    );
    await screen.findByRole("heading", { name: /現在地の周辺/ });
    await waitFor(() =>
      expect(mocks.tiles).toHaveBeenCalledWith(
        expect.objectContaining(nagoya),
        expect.any(Number),
        expect.any(Number),
        expect.any(AbortSignal),
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it.each(["名古屋駅", ""])(
    "登録地を直接使いラベル %s を表示する",
    async (label) => {
      mocks.local = {
        base_lat: nagoya.lat,
        base_lon: nagoya.lon,
        base_label: label,
      };
      render(<CityPanel />);
      fireEvent.click(
        screen.getByRole("button", {
          name: `登録した出発地で見る（${label || "登録した出発地"}）`,
        }),
      );
      await waitFor(() =>
        expect(mocks.tiles).toHaveBeenCalledWith(
          expect.objectContaining(nagoya),
          expect.any(Number),
          expect.any(Number),
          expect.any(AbortSignal),
        ),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.locate).not.toHaveBeenCalled();
    },
  );

  it("アカウントの生年月日と登録地を重ね、日付ボタンを判定に使う", async () => {
    mocks.local = { birth_date: "1990-01-01" };
    mocks.account.mockResolvedValue({
      settings: {
        birth_date: "1988-05-10T12:00",
        base_lat: nagoya.lat,
        base_lon: nagoya.lon,
      },
    });
    render(<CityPanel />);
    await screen.findByText("1988-05-10");
    fireEvent.click(
      screen.getByRole("button", { name: /登録した出発地で見る/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "3か月後" }));
    expect(screen.getByRole("button", { name: "3か月後" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/mcp",
        expect.objectContaining({
          body: expect.stringContaining('"birthDate":"1988-05-10"'),
        }),
      ),
    );
    expect(screen.queryByDisplayValue("1990-01-01")).toBeNull();
  });

  it("遅いアカウント応答で利用者の選択を上書きしない", async () => {
    let resolve!: (value: { settings: Settings }) => void;
    mocks.account.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mocks.local = { birth_date: "1990-01-01" };
    render(<CityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "変える" }));
    await act(async () => resolve({ settings: { birth_date: "1988-05-10" } }));
    expect(screen.queryByText("1988-05-10")).toBeNull();
    expect(screen.getByText("生まれ年は？")).toBeInTheDocument();
  });

  it("未登録の生年月日を年代・年・月・日の順に選び、保存しない", async () => {
    const save = vi.spyOn(Storage.prototype, "setItem");
    render(<CityPanel />);
    expect(screen.queryByText("生まれた月は？")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
    fireEvent.click(screen.getByRole("button", { name: "1988年" }));
    fireEvent.click(screen.getByRole("button", { name: "5月" }));
    fireEvent.click(screen.getByRole("button", { name: "10日" }));
    expect(await screen.findByText("1988-05-10")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("現在地の応答待ちで登録地に切り替えても古い応答で戻らない", async () => {
    mocks.local = {
      base_lat: nagoya.lat,
      base_lon: nagoya.lon,
      base_label: "名古屋駅",
    };
    render(<CityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "現在地で見る" }));
    fireEvent.click(
      screen.getByRole("button", { name: /登録した出発地で見る/ }),
    );
    act(() =>
      mocks.locate.mock.calls[0][0]({
        coords: { latitude: 35.6812, longitude: 139.7671 },
      }),
    );
    expect(
      await screen.findByRole("heading", { name: /名古屋駅の周辺/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /現在地の周辺/ })).toBeNull();
  });

  it("現在地取得の失敗を画面内で伝え、再試行できる", async () => {
    render(<CityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "現在地で見る" }));
    act(() => mocks.locate.mock.calls[0][1]({ code: 1 }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "位置情報を取得できませんでした",
    );
    expect(screen.getByRole("button", { name: "現在地で見る" })).toBeEnabled();
  });

  it("位置情報非対応でも画面内に案内する", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    });
    render(<CityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "現在地で見る" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "この端末では位置情報を利用できません",
    );
  });

  it("既存のqから住所検索でき、URLを書き換えない", async () => {
    window.history.replaceState(null, "", "/houi/3d?q=名古屋駅");
    const url = window.location.href;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ ...nagoya, name: "名古屋駅", source: "gsi" }),
    } as Response);
    render(<CityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "街と方位を見る" }));
    await screen.findByRole("heading", { name: /名古屋駅の周辺/ });
    expect(fetch).toHaveBeenCalledWith(
      `/api/geocode?q=${encodeURIComponent("名古屋駅")}`,
      expect.any(Object),
    );
    expect(window.location.href).toBe(url);
  });
});
