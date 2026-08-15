import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSurfacePressure } from "@/utils/surfacePressure";

/**
 * 気圧（気象病モデルの入力）。
 *
 * bioModelingEngine には最初から `pressureDrop` を受け取る実装があり、
 * 1hPa の低下ごとに交感神経負荷を +3%（最大 30%）積む。標高や磁気嵐と
 * 重なると相乗ぶんも乗る。しかし値を渡す側が無く、SolarTimeClock は
 * `useState(0)` のまま setter を一度も呼んでいなかった。常に
 * 「気圧変化なし」で走っていたことになる。
 *
 * ここで固定するのは 3 つ。
 *
 *   1. 符号（負が降下）。エンジンが `pressureDrop < 0` で判定している
 *   2. 予報ぶんを混ぜないこと（Open-Meteo は未来も返す）
 *   3. 取れないときは 0 ではなく null（0 は「変化なし」であって
 *      「分からない」ではない）
 */

const ORIGINAL_FETCH = globalThis.fetch;

/** 03:00Z を「いま」とし、00:00Z から 06:00Z までを 1 時間刻みで返す。 */
function payload(values: (number | null)[]) {
  return {
    hourly: {
      time: [
        "2026-08-13T00:00",
        "2026-08-13T01:00",
        "2026-08-13T02:00",
        "2026-08-13T03:00",
        "2026-08-13T04:00",
        "2026-08-13T05:00",
        "2026-08-13T06:00",
      ],
      surface_pressure: values,
    },
  };
}

function mockOk(body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe("地上気圧の取得", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T03:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("3 時間で下がったぶんを負の値で返す", () => {
    // 00:00Z が 1010、03:00Z が 1004。6hPa の降下。
    mockOk(payload([1010, 1008, 1006, 1004, 999, 998, 997]));

    return fetchSurfacePressure(35.68, 139.76).then((d) => {
      expect(d.current).toBe(1004);
      expect(d.threeHoursAgo).toBe(1010);
      expect(d.drop).toBe(-6);
      expect(d.timestamp).toBe("2026-08-13T03:00Z");
    });
  });

  it("上がったときは正の値（ペナルティは付かない側）", async () => {
    mockOk(payload([1000, 1001, 1002, 1006, 1007, 1008, 1009]));

    const d = await fetchSurfacePressure(35.68, 139.76);
    expect(d.drop).toBe(6);
  });

  it("予報ぶん（いまより後の時刻）を現在値にしない", async () => {
    // 04:00Z 以降が急落しているが、いまは 03:30Z。混ぜたら -7 になる。
    mockOk(payload([1010, 1008, 1006, 1004, 990, 985, 980]));

    const d = await fetchSurfacePressure(35.68, 139.76);
    expect(d.current).toBe(1004);
    expect(d.drop).toBe(-6);
  });

  it("取れなければ 0 ではなく null", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const d = await fetchSurfacePressure(35.68, 139.76);
    expect(d.current).toBeNull();
    expect(d.drop).toBeNull();
  });

  it("外部が落ちても投げない", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    await expect(fetchSurfacePressure(35.68, 139.76)).resolves.toEqual({
      current: null,
      threeHoursAgo: null,
      drop: null,
      timestamp: null,
    });
  });

  it("座標が数値でなければ外に出ない", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;

    const d = await fetchSurfacePressure(NaN, 139.76);
    expect(spy).not.toHaveBeenCalled();
    expect(d.drop).toBeNull();
  });

  it("3 時間ぶん遡れなければ、現在値だけ返して変化量は null", async () => {
    // 01:00Z 始まりで、いま 03:00Z は取れるが 3 本前が無い。
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        hourly: {
          time: ["2026-08-13T01:00", "2026-08-13T02:00", "2026-08-13T03:00"],
          surface_pressure: [1008, 1006, 1004],
        },
      }),
    }) as unknown as typeof fetch;

    const d = await fetchSurfacePressure(35.68, 139.76);
    expect(d.current).toBe(1004);
    expect(d.threeHoursAgo).toBeNull();
    expect(d.drop).toBeNull();
  });
});

describe("気象病ペナルティとの符号の合わせ", () => {
  it("エンジンは負の値だけをペナルティにしている", async () => {
    const { calculateBioMetrics } = await import("@/utils/bioModelingEngine");

    const base = {
      currentHRV: 40,
      currentGSR: 1.8,
      baselineHRVMean: 38,
      baselineHRVStd: 6.5,
      baselineGSRMean: 1.8,
      baselineGSRStd: 0.4,
      birthLat: 35.68,
      birthLon: 139.76,
      currentLat: 35.68,
      currentLon: 139.76,
      elevation: 0,
      kpIndex: 2,
      solarTimeHours: 12,
      baseSyncDays: 30,
    };

    const calm = calculateBioMetrics({ ...base, pressureDrop: 0 });
    const falling = calculateBioMetrics({ ...base, pressureDrop: -6 });
    const rising = calculateBioMetrics({ ...base, pressureDrop: 6 });

    expect(falling.ansLoad).toBeGreaterThan(calm.ansLoad);
    expect(rising.ansLoad).toBe(calm.ansLoad);
  });
});

describe("画面への配線", () => {
  const read = (...p: string[]) =>
    readFileSync(join(process.cwd(), ...p), "utf8")
      .split("\r\n")
      .join("\n");

  it("SolarTimeClock が取得して pressureDrop に入れている", () => {
    // ここが無かった。state と setter はあるのに setter を誰も呼ばず、
    // 気象病モデルが常に「変化なし」で走っていた。
    const src = read("src", "components", "SolarTimeClock.tsx");
    expect(src).toContain("/api/surface-pressure?lat=");
    // 応答が壊れている場合に備えて、値は先に取り出してから数として
    // 確かめている（#332 以降）。呼んでいることだけを見る。
    expect(src).toMatch(/setPressureDrop\((data\.drop|drop)\);/);
    expect(src).toContain("pressure={pressureData}");
  });

  it("取れていないときに 0 を「変化なし」として見せない", () => {
    const src = read("src", "components", "BioMagneticDashboard.tsx");
    expect(src).toContain(
      "気圧を取得できていません。この項目は負荷の計算に入っていません。",
    );
  });
});
