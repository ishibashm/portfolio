import { describe, expect, it } from "vitest";
import {
  guidanceIntent,
  guidancePlan,
  guidanceValuesFromText,
  guidanceLinks,
  guidanceValuesSchema,
  type GuidanceSource,
} from "@/lib/askGuidance";
import { guidanceFromResults, resolveGuidance } from "@/lib/askGuidanceServer";
import { shirubeInvitation } from "@/lib/shirubeInvitations";
const origin = {
  code: "23106",
  name: "愛知県名古屋市中区",
  lat: 35.1688,
  lon: 136.9103,
};
const values = {
  birthDate: "1990-05-05",
  municipality: origin.name,
  date: "2026-11-05",
  direction: "E" as const,
};
const search: GuidanceSource = {
  tool: "search_municipality",
  input: { query: "名古屋市中区" },
  output: { results: [origin] },
};
const judged: GuidanceSource = {
  tool: "judge_directions",
  input: { birthDate: values.birthDate, lon: origin.lon, date: values.date },
  output: {
    date: values.date,
    directions: [{ direction: "E", status: "OPTIMAL" }],
  },
};

describe("サーバーの固定入力項目とリンク", () => {
  it("街の案内は出発地と方位を決めつけず、必要な二項目を尋ねる", () => {
    const invitation = shirubeInvitation("towns")!;
    expect(invitation.calculationHref).toBe("/houi/area");
    expect(guidanceIntent(invitation.question)).toBe("towns");
    const parsed = guidanceValuesFromText(invitation.question);
    expect(parsed).toEqual({});
    expect(guidancePlan("towns", parsed).fields).toEqual([
      "municipality",
      "direction",
    ]);
  });
  it("不足だけを最大2項目ずつ示す", () => {
    expect(guidancePlan("move", {}).fields).toEqual([
      "birthDate",
      "municipality",
    ]);
    expect(
      guidancePlan("move", {
        birthDate: values.birthDate,
        municipality: values.municipality,
      }).fields,
    ).toEqual(["date", "direction"]);
    expect(guidancePlan("move", values).fields).toEqual([]);
    expect(guidancePlan("towns", {}).fields).toEqual([
      "municipality",
      "direction",
    ]);
  });
  it("移動日を誕生日にせず、地名を方位にしない", () => {
    expect(
      guidanceValuesFromText("東京都新宿区から引越し予定は2026年11月5日"),
    ).toMatchObject({ date: "2026-11-05" });
    expect(
      guidanceValuesFromText("東京都新宿区から引越し予定は2026年11月5日")
        .birthDate,
    ).toBeUndefined();
    expect(
      guidanceValuesFromText("東京都新宿区から引越し予定は2026年11月5日")
        .direction,
    ).toBeUndefined();
    expect(
      guidanceValuesFromText("生年月日：1990年5月5日。名古屋市中区から東の街"),
    ).toMatchObject({
      birthDate: "1990-05-05",
      direction: "E",
      municipality: "名古屋市中区",
    });
    expect(guidanceValuesSchema.safeParse({ date: "2026-02-30" }).success).toBe(
      false,
    );
  });
  it("実際の結果と一致する日付・市の代表点・方位だけをURLにする", () => {
    const links = guidanceLinks(values, [search, judged]);
    expect(links).toHaveLength(1);
    const url = new URL(links[0].href, "https://cloud-palette.com");
    expect(url.pathname).toBe("/relocation/arbitrage");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      baseLat: "35.1688",
      baseLon: "136.9103",
      direction: "E",
      targetDate: "2026-11-05",
    });
    expect(links[0].href).not.toContain("1990");
    expect(links[0].href).not.toContain("birth");
    expect(
      guidanceLinks({ ...values, date: "2026-12-01" }, [search, judged]),
    ).toEqual([]);
    expect(guidanceLinks(values, [])).toEqual([]);
    expect(
      guidanceLinks({ ...values, birthDate: "1991-05-05" }, [search, judged]),
    ).toEqual([]);
  });
  it("モデルのURL・偽日付を使わず、areaのもっと見るとも重複しない", () => {
    const area: GuidanceSource = {
      tool: "area_directions",
      input: { code: origin.code },
      output: {
        origin: { ...origin, page: "https://evil.test" },
        directions: [{ direction: "E" }],
      },
    };
    const links = guidanceLinks({ municipality: origin.name, direction: "E" }, [
      area,
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].href).toMatch(/^\/relocation\/arbitrage\?/);
    expect(links[0].href).not.toContain("/houi/area");
    expect(links[0].href).not.toContain("evil");
  });
  it("日取り候補は道具のbestDaysからだけ作る", () => {
    const days: GuidanceSource = {
      tool: "find_auspicious_days",
      input: { birthDate: values.birthDate, lon: origin.lon },
      output: {
        directions: [
          {
            direction: "E",
            bestDays: [{ date: "2026-11-08" }, { date: "2026-02-30" }],
          },
        ],
      },
    };
    expect(
      guidanceLinks(values, [search, days]).map((l) =>
        new URL(l.href, "https://cloud-palette.com").searchParams.get(
          "targetDate",
        ),
      ),
    ).toEqual(["2026-11-08"]);
  });
  it("質問・会話中の明示条件と実結果を再利用し、一般質問には入力要求しない", () => {
    expect(
      guidanceFromResults("引越しを相談したい", "東へ引越しを相談したい", [
        search,
        judged,
      ])?.links,
    ).toHaveLength(1);
    expect(guidanceFromResults("本命星とは何ですか", "", [])).toBeUndefined();
    const other = {
      ...judged,
      input: { ...judged.input, birthDate: "1992-01-01" },
    };
    expect(
      guidanceFromResults("引越しを相談したい", "東へ", [search, judged, other])
        ?.fields,
    ).toContain("birthDate");
  });
  it("不足項目があれば計算をせず、揃えば道具だけでURLを作る", async () => {
    const calls: string[] = [];
    const call = async (tool: string) => {
      calls.push(tool);
      return tool === "search_municipality" ? search.output : judged.output;
    };
    expect(
      (await resolveGuidance("move", {}, call, new AbortController().signal))
        .fields,
    ).toHaveLength(2);
    expect(calls).toEqual([]);
    expect(
      (
        await resolveGuidance(
          "move",
          values,
          call,
          new AbortController().signal,
        )
      ).links,
    ).toHaveLength(1);
    expect(calls).toEqual(["search_municipality", "judge_directions"]);
  });
  it("曖昧な市区町村は先頭に決めず、候補を選んでもらう", async () => {
    const call = async () => ({
      results: [
        origin,
        { ...origin, code: "23101", name: "愛知県名古屋市千種区" },
      ],
    });
    const card = await resolveGuidance(
      "move",
      { ...values, municipality: "名古屋" },
      call,
      new AbortController().signal,
    );
    expect(card.fields).toEqual(["municipality"]);
    expect(card.candidates).toHaveLength(2);
    expect(card.links).toEqual([]);
  });
});

