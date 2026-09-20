import { describe, expect, it } from "vitest";
import {
  jointDateOptions,
  jointTimeline,
  memberDirection,
  openDirections,
  summarizeOpenByMonth,
  type MemberTimeline,
  type TimelineRow,
} from "@/lib/partyTimeline";
import { PREFECTURE_CENTERS } from "@/lib/prefectureDirection";
import { EIGHT_DIRECTIONS } from "@/utils/ephemerisEngine";

/*
  **日付が先、場所（方角）が後。**

  利用者の指摘（2026-09-20）。方角が凶でない日付を選んでから移動する
  方角を決めるのであって、合流先を先に決めるのは順序が逆。それまでの
  時期ツールは「合流先（県）を選ぶ → その県への方位で全員ぶんを重ねる」
  の順で、合流先を選ぶまで全員の合成が出なかった。

  ここで固定するのは 3 つ。
    ・1 人ぶんの「その日に開いている方位」が、避けるべき境目
      （X・D・天中殺）と同じ規則で決まること
    ・日ごとの「全員で動ける県」が、県ごとの合成（jointTimeline）と
      **同じ答え**になること。見る向きを変えただけで中身は同じ合成
      なので、ここがずれたら片方が嘘
    ・月のまとめが、日数・最初の日・最多の数を正しく数えること
*/

const TOKYO = { baseLat: 35.6895, baseLon: 139.6917 };
const FUKUOKA = { baseLat: 33.5902, baseLon: 130.4017 };
const AOMORI = "青森県";
const OKINAWA = "沖縄県";
const TODAY = "2027-01-01";

function row(
  date: string,
  tiers: Record<string, string>,
  blocked = false,
): TimelineRow {
  const all: Record<string, string> = {};
  for (const d of EIGHT_DIRECTIONS) all[d] = "C";
  return {
    date,
    weekday: 1,
    rokuyo: "大安",
    tags: [],
    blocked,
    tiers: { ...all, ...tiers },
  };
}

function member(
  id: string,
  base: { baseLat: number; baseLon: number },
  days: TimelineRow[],
  extra: Partial<MemberTimeline> = {},
): MemberTimeline {
  return {
    id,
    name: id,
    stationary: false,
    weight: 1,
    ...base,
    days,
    ...extra,
  };
}

describe("openDirections（1 人ぶん・日付が先）", () => {
  it("X と D と天中殺を外し、八方位の定義順で返す", () => {
    const r = row("2027-01-05", { N: "S", NE: "X", E: "D", SE: "A" });
    expect(openDirections(r)).toEqual(["N", "SE", "S", "SW", "W", "NW"]);
    /* 天中殺の日は、段階が良くても 1 つも開かない */
    expect(openDirections(row("2027-01-05", { N: "S" }, true))).toEqual([]);
  });

  it("段階の無い方位は数えない（古い応答）", () => {
    const r = row("2027-01-05", {});
    delete r.tiers.N;
    expect(openDirections(r)).not.toContain("N");
    expect(openDirections(r)).toHaveLength(7);
  });
});

describe("jointDateOptions（全員ぶん・日付が先）", () => {
  /* 東京の人は青森への方位だけ S、福岡の人は青森への方位が C（開く）。
     沖縄への方位は東京の人が X（閉じる）。人ごとに方位が違うことを
     memberDirection で引いて、決め打ちしない。 */
  const tokyoToAomori = memberDirection(TOKYO, PREFECTURE_CENTERS[AOMORI]);
  const tokyoToOkinawa = memberDirection(TOKYO, PREFECTURE_CENTERS[OKINAWA]);
  const members = [
    member("東京", TOKYO, [
      row("2026-12-31", { [tokyoToAomori]: "S" }),
      row("2027-01-01", { [tokyoToAomori]: "S", [tokyoToOkinawa]: "X" }),
      row("2027-01-02", { [tokyoToAomori]: "D" }),
      row("2027-02-01", {}, true),
    ]),
    member("福岡", FUKUOKA, [
      row("2026-12-31", {}),
      row("2027-01-01", {}),
      row("2027-01-02", {}),
      row("2027-02-01", {}),
    ]),
  ];
  const options = jointDateOptions(
    members,
    PREFECTURE_CENTERS,
    "everyone",
    TODAY,
  );

  it("今日より前の日は返さず、開く県が 0 の日は空で返す", () => {
    expect(options.map((o) => o.date)).toEqual([
      "2027-01-01",
      "2027-01-02",
      "2027-02-01",
    ]);
    /* 東京の人が天中殺の日はどこへも動けない */
    expect(options.find((o) => o.date === "2027-02-01")!.open).toEqual([]);
  });

  it("その日に全員で動ける県だけを並べる", () => {
    const jan1 = options.find((o) => o.date === "2027-01-01")!;
    expect(jan1.open).toContain(AOMORI);
    expect(jan1.open).not.toContain(OKINAWA);
    /* 東京の人の青森への方位が D の日は、青森は閉じる */
    const jan2 = options.find((o) => o.date === "2027-01-02")!;
    expect(jan2.open).not.toContain(AOMORI);
  });

  it("県ごとの合成（jointTimeline）と同じ答えになる（向きを変えただけ）", () => {
    for (const [name, center] of Object.entries(PREFECTURE_CENTERS)) {
      const daily = jointTimeline(members, center, "everyone");
      for (const day of daily) {
        if (day.date < TODAY) continue;
        const opt = options.find((o) => o.date === day.date)!;
        expect(
          opt.open.includes(name),
          `${day.date} の ${name}: 日付優先と県優先で答えが違う`,
        ).toBe(day.joint.everyoneSafe);
      }
    }
  });

  it("移動する人がいなければ空", () => {
    const still = members.map((m) => ({ ...m, stationary: true }));
    expect(
      jointDateOptions(still, PREFECTURE_CENTERS, "everyone", TODAY),
    ).toEqual([]);
  });

  it("まとめ方は「全員で動ける」に効かない（everyoneSafe を見る）", () => {
    /* 平均で点が出ても、1 人でも避けるべきなら動けない。日数の定義は
       partyTimingReport と同じ */
    const avg = jointDateOptions(members, PREFECTURE_CENTERS, "average", TODAY);
    expect(avg.map((o) => o.open)).toEqual(options.map((o) => o.open));
  });
});

describe("summarizeOpenByMonth", () => {
  it("月ごとに日数・最初の日・最多の数を数える", () => {
    const months = summarizeOpenByMonth([
      { date: "2027-01-01", open: ["a", "b"] },
      { date: "2027-01-02", open: [] },
      { date: "2027-01-03", open: ["a"] },
      { date: "2027-02-01", open: [] },
    ]);
    expect(months).toEqual([
      { month: "2027-01", days: 2, first: "2027-01-01", most: 2 },
      { month: "2027-02", days: 0, first: null, most: 0 },
    ]);
  });

  it("並びが日付順でなくても最初の日を取り違えない", () => {
    const months = summarizeOpenByMonth([
      { date: "2027-01-20", open: ["a"] },
      { date: "2027-01-05", open: ["a"] },
    ]);
    expect(months[0].first).toBe("2027-01-05");
  });

  it("方位（1 人）と県（全員）のどちらの並びも同じ形で受ける", () => {
    const r = row("2027-03-01", { N: "X" });
    const solo = summarizeOpenByMonth([
      { date: r.date, open: openDirections(r) },
    ]);
    expect(solo[0]).toEqual({
      month: "2027-03",
      days: 1,
      first: "2027-03-01",
      most: 7,
    });
  });
});
