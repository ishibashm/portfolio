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
import { getRegisteredOrigin } from "@/lib/todayWeather/registeredOrigin";
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
