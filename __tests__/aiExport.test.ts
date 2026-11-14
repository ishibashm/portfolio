import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MCP_URL,
  buildAiExportDocument,
  hasPersonalData,
  publicHonmeiPageUrl,
  publicHonmeiYears,
} from "@/lib/aiExport";
import {
  buildAnnaiAiExport,
  buildRelocationCalendarAiExport,
  buildTodayAiExport,
} from "@/lib/aiExportPages";
import { buildTimingReport } from "@/lib/timingReport";
import { SITE_JUDGMENT_POLICY } from "@/lib/siteJudgmentPolicy";
import { emptyGuideFacts } from "@/lib/guide/guideRun";
import type { GuideAnswerData } from "@/lib/guide/guidePage";
import TodayPage from "@/app/houi/today/page";

/**
 * 「AI に渡す」文書。生年月日・座標を入れないこと、判定方針と
 * 続けて聞ける問い、本命星の公開ページ URL が入ることを固定する。
 */

const GENERATED_AT = new Date("2026-09-25T20:00:00Z"); // 日本時間 9/26 5:00

function expectSafe(md: string) {
  expect(hasPersonalData(md)).toBe(false);
  expect(md).not.toContain("Cloud Paletteでは");
  expect(md).not.toContain("1990-05-15");
  expect(md).not.toContain("139.6917");
  expect(md).not.toContain("緯度");
  expect(md).not.toContain("経度");
}

describe("buildAiExportDocument", () => {
  const md = buildAiExportDocument({
    title: "試験",
    generatedAt: GENERATED_AT,
    honmeiStar: 7,
    honmeiStarName: "七赤金星",
    range: { from: "2026-01-01", to: "2026-12-31" },
    conditions: ["盤: 古典暦基準"],
    sections: [{ heading: "結論", body: "南東が候補です。" }],
    sourcePath: "/houi/relocation-calendar",
  });

  it("判定方針・続けて聞ける問い・本命星の公開ページを書く", () => {
    expect(md).toContain("作成日: 2026-09-26（日本時間）");
    expect(md).toContain("本命星: 七赤金星");
    expect(md).toContain("## 判定の方針");
    expect(md).toContain(SITE_JUDGMENT_POLICY.split("\n")[0]);
    expect(md).toContain("## 続けて聞ける問い");
    expect(md).toContain(MCP_URL);
    expect(md).toContain(publicHonmeiPageUrl(2026, 7));
    expect(md).toContain("https://cloud-palette.com/houi/2026/7");
  });

  it("生年月日と座標は書かない", () => {
    expectSafe(md);
  });
});

describe("publicHonmeiYears", () => {
  it("作成日基準で、範囲と重なる公開年だけを返す", () => {
    expect(
      publicHonmeiYears({
        from: "2026-10-01",
        to: "2027-03-01",
        generatedAt: GENERATED_AT,
      }),
    ).toEqual([2026, 2027]);
  });
});

describe("buildTimingReport も共通の節を足す", () => {
  const md = buildTimingReport({
    title: "引越し時期の全期間分析",
    generatedAt: GENERATED_AT,
    honmeiStarName: "七赤金星",
    voidZodiacs: ["辰", "巳"],
    range: { from: "2026-03-26", to: "2028-03-25" },
    conditions: ["盤: 古典暦基準"],
    directions: [
      {
        label: "南東",
        bestTier: "S 三盤吉",
        firstDate: "2026-10-12",
        totalOpen: 9,
        windows: { count: 4, avgLen: 2.3, avgGapDays: 41 },
      },
    ],
    sourcePath: "/relocation/timing",
  });

  it("名前から本命星の公開ページを付ける", () => {
    expect(md).toContain(
      "| 南東 | S 三盤吉 | 2026-10-12 | 9 | 4 回・2.3 日・41 日 |",
    );
    expect(md).toContain(publicHonmeiPageUrl(2026, 7));
    expect(md).toContain(publicHonmeiPageUrl(2027, 7));
    expect(md).toContain(publicHonmeiPageUrl(2028, 7));
    expect(md).toContain("## 判定の方針");
    expectSafe(md);
  });
});

