import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  auth: vi.fn(),
  config: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/userConfig", () => ({
  getAuthUser: mocks.auth,
  findUserConfig: mocks.config,
}));
import {
  getRegisteredOrigin,
  getRegisteredProfile,
} from "@/lib/todayWeather/registeredOrigin";
afterEach(() => vi.resetAllMocks());
it("cookieが無いときは認証もDBも読まない", async () => {
  mocks.cookies.mockResolvedValue({ getAll: () => [] });
  expect(await getRegisteredOrigin()).toBeNull();
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.config).not.toHaveBeenCalled();
});
it("認証済みの座標と登録名を表示用に読み取る", async () => {
  mocks.cookies.mockResolvedValue({
    getAll: () => [{ name: "sb-test-auth-token" }],
  });
  mocks.auth.mockResolvedValue({ id: "test" });
  mocks.config.mockResolvedValue({
    personal_cloud_opt_in: true,
    base_lat: 35,
    base_lon: 137,
    metaphysical_config: { base_label: "登録した街" },
  });
  expect(await getRegisteredOrigin()).toEqual({
    lat: 35,
    lon: 137,
    name: "登録した街",
    slug: "registered",
  });
});
it("認証失敗と不正座標でページを落とさない", async () => {
  mocks.cookies.mockRejectedValue(new Error("no context"));
  expect(await getRegisteredOrigin()).toBeNull();
  mocks.cookies.mockResolvedValue({
    getAll: () => [{ name: "sb-test-auth-token" }],
  });
  mocks.auth.mockResolvedValue({ id: "test" });
  mocks.config.mockResolvedValue({ base_lat: 999, base_lon: 137 });
  expect(await getRegisteredOrigin()).toBeNull();
  mocks.config.mockRejectedValue(new Error("offline"));
  expect(await getRegisteredOrigin()).toBeNull();
});

it.each([false, undefined])(
  "同意 %s では登録地も本命星も表示しない",
  async (optIn) => {
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: "sb-test-auth-token" }],
    });
    mocks.auth.mockResolvedValue({ id: "test" });
    mocks.config.mockResolvedValue({
      personal_cloud_opt_in: optIn,
      base_lat: 35,
      base_lon: 137,
      birth_date: "1990-01-01",
      presets: [{ active: true, birthDate: "2000-01-01" }],
    });
    const profile = await getRegisteredProfile();
    expect(profile).toBeNull();
    expect(await getRegisteredOrigin()).toBeNull();
    const { TodayHoursPanel } =
      await import("@/components/home/TodayHoursPanel");
    const { renderToStaticMarkup } = await import("react-dom/server");
    expect(
      renderToStaticMarkup(
        await TodayHoursPanel({ birthDate: profile?.birthDate }),
      ),
    ).not.toContain("あなたの今の刻");
  },
);
it.each([true, false])(
  "同意時は使用中の生年月日を優先する（active=%s）、DB読取は1回",
  async (active) => {
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: "sb-test-auth-token" }],
    });
    mocks.auth.mockResolvedValue({ id: "test" });
    mocks.config.mockResolvedValue({
      personal_cloud_opt_in: true,
      birth_date: "1990-01-01",
      presets: [
        {
          id: "a",
          name: "自分",
          active,
          birthDate: "2000-01-01",
          baseLat: 35,
          baseLon: 137,
        },
      ],
    });
    expect(await getRegisteredProfile()).toEqual({
      origin: null,
      birthDate: active ? "2000-01-01" : "1990-01-01",
    });
    expect(mocks.config).toHaveBeenCalledTimes(1);
  },
);
