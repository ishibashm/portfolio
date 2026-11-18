import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  JMA_LATEST_TIME_URL,
  fetchSurfacePressure,
  jmaPointUrl,
  nearestPressureStation,
  parseAmedasTime,
  pointFileParts,
  readPressure,
} from "@/utils/surfacePressure";
import { BioMagneticDashboard } from "@/components/BioMagneticDashboard";

/**
 * 気圧（気象病モデルの入力）。
 *
 * bioModelingEngine には最初から `pressureDrop` を受け取る実装があり、
 * 1hPa の低下ごとに交感神経負荷を +3%（最大 30%）積む。標高や磁気嵐と
 * 重なると相乗ぶんも乗る。しかし値を渡す側が無く、SolarTimeClock は
 * `useState(0)` のまま setter を一度も呼んでいなかった。常に
 * 「気圧変化なし」で走っていたことになる。
 *
 * 値は気象庁の地上気象観測（現地気圧）から取る。ここで固定するのは 3 つ。
 *
 *   1. 符号（負が降下）。エンジンが `pressureDrop < 0` で判定している
 *   2. 最新の観測時刻より後の値を現在値にしない
 *   3. 取れないときは 0 ではなく null（0 は「変化なし」であって
 *      「分からない」ではない）
 */

const ORIGINAL_FETCH = globalThis.fetch;
const TOKYO = { lat: 35.6917, lon: 139.75 };

function pointEntry(pressure: number | null, quality: number | null = 0) {
  return {
    pressure: pressure === null ? [null, 5] : [pressure, quality],
  };
}

function mockJma(options: {
  latest?: string;
  current?: Record<string, { pressure: unknown }>;
  past?: Record<string, { pressure: unknown }>;
  failLatest?: boolean;
  failAll?: boolean;
}) {
  const latest = options.latest ?? "2026-11-16T07:20:00+09:00";
  const latestDate = new Date(latest);
  const currentParts = pointFileParts(latestDate);
  const pastParts = pointFileParts(
    new Date(latestDate.getTime() - 3 * 60 * 60 * 1000),
  );
  const currentUrl = jmaPointUrl(
    "44132",
    currentParts.day,
    currentParts.hourBlock,
  );
  const pastUrl = jmaPointUrl("44132", pastParts.day, pastParts.hourBlock);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (options.failAll) throw new Error("network");
    if (url === JMA_LATEST_TIME_URL) {
      if (options.failLatest) return { ok: false } as Response;
      return {
        ok: true,
        text: async () => latest,
        json: async () => latest,
      } as Response;
    }
    if (url.includes("open-meteo")) {
      throw new Error("Open-Meteo を呼んではいけない");
    }
    if (url === currentUrl) {
      return {
        ok: true,
        json: async () => options.current ?? {},
      } as Response;
    }
    if (url === pastUrl) {
      return {
        ok: true,
        json: async () => options.past ?? {},
      } as Response;
    }
    return { ok: false } as Response;
  }) as unknown as typeof fetch;
  return { currentUrl, pastUrl };
}

