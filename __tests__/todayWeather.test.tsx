import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFECTURE_CODE,
  PREFECTURES,
  parsePrefParam,
} from "@/lib/todayWeather/prefectures";
import {
  getJmaForecast,
  jmaForecastUrl,
  parseJmaForecast,
} from "@/lib/todayWeather/jma";
import {
  getAirQuality,
  parseAirQuality,
  pm25Note,
} from "@/lib/todayWeather/air";
import {
  honmeiForBirthYear,
  parseBirthYearParam,
} from "@/lib/todayWeather/birthYear";
import {
  TodayWeatherPanel,
  loadTodayWeather,
} from "@/components/houi/TodayWeatherPanel";
import { getClassicalYearStar } from "@/utils/ephemerisEngine";

vi.mock("@/components/houi/CurrentDirections", () => ({
  CurrentDirections: () => null,
}));

// 気象庁 230000.json（2026-11-15 17時発表）を縮めたもの
const JMA = [
  {
    publishingOffice: "名古屋地方気象台",
    reportDatetime: "2026-11-15T17:00:00+09:00",
    timeSeries: [
      {
        timeDefines: [
          "2026-11-15T17:00:00+09:00",
          "2026-11-16T00:00:00+09:00",
          "2026-11-17T00:00:00+09:00",
        ],
        areas: [
          {
            area: { name: "西部", code: "230010" },
            weathers: [
              "雨　夜　くもり　後　晴れ",
              "晴れ　夜　くもり",
              "くもり　後　一時　雨",
            ],
          },
          {
            area: { name: "東部", code: "230020" },
            weathers: ["雨", "晴れ", "くもり"],
          },
        ],
      },
      {
        timeDefines: [
          "2026-11-15T18:00:00+09:00",
          "2026-11-16T00:00:00+09:00",
          "2026-11-16T06:00:00+09:00",
        ],
        areas: [
          { area: { name: "西部", code: "230010" }, pops: ["20", "0", "10"] },
          { area: { name: "東部", code: "230020" }, pops: ["30", "0", "0"] },
        ],
      },
      {
        timeDefines: ["2026-11-16T00:00:00+09:00", "2026-11-16T09:00:00+09:00"],
        areas: [
          { area: { name: "名古屋", code: "51106" }, temps: ["13", "20"] },
          { area: { name: "豊橋", code: "51331" }, temps: ["14", "21"] },
        ],
      },
    ],
  },
];

const AIR = {
  current: { time: "2026-11-15T22:00", pm2_5: 6.14 },
  hourly: {
    time: ["2026-11-15T21:00", "2026-11-15T22:00", "2026-11-16T00:00"],
    pm2_5: [5, 7, 40],
  },
};

const aichi = PREFECTURES.find((p) => p.code === 23)!;
const okResponse = (body: unknown) =>
  ({ ok: true, json: async () => body }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe("都道府県の表", () => {
  it("47都道府県がそろい、コードが重ならない", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(new Set(PREFECTURES.map((p) => p.code)).size).toBe(47);
    for (const p of PREFECTURES) {
      expect(p.office).toMatch(/^\d{6}$/);
      expect(p.area).toMatch(/^\d{6}$/);
      expect(p.amedas).toMatch(/^\d{5}$/);
      expect(p.lat).toBeGreaterThan(24);
      expect(p.lon).toBeGreaterThan(122);
    }
  });
  it("初期値は未選択で、?pref= は 1〜47 の整数だけ受け付ける", () => {
    expect(DEFAULT_PREFECTURE_CODE).toBeNull();
    expect(parsePrefParam(undefined)).toBeNull();
    expect(parsePrefParam("")).toBeNull();
    expect(parsePrefParam("0")).toBeNull();
    expect(parsePrefParam("48")).toBeNull();
    expect(parsePrefParam("23abc")).toBeNull();
    expect(parsePrefParam("2.5")).toBeNull();
    expect(parsePrefParam("13")?.name).toBe("東京都");
    expect(parsePrefParam(["27", "13"])?.name).toBe("大阪府");
  });
});

