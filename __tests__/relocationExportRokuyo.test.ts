import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 書き出し（/api/relocation/export）の 30 日予報に入る `rokuyo`。
 *
 * ## 元がどう間違っていたか
 *
 *   rokuyo: getCurrentZodiac(testDate, baseLon).dayZodiac
 *
 * 名前は rokuyo なのに、入っていたのは**日支**（子・丑・寅…）だった。
 * 六曜（大安・友引・先負・仏滅・赤口・先勝）ではない。
 *
 * サイトの他の `rokuyo` は全て `utils/lunar` の `getRokuyo` が返す
 * 「大安 (Taian)」形式で、`rokuyo.includes("大安")` で判定している
 * （arbitrage / auspicious-days / CosmicCalendar / AstroGridCalendar /
 * WeddingDateSelector）。この 1 か所だけが同じ鍵に別物を入れていた。
 *
 * この書き出しは画面に出ず、人と生成 AI が読む JSON として落とすものな
 * ので、誤りに気付く経路が無い。「rokuyo: 午」を六曜として読まれる。
 *
 * ## ここで固定すること
 *
 *   - rokuyo が六曜の 6 通りのどれかであること
 *   - 十二支が紛れ込んでいないこと（**旧実装に戻すとここで落ちる**）
 *   - 日支は消えず dayZodiac から読めること
 */

const { getUser, getGeomagneticData, readFile, prismaMock } = vi.hoisted(() => {
  const emptyModel = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    getUser: vi.fn(),
    getGeomagneticData: vi.fn(),
    readFile: vi.fn(),
    prismaMock: {
      relocationHistory: emptyModel(),
      timingAstrology: emptyModel(),
      metaphysicalStateLog: emptyModel(),
      knowledgeDocument: emptyModel(),
      telemetryLog: emptyModel(),
    },
  };
});

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/utils/geomagnetism", () => ({ getGeomagneticData }));
vi.mock("fs/promises", () => ({ default: { readFile } }));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { GET } from "@/app/api/relocation/export/route";
import { ROKUYO, getRokuyo } from "@/utils/lunar";
import { getCurrentZodiac } from "@/utils/ephemerisEngine";

const ADMIN = "owner@example.com";
const BASE = { lat: 35.6812, lon: 139.7671 };

/** 十二支。rokuyo に紛れ込んでいないことを確かめるために使う。 */
const ZODIACS = [
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
];

type ForecastDay = { date: string; rokuyo: string; dayZodiac: string };

async function callExport(date: string) {
  const p = new URLSearchParams({
    use_classical: "true",
    base_lat: String(BASE.lat),
    base_lon: String(BASE.lon),
    date,
  });
  const response = await GET(
    new Request(`http://localhost/api/relocation/export?${p}`),
  );
  expect(response.status).toBe(200);
  const json = await response.json();
  return json.forecast30Days as ForecastDay[];
}

describe("書き出しの 30 日予報の rokuyo", () => {
  const originalAdmin = process.env.ADMIN_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_EMAIL = ADMIN;
    getUser.mockResolvedValue({
      data: { user: { email: ADMIN, id: "admin-1" } },
      error: null,
    });
    readFile.mockRejectedValue(new Error("no config"));
    getGeomagneticData.mockResolvedValue({ declination: -7 });
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalAdmin;
  });

  it("30 日ぶん返る", async () => {
    const forecast = await callExport("2026-08-20T00:00:00Z");
    expect(forecast).toHaveLength(30);
  });

  it("rokuyo は六曜の 6 通りのどれか", async () => {
    const forecast = await callExport("2026-08-20T00:00:00Z");
    for (const day of forecast) {
      expect(ROKUYO, `${day.date} の rokuyo`).toContain(day.rokuyo);
    }
  });

  it("**十二支が紛れ込んでいない。**旧実装に戻すとここで落ちる", async () => {
    const forecast = await callExport("2026-08-20T00:00:00Z");
    for (const day of forecast) {
      expect(ZODIACS, `${day.date} の rokuyo`).not.toContain(day.rokuyo);
    }
  });

  it("日付ごとに getRokuyo と一致する", async () => {
    const forecast = await callExport("2026-08-20T00:00:00Z");
    for (const day of forecast) {
      // 六曜は日単位。経度も時刻基準も関係しないので、日付から直に引ける。
      const expected = getRokuyo(new Date(`${day.date}T00:00:00Z`));
      expect(day.rokuyo, day.date).toBe(expected);
    }
  });

  it("日支は消えず dayZodiac から読める", async () => {
    const forecast = await callExport("2026-08-20T00:00:00Z");
    for (const day of forecast) {
      expect(ZODIACS, `${day.date} の dayZodiac`).toContain(day.dayZodiac);
    }
  });

  it("dayZodiac は元の rokuyo が入れていた値と同じ（情報を減らしていない）", async () => {
    const start = "2026-08-20T00:00:00Z";
    const forecast = await callExport(start);
    const base = new Date(start).getTime();
    forecast.forEach((day, i) => {
      const testDate = new Date(base + i * 86400000);
      // 旧実装と同じ呼び方。書き出しから読めていた情報が残っていること。
      expect(day.dayZodiac, day.date).toBe(
        getCurrentZodiac(testDate, BASE.lon).dayZodiac,
      );
    });
  });
});
