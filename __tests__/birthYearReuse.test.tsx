import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AgentBirthYear } from "@/components/home/AgentBirthYear";
import { FengShuiLookup } from "@/components/houi/FengShuiLookup";
import { loadSettings, readSettingsSync } from "@/lib/userSettings";
import { getHonmeiStar } from "@/utils/ephemerisEngine";

vi.mock("@/lib/userSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/userSettings")>()),
  readSettingsSync: vi.fn(),
  loadSettings: vi.fn(),
  settingString: (settings: Record<string, unknown>, key: string) =>
    typeof settings[key] === "string" ? settings[key] : undefined,
}));
vi.mock("@/utils/ephemerisEngine", () => ({ getHonmeiStar: vi.fn(() => 7) }));
vi.mock("@/components/houi/FengShuiRoom", () => ({ FengShuiRoom: () => null }));
vi.mock("@/components/houi/FloorPlanFengShui", () => ({
  FloorPlanFengShui: () => null,
}));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(readSettingsSync).mockReturnValue({});
  vi.mocked(loadSettings).mockResolvedValue({ settings: {}, synced: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function chooseYear() {
  fireEvent.click(screen.getByRole("button", { name: "1980年代" }));
  fireEvent.click(screen.getByRole("button", { name: "1988年" }));
}

it.each([AgentBirthYear, FengShuiLookup])(
  "未登録では年代と年をボタンで聞き、設定を書かない: %#",
  async (Component) => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<Component />);
    await act(async () => {});
    expect(container.querySelector("input")).toBeNull();
    chooseYear();
    expect(screen.getByText("1988年")).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  },
);

it.each([AgentBirthYear, FengShuiLookup])(
  "端末の生年月日を読み、クラウドの年を重ねる: %#",
  async (Component) => {
    vi.mocked(readSettingsSync).mockReturnValue({
      birth_date: "1988-02-04T09:00",
    });
    let resolve!: (value: Awaited<ReturnType<typeof loadSettings>>) => void;
    vi.mocked(loadSettings).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<Component />);
    if (Component === AgentBirthYear) {
      await screen.findByText(/本命星は7/);
      expect(getHonmeiStar).toHaveBeenLastCalledWith(
        new Date("1988-02-04T12:00:00+09:00"),
      );
      expect(screen.queryByRole("group")).toBeNull();
    } else await screen.findByText("1988年");
    await act(async () =>
      resolve({ settings: { birth_date: "1990-07-20" }, synced: true }),
    );
    if (Component === AgentBirthYear) {
      await waitFor(() =>
        expect(getHonmeiStar).toHaveBeenLastCalledWith(
          new Date("1990-07-20T12:00:00+09:00"),
        ),
      );
    } else expect(screen.getByText("1990年")).toBeTruthy();
  },
);

it.each([AgentBirthYear, FengShuiLookup])(
  "操作後に届いた設定で選んだ年を上書きしない: %#",
  async (Component) => {
    let resolve!: (value: Awaited<ReturnType<typeof loadSettings>>) => void;
    vi.mocked(loadSettings).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<Component />);
    await act(async () => {});
    chooseYear();
    await act(async () =>
      resolve({ settings: { birth_date: "1990-07-20" }, synced: true }),
    );
    expect(screen.getByText("1988年")).toBeTruthy();
  },
);

it("別の年を調べると保存済みの結果を消し、旧実装と同じ7月1日を使う", async () => {
  vi.mocked(readSettingsSync).mockReturnValue({ birth_date: "1990-01-01" });
  vi.mocked(loadSettings).mockResolvedValue({
    settings: { birth_date: "1990-01-01" },
    synced: true,
  });
  render(<AgentBirthYear />);
  await screen.findByText(/本命星は7/);
  fireEvent.click(screen.getByRole("button", { name: "別の生まれ年で見る" }));
  expect(screen.queryByText(/本命星は/)).toBeNull();
  chooseYear();
  fireEvent.click(
    screen.getByRole("button", { name: "2月5日以降・わからない" }),
  );
  await screen.findByText(/代表日（7月1日）/);
  expect(getHonmeiStar).toHaveBeenLastCalledWith(
    new Date("1988-07-01T12:00:00+09:00"),
  );
});

it("境界側だけ月日を聞き、2月4日も従来どおり指定日の正午で計算する", async () => {
  render(<AgentBirthYear />);
  await act(async () => {});
  expect(screen.queryByText("1月1日〜2月4日生まれですか")).toBeNull();
  chooseYear();
  expect(screen.queryByText("生まれた月は？")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "1月1日〜2月4日生まれ" }));
  fireEvent.click(screen.getByRole("button", { name: "2月" }));
  fireEvent.click(screen.getByRole("button", { name: "4日" }));
  await screen.findByText(/指定日の正午/);
  expect(getHonmeiStar).toHaveBeenLastCalledWith(
    new Date("1988-02-04T12:00:00+09:00"),
  );
  fireEvent.click(screen.getByRole("button", { name: "1月" }));
  expect(screen.queryByText(/本命星は/)).toBeNull();
});

it("風水では従来の範囲の年を数字でも指定でき、出生年を保存しない", async () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(<FengShuiLookup />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "数字で入れる" }));
  fireEvent.change(screen.getByLabelText("生まれ年（西暦）"), {
    target: { value: "1930" },
  });
  expect(screen.getByLabelText("生まれ年（西暦）")).toHaveValue("1930");
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});