describe("気象庁の予報を読む", () => {
  it("代表の区域と地点を選び、天気・気温・降水確率を取り出す", () => {
    const f = parseJmaForecast(JMA, aichi)!;
    expect(f.areaName).toBe("西部");
    expect(f.publishingOffice).toBe("名古屋地方気象台");
    expect(f.days).toEqual([
      { date: "2026-11-15", weather: "雨 夜 くもり 後 晴れ" },
      { date: "2026-11-16", weather: "晴れ 夜 くもり", min: 13, max: 20 },
    ]);
    expect(f.pops.map((p) => [p.date, p.startHour, p.endHour, p.pop])).toEqual([
      ["2026-11-15", 18, 24, 20],
      ["2026-11-16", 0, 6, 0],
      ["2026-11-16", 6, 12, 10],
    ]);
  });
  it("同じ日の最低と最高が同じ値なら、最低は出さない（朝の発表）", () => {
    const morning = structuredClone(JMA);
    morning[0].timeSeries[0].timeDefines[0] = "2026-11-16T05:00:00+09:00";
    (morning[0].timeSeries[2].areas[0] as { temps: string[] }).temps = [
      "20",
      "20",
    ];
    const f = parseJmaForecast(morning, aichi)!;
    expect(f.days[0]).toMatchObject({ date: "2026-11-16", max: 20 });
    expect(f.days[0].min).toBeUndefined();
  });
  it("形が違う JSON は null", () => {
    expect(parseJmaForecast(null, aichi)).toBeNull();
    expect(parseJmaForecast({}, aichi)).toBeNull();
    expect(parseJmaForecast([{ timeSeries: [] }], aichi)).toBeNull();
  });
  it("都道府県の予報区の URL を引き、通信の失敗は null にする", async () => {
    const fetchImpl = vi.fn(async () => okResponse(JMA));
    expect(await getJmaForecast(aichi, fetchImpl as never)).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      jmaForecastUrl("230000"),
      expect.objectContaining({ next: { revalidate: 1800 } }),
    );
    const failing = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await getJmaForecast(aichi, failing as never)).toBeNull();
    const notOk = vi.fn(async () => ({ ok: false }) as Response);
    expect(await getJmaForecast(aichi, notOk as never)).toBeNull();
  });
});

describe("空気（PM2.5）を読む", () => {
  it("今の値と、今日の平均・最大を出す", () => {
    expect(parseAirQuality(AIR)).toEqual({
      time: "2026-11-15T22:00",
      current: 6.1,
      todayMean: 6,
      todayMax: 7,
    });
  });
  it("基準との比較は文字で、安全とは言い切らない", () => {
    expect(pm25Note(10)).toContain("WHO指針");
    expect(pm25Note(20)).toContain("国の環境基準");
    expect(pm25Note(40)).toContain("上回る");
    for (const n of [10, 20, 40]) expect(pm25Note(n)).not.toContain("安全");
  });
  it("値がないときと通信の失敗は null", async () => {
    expect(parseAirQuality({})).toBeNull();
    expect(parseAirQuality({ current: { time: "x", pm2_5: null } })).toBeNull();
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await getAirQuality(aichi, failing as never)).toBeNull();
  });
});

describe("生まれ年", () => {
  it("西暦4桁だけ受け付け、全角数字も読む", () => {
    expect(parseBirthYearParam("1985")).toBe(1985);
    expect(parseBirthYearParam("１９８５")).toBe(1985);
    expect(parseBirthYearParam(" 1990 ")).toBe(1990);
    expect(parseBirthYearParam("1985-01-01")).toBeNull();
    expect(parseBirthYearParam("85")).toBeNull();
    expect(parseBirthYearParam("1900")).toBeNull();
    expect(parseBirthYearParam("2051")).toBeNull();
    expect(parseBirthYearParam(undefined)).toBeNull();
  });
  it("既存の年の星の計算と一致し、前年の星も返す", () => {
    expect(honmeiForBirthYear(1990)).toEqual({ main: 1, beforeRisshun: 2 });
    expect(honmeiForBirthYear(2024).main).toBe(3);
    expect(honmeiForBirthYear(1985).main).toBe(
      getClassicalYearStar(new Date("1985-06-15T12:00:00+09:00")),
    );
  });
});

