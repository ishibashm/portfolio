import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * 宇宙天気をサーバ経由にした理由を固定する。
 *
 * ホームはこれまで `fetchSpaceWeather()` をブラウザから直接呼んでいた。
 * あの関数の中の fetch には `{ next: { revalidate: 300 } }` が付いているが、
 * **その指定はサーバの fetch でしか効かない**。ブラウザでは無視されるので、
 * 利用者が 1 人開くたびに NOAA へ 3 本のリクエストが飛んでいた。
 *
 * ここで見るのは 2 つ。
 *   1. ルートが NOAA の値をそのまま返すこと（形を変えない）
 *   2. revalidate が付いていること（これが無いと経由させる意味が無い）
 */

const { fetchSpaceWeather } = vi.hoisted(() => ({
  fetchSpaceWeather: vi.fn(),
}));

vi.mock("@/utils/spaceWeather", () => ({ fetchSpaceWeather }));

import { GET, revalidate } from "@/app/api/space-weather/route";

const SAMPLE = {
  kpIndex: 2.7,
  xrayFlux: "B-CLASS",
  xrayFluxValue: 1.2e-7,
  solarWindSpeed: 412,
  timestamp: "2026-08-12 08:00:00.000",
};

describe("宇宙天気のルート", () => {
  beforeEach(() => vi.clearAllMocks());

  it("取得した値をそのまま返す（形を変えない）", async () => {
    fetchSpaceWeather.mockResolvedValue(SAMPLE);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SAMPLE);
  });

  it("取れなかったときの形も、そのまま渡す", async () => {
    // utils 側が失敗を握って null 揃いを返す。ルートで握り直さない
    // （画面は null を既定値に読み替えて動く）。
    const empty = {
      kpIndex: null,
      xrayFlux: null,
      xrayFluxValue: null,
      solarWindSpeed: null,
      timestamp: null,
    };
    fetchSpaceWeather.mockResolvedValue(empty);

    const res = await GET();
    await expect(res.json()).resolves.toEqual(empty);
  });

  it("キャッシュの秒数を持っている", () => {
    // ここが 0 や未設定だと、経由させても利用者ごとに NOAA を叩くことになる。
    expect(revalidate).toBe(300);
  });

  it("NOAA を叩くのは 1 回だけ（呼ぶたびに増やさない）", async () => {
    fetchSpaceWeather.mockResolvedValue(SAMPLE);
    await GET();
    expect(fetchSpaceWeather).toHaveBeenCalledTimes(1);
  });
});
