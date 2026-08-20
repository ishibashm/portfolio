import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 書き出し（/api/relocation/export）の日付の札。
 *
 * ## 元がどう間違っていたか
 *
 *   date: testDate.toISOString().split("T")[0]
 *
 * `toISOString()` は **UTC** の日付を返す。一方、同じ行に並ぶ
 * rokuyo・dayZodiac・scores・statuses は全て `getZonedDateTimeFields(date, 9)`
 * を通した**日本時間**で計算している。
 *
 * そのため UTC の 15 時以降（＝日本の 0〜9 時）に書き出すと、札だけが
 * 1 日前を指した。九星気学は日本時間で日を数えるので、値のほうが正しく、
 * 札のほうが間違っている。
 *
 * 実測（2026-08-19T22:00:00Z ＝ 日本の 8/20 07:00 に書き出し）:
 *
 *   date       2026-08-19   ← UTC の日付
 *   rokuyo     友引          ← 8/20 の六曜（8/19 は先勝）
 *   dayZodiac  寅           ← 8/20 の日支
 *
 * 30 行すべてがずれる。書き出しは画面に出ず、人と生成 AI が読む JSON
 * なので、気付く経路が無い。日付が信用できないと 30 日ぶん全部が使えない。
 *
 * ## ここで固定すること
 *
 * 日本の 0〜9 時（UTC 15〜24 時）に書き出しても、札と中身が同じ日を
 * 指すこと。**旧実装に戻すとこのファイルが落ちる。**
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
import { getRokuyo } from "@/utils/lunar";
import { toJapanDateString } from "@/utils/japanDate";

const ADMIN = "owner@example.com";
const BASE = { lat: 35.6812, lon: 139.7671 };

/** 日本の 0〜9 時。ここが旧実装で 1 日ずれていた帯。 */
const EARLY_MORNING_JST = "2026-08-19T22:00:00Z"; // = 2026-08-20 07:00 JST
/** 日本の 9〜24 時。ここは旧実装でも UTC と日付が一致していた。 */
const AFTERNOON_JST = "2026-08-20T05:00:00Z"; // = 2026-08-20 14:00 JST

type ForecastDay = { date: string; rokuyo: string; dayZodiac: string };

async function callExport(dateIso: string) {
  const p = new URLSearchParams({
    use_classical: "true",
    base_lat: String(BASE.lat),
    base_lon: String(BASE.lon),
    date: dateIso,
  });
  const response = await GET(
    new Request(`http://localhost/api/relocation/export?${p}`),
  );
  expect(response.status).toBe(200);
  return response.json();
}

describe("書き出しの日付の札は日本時間", () => {
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

  describe.each([
    ["日本の朝 7 時（旧実装がずれていた帯）", EARLY_MORNING_JST],
    ["日本の昼 14 時", AFTERNOON_JST],
  ])("%s", (_label, iso) => {
    it("30 日予報の先頭の札が、送った時刻の日本時間の日付と一致する", async () => {
      const json = await callExport(iso);
      const first = json.forecast30Days[0] as ForecastDay;
      expect(first.date).toBe(toJapanDateString(new Date(iso)));
    });

    it("**札の日の六曜と、行の rokuyo が一致する。**旧実装に戻すと落ちる", async () => {
      const json = await callExport(iso);
      for (const day of json.forecast30Days as ForecastDay[]) {
        // 札が指す日を素直に読んだ六曜。札と中身が同じ日を指していれば合う。
        const rokuyoOfLabel = getRokuyo(new Date(`${day.date}T12:00:00+09:00`));
        expect(day.rokuyo, `${day.date} の行`).toBe(rokuyoOfLabel);
      }
    });

    it("札は 1 日ずつ増え、重複も飛びもない", async () => {
      const json = await callExport(iso);
      const dates = (json.forecast30Days as ForecastDay[]).map((d) => d.date);
      expect(new Set(dates).size).toBe(30);
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(`${dates[i - 1]}T00:00:00Z`).getTime();
        const cur = new Date(`${dates[i]}T00:00:00Z`).getTime();
        expect(cur - prev, `${dates[i - 1]} → ${dates[i]}`).toBe(86400000);
      }
    });

    it("currentAstrologyState の札も日本時間", async () => {
      const json = await callExport(iso);
      expect(json.currentAstrologyState.date).toBe(
        toJapanDateString(new Date(iso)),
      );
    });
  });

  it("朝 7 時と昼 14 時は同じ日なので、同じ札から始まる", async () => {
    // 旧実装ではここが 2026-08-19 と 2026-08-20 に割れていた。
    const morning = await callExport(EARLY_MORNING_JST);
    const afternoon = await callExport(AFTERNOON_JST);
    expect(morning.forecast30Days[0].date).toBe(
      afternoon.forecast30Days[0].date,
    );
    expect(morning.forecast30Days[0].date).toBe("2026-08-20");
  });
});