describe("今日の天気と空気の枠", () => {
  const stars = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((star) => ({
    star,
    today: { lucky: [`吉${star}`], unlucky: [`凶${star}`] },
  }));
  const render = (props: Partial<Parameters<typeof TodayWeatherPanel>[0]>) =>
    renderToStaticMarkup(
      <TodayWeatherPanel
        pref={null}
        forecast={null}
        air={null}
        birthYear={null}
        invalidBirthYear={false}
        today="2026-11-15"
        stars={stars}
        {...props}
      />,
    );

  it("都道府県を選ぶまでは案内だけ出し、外部へ取りに行かない", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await loadTodayWeather(null)).toEqual({ forecast: null, air: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    const html = render({});
    expect(html).toContain("都道府県を選ぶと、今日の天気と空気が出ます。");
    expect(html).toContain('method="get"');
    expect(html).toContain('name="pref"');
    expect(html).toContain('name="birthYear"');
    // 選ばれているのは「選んでください」だけ（特定の都道府県を既定にしない）
    expect(html.match(/selected=""/g)).toHaveLength(1);
    expect(html).toContain(
      '<option value="" selected="">選んでください</option>',
    );
  });
  it("選んだ都道府県の天気と空気、出典を出す", () => {
    const html = render({
      pref: aichi,
      forecast: parseJmaForecast(JMA, aichi),
      air: parseAirQuality(AIR),
    });
    expect(html).toContain("天気（愛知県・西部）");
    expect(html).toContain("雨 夜 くもり 後 晴れ");
    expect(html).toContain("最高20℃");
    expect(html).toContain("18–24時");
    expect(html).toContain("出典：");
    expect(html).toContain("気象庁");
    expect(html).toContain("いま 6.1µg/m³");
    expect(html).toContain("参考値");
  });
  it("取れなかった枠は「いま取得できません」", () => {
    const html = render({ pref: aichi });
    expect(html.match(/いま取得できません/g)).toHaveLength(2);
  });
  it("生まれ年から本命星の今日の方位を出し、不正な値は案内に戻す", () => {
    const html = render({ birthYear: 1990 });
    expect(html).toContain("1990年生まれ・一白水星");
    expect(html).toContain("吉1");
    expect(html).toContain("前年の二黒土星");
    expect(render({ invalidBirthYear: true })).toContain("西暦4桁");
  });
  it("天気・空気に緑や赤の色を使わず、禁止表現を含めない", () => {
    const src = readFileSync(
      "src/components/houi/TodayWeatherPanel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/(green|emerald|red)-\d/);
    expect(src).not.toContain("Cloud Paletteでは");
  });
  it("先頭の絵と見出しの絵を、幅・高さ・日本語の代替文つきで出す", () => {
    const html = render({ pref: aichi, birthYear: 1990 });
    expect(html).toContain("/today/banner-960.avif 960w");
    expect(html).toContain("手を振るしるべ");
    expect(html).toMatch(/width="960" height="435"/);
    for (const n of ["weather", "air", "fortune"]) {
      expect(html).toContain(`/today/icon-${n}-192.avif 2x`);
      expect(existsSync(`public/today/icon-${n}-96.webp`)).toBe(true);
    }
    expect(html.match(/width="48" height="48"/g)).toHaveLength(3);
  });
});

describe("/houi/today のページ", () => {
  it("?pref= と ?birthYear= を受け取り、枠をページの先頭に出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        okResponse(String(url).includes("jma.go.jp") ? JMA : AIR),
      ),
    );
    const { default: TodayPage } = await import("@/app/houi/today/page");
    const html = renderToStaticMarkup(
      await TodayPage({
        searchParams: Promise.resolve({ pref: "23", birthYear: "1990" }),
      }),
    );
    expect(html.indexOf("今日の天気と空気")).toBeLessThan(
      html.indexOf("今日の吉方位と時間</h1>"),
    );
    expect(html).toContain("天気（愛知県・西部）");
    expect(html).toContain("1990年生まれ");
    // 生まれ年は「AI に渡す」の文書に入れない
    const area = html.match(/<textarea[^>]*>([^<]*)<\/textarea>/)![1];
    expect(area).not.toContain("1990");
  });
});