it("実際のMCP計算の結果から既存ページを開くURLを組み立てる", async () => {
  const { connectChainClient } = await import("@/lib/mcpChain");
  const connection = await connectChainClient();
  try {
    const card = await resolveGuidance(
      "move",
      values,
      connection.call,
      new AbortController().signal,
    );
    expect(card.fields).toEqual([]);
    expect(card.links).toHaveLength(1);
    const url = new URL(card.links[0].href, "https://cloud-palette.com");
    expect(url.pathname).toBe("/relocation/arbitrage");
    expect(url.searchParams.get("targetDate")).toBe(values.date);
    expect(url.searchParams.get("direction")).toBe("E");
    expect(url.search).not.toContain(values.birthDate);
  } finally {
    await connection.close();
  }
});

it("会話で方位を変更したら最後の明示値を使う", () => {
  expect(
    guidanceValuesFromText("名古屋市中区から東へ。次は北東でお願いします")
      .direction,
  ).toBe("NE");
  const card = guidanceFromResults(
    "今回は北東へ引越しを考えています",
    "前は東へ。今回は北東へ引越しを考えています",
    [],
  );
  expect(card?.values.direction).toBe("NE");
});

it("明示ラベル付きの日付はスラッシュ形式でも再入力を求めない", () => {
  expect(
    guidanceValuesFromText("生年月日：1990/5/5。引越し予定は2026/11/5"),
  ).toMatchObject({ birthDate: "1990-05-05", date: "2026-11-05" });
});