describe("buildRelocationCalendarAiExport", () => {
  const md = buildRelocationCalendarAiExport({
    generatedAt: GENERATED_AT,
    honmeiStar: 7,
    honmeiStarName: "七赤金星",
    voidZodiacs: ["辰", "巳"],
    payload: {
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      windows: [
        {
          from: "2026-01-01",
          to: "2026-01-10",
          days: 10,
          directions: [{ direction: "SE", label: "南東", tier: "S" }],
          allDirectionsBad: false,
          bestTier: "S",
          tenchusatsu: {
            inPeriod: false,
            scopes: [],
            note: "",
            blocks: false,
            attenuation: 0,
          },
        },
      ],
      tripleDays: [{ date: "2026-01-03", directions: [{ label: "南東" }] }],
      tripleDaysTotal: 1,
      summary: {
        totalDays: 30,
        windowsCount: 1,
        allDirectionsBadDays: 0,
        tenchusatsuDays: 0,
      },
    },
  });

  it("期間と3盤そろう日を書き、個人情報は入れない", () => {
    expect(md).toContain("| 2026-01-01〜2026-01-10 | 10 | 南東 S | — |");
    expect(md).toContain("- 2026-01-03：南東");
    expect(md).toContain(publicHonmeiPageUrl(2026, 7));
    expect(md).toContain("3盤そろう日だけを抜き出し");
    expectSafe(md);
  });
});

describe("buildAnnaiAiExport", () => {
  const facts = emptyGuideFacts();
  facts.birthDate = "1990-05-15";
  facts.honmeiStar = 7;
  facts.honmeiStarName = "七赤金星";
  facts.origin = {
    code: "23100",
    name: "名古屋市",
    lon: 136.9066,
    lat: 35.1815,
  };
  facts.directions = [
    { direction: "SE", label: "南東", tier: "S", status: "GOOD" },
  ];
  facts.judgedDate = "2026-11-14";

  const answer: GuideAnswerData = {
    status: "ok",
    query: {
      step: 3,
      kind: "move",
      b: "1990-05-15",
      m: "名古屋市",
      c: "23100",
      p: 90,
    },
    plan: [],
    parsedBody: [],
    trace: [
      {
        id: 1,
        tool: "judge_directions",
        args: { birthDate: "1990-05-15", lon: 136.9066 },
        ok: true,
        summary: "判定しました",
        durationMs: 10,
      },
    ],
    facts,
    aiStatus: "paused",
    aiNote: "定型文で答えています。",
    sentences: [
      "生年月日1990-05-15、出発地「名古屋市」（コード23100）で判定しました。",
      "本命星は7です。",
      "吉とされる方位は南東です。",
    ],
    droppedCount: 0,
    droppedSentences: [],
    matchedCount: 3,
    matchedValues: ["南東"],
    followUps: [],
  };

  const md = buildAnnaiAiExport({
    answer,
    generatedAt: GENERATED_AT,
  });

  it("結論と道具名は残し、生年月日・座標・引数は書かない", () => {
    expect(md).toContain("本命星は7です。");
    expect(md).toContain("出発地「名古屋市」");
    expect(md).toContain("出発地の市区町村: 名古屋市");
    expect(md).toContain("- judge_directions");
    expect(md).not.toContain("birthDate");
    expect(md).not.toContain("136.9066");
    expect(md).not.toContain("35.1815");
    expect(md).toContain(publicHonmeiPageUrl(2026, 7));
    expectSafe(md);
  });
});

describe("buildTodayAiExport", () => {
  const md = buildTodayAiExport({
    date: "2026-11-14",
    tomorrow: "2026-11-15",
    generatedAt: GENERATED_AT,
    stars: [
      {
        star: 1,
        name: "一白水星",
        today: { lucky: ["北"], unlucky: ["南"], neutral: ["東"] },
        tomorrow: { lucky: ["西"], unlucky: ["北東"] },
      },
    ],
  });

  it("本命星別の早見と公開ページを書き、座標は書かない", () => {
    expect(md).toContain("| 一白水星 | 北 | 南 | 東 | 西 | 北東 |");
    expect(md).toContain(publicHonmeiPageUrl(2026, 1));
    expect(md).toContain("東京基準の真太陽時");
    expect(md).not.toContain("139.69");
    expectSafe(md);
  });
});

describe("/houi/today の画面", () => {
  it("読み取り専用の textarea に書き出しを出し、座標例を文書へは入れない", () => {
    const html = renderToStaticMarkup(TodayPage());
    expect(html).toContain("AI に渡す");
    expect(html).toContain("<textarea");
    expect(html).toContain("readOnly");
    // 本文の時間帯説明には東京の経度があるが、textarea の文書には入れない。
    const area = html.match(/<textarea[^>]*>([^<]*)<\/textarea>/);
    expect(area).not.toBeNull();
    const md = area![1]
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&#x27;", "'")
      .replaceAll("&quot;", '"');
    expectSafe(md);
    expect(md).toContain("本命星別の今日と明日");
  });
});
