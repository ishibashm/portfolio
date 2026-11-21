import { __resetFetchJsonCacheForTest } from "@/lib/todayWeather/fetchJson";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFECTURES } from "@/lib/todayWeather/prefectures";
import { parseJmaForecast } from "@/lib/todayWeather/jma";
import {
  honmeiForBirthYear,
  parseBirthYearParam,
} from "@/lib/todayWeather/birthYear";
import { TodayFortunePanel } from "@/components/houi/TodayFortunePanel";
import { getClassicalYearStar } from "@/utils/ephemerisEngine";

vi.mock("@/components/houi/CurrentDirections", () => ({
  CurrentDirections: () => null,
}));

// 区域と地点の選択を確認する架空の予報。
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

const aichi = PREFECTURES.find((p) => p.code === 23)!;
// fetchJson はインスタンス内に予報を持つので、テストごとに空にする。
afterEach(() => {
  vi.unstubAllGlobals();
  __resetFetchJsonCacheForTest();
});

describe("都道府県の表", () => {
  it("47都道府県がそろい、コードが重ならない", () => {
    expect(PREFECTURES).toHaveLength(47);
    expect(new Set(PREFECTURES.map((p) => p.code)).size).toBe(47);
    for (const p of PREFECTURES) {
      expect(p.office).toMatch(/^\d{6}$/);
      expect(p.area).toMatch(/^\d{6}$/);
      expect(p.amedas).toMatch(/^\d{5}$/);
    }
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
  it("朝・昼の発表では、今日の00時の値を最低にしない（札幌 7・10 が逆に見えた件）", () => {
    // 2026-11-19 11時発表の札幌と同じ並び。今日は 09時・00時、明日は 00時・09時。
    const noon = structuredClone(JMA);
    noon[0].reportDatetime = "2026-11-16T11:00:00+09:00";
    noon[0].timeSeries[0].timeDefines[0] = "2026-11-16T11:00:00+09:00";
    noon[0].timeSeries[0].timeDefines[1] = "2026-11-17T00:00:00+09:00";
    noon[0].timeSeries[2] = {
      timeDefines: [
        "2026-11-16T09:00:00+09:00",
        "2026-11-16T00:00:00+09:00",
        "2026-11-17T00:00:00+09:00",
        "2026-11-17T09:00:00+09:00",
      ],
      areas: [
        {
          area: { name: "名古屋", code: "51106" },
          temps: ["7", "10", "-1", "2"],
        },
        { area: { name: "豊橋", code: "51331" }, temps: ["8", "8", "1", "9"] },
      ],
    };
    const f = parseJmaForecast(noon, aichi)!;
    expect(f.days[0]).toEqual({
      date: "2026-11-16",
      weather: "雨 夜 くもり 後 晴れ",
      max: 7,
    });
    // 明日の最低（これからの 00時）は発表どおり読む。
    expect(f.days[1]).toMatchObject({ date: "2026-11-17", min: -1, max: 2 });
  });
  it("最低が最高以上になる値は出さない", () => {
    const odd = structuredClone(JMA);
    (odd[0].timeSeries[2].areas[0] as { temps: string[] }).temps = ["21", "20"];
    const f = parseJmaForecast(odd, aichi)!;
    expect(f.days[1]).toMatchObject({ date: "2026-11-16", max: 20 });
    expect(f.days[1].min).toBeUndefined();
  });
  it("形が違う JSON は null", () => {
    expect(parseJmaForecast(null, aichi)).toBeNull();
    expect(parseJmaForecast({}, aichi)).toBeNull();
    expect(parseJmaForecast([{ timeSeries: [] }], aichi)).toBeNull();
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

describe("今日の方位", () => {
  it("生まれ年から本命星を表示する", () => {
    const stars = [1, 2].map((star) => ({
      star,
      today: { lucky: [`吉${star}`], unlucky: [`凶${star}`] },
    }));
    const html = renderToStaticMarkup(
      <TodayFortunePanel
        birthYear={1990}
        invalidBirthYear={false}
        stars={stars}
      />,
    );
    expect(html).toContain("1990年生まれ・一白水星");
    expect(html).toContain("前年の二黒土星");
    expect(html).toContain("生まれ年はこの表示にだけ使い、保存しません。");
  });
  it("県指定を無視し、天気を取得せず生まれ年を表示する", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { default: TodayPage } = await import("@/app/houi/today/page");
    const html = renderToStaticMarkup(
      await TodayPage({
        searchParams: Promise.resolve({ pref: "23", birthYear: "1990" }),
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).not.toContain("今日の天気");
    expect(html).not.toContain('name="pref"');
    expect(html).toContain('name="birthYear"');
    expect(html).toContain("1990年生まれ");
  });
  it("SEOメタデータと冒頭の結論をフォームより前に表示する", async () => {
    const { default: TodayPage, metadata } =
      await import("@/app/houi/today/page");
    expect(metadata.title).toBe(
      "今日の方位を時間別に見る｜本命星別の日盤と十二支",
    );
    expect(metadata.description).toBe(
      "本命星を選ぶと、今日と明日の吉方位・避けたい方位と、十二支ごとの時間別の方位が分かります。五黄殺・暗剣殺・日破は全員に凶として表示し、日本時間の日付で更新します。時間帯は東京基準の真太陽時で区切ります。方位の吉凶は占い上の目安です。",
    );
    const html = renderToStaticMarkup(await TodayPage());
    for (const phrase of [
      "今日の方位は、本命星ごとの日盤",
      "時間別の方位",
      "占い上の目安",
      "東京（東経139.6917度）の真太陽時",
    ]) {
      expect(html).toContain(phrase);
    }
    expect(html.indexOf("今日の方位は、本命星ごとの日盤")).toBeLessThan(
      html.indexOf('name="birthYear"'),
    );
  });
});