describe("地上気圧の取得（気象庁）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-16T07:30:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("東京付近なら東京の観測点を選び、3 時間で下がったぶんを負の値で返す", async () => {
    expect(nearestPressureStation(TOKYO.lat, TOKYO.lon)?.id).toBe("44132");
    mockJma({
      current: {
        "20261116071000": pointEntry(1005),
        "20261116072000": pointEntry(1004),
        "20261116073000": pointEntry(990),
      },
      past: {
        "20261116041000": pointEntry(1009),
        "20261116042000": pointEntry(1010),
      },
    });

    const d = await fetchSurfacePressure(TOKYO.lat, TOKYO.lon);
    expect(d.current).toBe(1004);
    expect(d.threeHoursAgo).toBe(1010);
    expect(d.drop).toBe(-6);
    expect(d.timestamp).toBe("2026-11-15T22:20:00.000Z");
    const urls = (
      globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes("jma.go.jp"))).toBe(true);
    expect(urls.some((u) => /open-meteo/i.test(u))).toBe(false);
  });

  it("上がったときは正の値（ペナルティは付かない側）", async () => {
    mockJma({
      current: { "20261116072000": pointEntry(1006) },
      past: { "20261116042000": pointEntry(1000) },
    });
    const d = await fetchSurfacePressure(TOKYO.lat, TOKYO.lon);
    expect(d.drop).toBe(6);
  });

  it("最新の観測時刻より後の値を現在値にしない", async () => {
    mockJma({
      current: {
        "20261116072000": pointEntry(1004),
        "20261116073000": pointEntry(990),
      },
      past: { "20261116042000": pointEntry(1010) },
    });
    const d = await fetchSurfacePressure(TOKYO.lat, TOKYO.lon);
    expect(d.current).toBe(1004);
    expect(d.drop).toBe(-6);
  });

  it("取れなければ 0 ではなく null", async () => {
    mockJma({ failLatest: true, current: {}, past: {} });
    // latest が失敗すると「いま」の 07:30 枠を見に行くが、current が空なら null
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const d = await fetchSurfacePressure(TOKYO.lat, TOKYO.lon);
    expect(d.current).toBeNull();
    expect(d.drop).toBeNull();
  });

  it("外部が落ちても投げない", async () => {
    mockJma({ failAll: true });
    await expect(fetchSurfacePressure(TOKYO.lat, TOKYO.lon)).resolves.toEqual({
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
    mockJma({
      current: { "20261116072000": pointEntry(1004) },
      past: {},
    });
    const d = await fetchSurfacePressure(TOKYO.lat, TOKYO.lon);
    expect(d.current).toBe(1004);
    expect(d.threeHoursAgo).toBeNull();
    expect(d.drop).toBeNull();
  });

  it("観測値の読み取りとファイル名の枠を間違えない", () => {
    expect(readPressure({ pressure: [1009.3, 0] })).toBe(1009.3);
    expect(readPressure({ pressure: [1009.3, 5] })).toBeNull();
    expect(parseAmedasTime("20261116072000")).toBe(
      Date.parse("2026-11-16T07:20:00+09:00"),
    );
    expect(pointFileParts(new Date("2026-11-16T07:20:00+09:00"))).toEqual({
      day: "20261116",
      hourBlock: "06",
    });
    expect(pointFileParts(new Date("2026-11-16T04:20:00+09:00"))).toEqual({
      day: "20261116",
      hourBlock: "03",
    });
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
    expect(src).not.toMatch(/open-meteo/i);
    const util = read("src", "utils", "surfacePressure.ts");
    expect(util).toContain("www.jma.go.jp/bosai/amedas");
    expect(util).not.toMatch(/api\.open-meteo\.com/);
  });

  it("取れていないときに 0 を「変化なし」として見せない", () => {
    // 以前は「--」を 3 つ並べた欄を描いたうえで、その下に断りを 1 行
    // 添えていた。#1329 で**欄そのものを描かない**ようにしたので、
    // 字面ではなく描いて確かめる（断りが消えていないことが要点で、
    // 文言そのものは要点ではない）。
    const html = renderToStaticMarkup(
      createElement(BioMagneticDashboard, {
        kpIndex: 3.1,
        xrayFlux: "B5.0",
        magneticF: 46890,
        magneticD: -7.94,
        magneticI: 49.56,
        eot: 0,
        pressure: null,
      }),
    );
    // 0 を「変化なし」として見せない — 欄ごと出さない
    expect(html).not.toContain("自律神経負荷");
    expect(html).not.toContain("3時間変化");
    // 取れていないことは消さない。負荷に入っていないことも言う
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("地上気圧");
    expect(text).toContain("負荷の計算に入っていません");
  });

  it("気圧が取れたときは気象庁の出典を出し、Open-Meteo は出さない", () => {
    const html = renderToStaticMarkup(
      createElement(BioMagneticDashboard, {
        kpIndex: 3.1,
        xrayFlux: "B5.0",
        magneticF: 46890,
        magneticD: -7.94,
        magneticI: 49.56,
        eot: 0,
        pressure: { current: 1009.3, drop: -1.2 },
      }),
    );
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("出典：");
    expect(text).toContain("気象庁");
    expect(text).toContain("現地気圧");
    expect(html).toContain(
      "https://www.jma.go.jp/bosai/map.html#contents=amedas",
    );
    expect(html).not.toMatch(/open-meteo/i);
  });
});
