import { describe, expect, it } from "vitest";
import {
  jointDay,
  jointTimeline,
  memberDirection,
  partyTimingReport,
  tierFromScore,
  type MemberTimeline,
  type TimelineRow,
} from "@/lib/partyTimeline";

/*
  同行者・合流する人の暦を合流先 1 つに向けてまとめる（時期ツール）。

  人ごとに出発地が違うので、同じ合流先でも方位が違う。各人の方位の
  その日の段階を引いて、物件検索と同じまとめ方（全員一致・平均・
  重み付き）で 1 日 1 つにする。ここではエンジンを引かず、段階を
  手で置いた行で合成の規則だけを固定する。
*/

const TOKYO = { baseLat: 35.6895, baseLon: 139.6917 };
const FUKUOKA = { baseLat: 33.5902, baseLon: 130.4017 };
const SAPPORO = { lat: 43.0618, lon: 141.3545 };

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function row(
  date: string,
  tier: string,
  overrides: Partial<TimelineRow> & { tiers?: Record<string, string> } = {},
): TimelineRow {
  const tiers: Record<string, string> = {};
  for (const d of DIRS) tiers[d] = tier;
  return {
    date,
    weekday: 1,
    rokuyo: "大安",
    tags: [],
    blocked: false,
    ...overrides,
    tiers: { ...tiers, ...(overrides.tiers ?? {}) },
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

describe("memberDirection", () => {
  it("出発地ごとに合流先への方位が違う（東京→札幌は北、福岡→札幌は北東）", () => {
    expect(memberDirection(TOKYO, SAPPORO)).toBe("N");
    expect(memberDirection(FUKUOKA, SAPPORO)).toBe("NE");
  });
});

describe("tierFromScore", () => {
  it("最も近い段階に丸め、ちょうど中間なら悪いほうに倒す", () => {
    expect(tierFromScore(100)).toBe("S");
    expect(tierFromScore(85)).toBe("A");
    expect(tierFromScore(70)).toBe("B"); // S と C の平均。A には上げない
    expect(tierFromScore(0)).toBe("X");
  });
});

describe("jointTimeline", () => {
  it("各人の方位のその日の段階を引く（同じ日でも人によって方位が違う）", () => {
    // 東京の人は北が S、福岡の人は北東が D。他の方位は両者とも C。
    const a = member("あなた", TOKYO, [
      row("2026-04-01", "C", { tiers: { N: "S" } }),
    ]);
    const b = member("母", FUKUOKA, [
      row("2026-04-01", "C", { tiers: { NE: "D" } }),
    ]);
    const [day] = jointTimeline([a, b], SAPPORO, "everyone");
    expect(
      day.joint.members.map((m) => [m.name, m.direction, m.score]),
    ).toEqual([
      ["あなた", "N", 100],
      ["母", "NE", 20],
    ]);
    // 全員一致は最も低い人に合わせる
    expect(day.tier).toBe("D");
    expect(day.joint.everyoneSafe).toBe(false);
    expect(day.joint.blockedBy).toEqual(["母"]);
    expect(day.joint.bindingMember?.name).toBe("母");
  });

  it("平均・重み付きは点数で混ぜる", () => {
    const a = member("あなた", TOKYO, [row("2026-04-01", "S")], { weight: 3 });
    const b = member("母", FUKUOKA, [row("2026-04-01", "C")]);
    expect(jointTimeline([a, b], SAPPORO, "average")[0].tier).toBe("B");
    // (100×3 + 40×1) / 4 = 85 → A
    expect(jointTimeline([a, b], SAPPORO, "weighted")[0].tier).toBe("A");
    // 全員一致なら C
    expect(jointTimeline([a, b], SAPPORO, "everyone")[0].tier).toBe("C");
  });

  it("天中殺で塞がっている人がいれば、その日は 0 点・避けるべき・理由は天中殺", () => {
    const a = member("あなた", TOKYO, [row("2026-04-01", "S")]);
    const b = member("母", FUKUOKA, [
      row("2026-04-01", "A", { blocked: true }),
    ]);
    const [day] = jointTimeline([a, b], SAPPORO, "everyone");
    expect(day.blocked).toBe(true);
    expect(day.tier).toBe("X");
    expect(day.joint.blockedBy).toEqual(["母"]);
    expect(day.joint.members[1].status).toBe("天中殺");
  });

  it("移動しない人は内訳に残るが判定には入らない", () => {
    const a = member("あなた", TOKYO, [row("2026-04-01", "B")]);
    const there = member(
      "現地の相手",
      { baseLat: SAPPORO.lat, baseLon: SAPPORO.lon },
      [],
      {
        stationary: true,
      },
    );
    const [day] = jointTimeline([a, there], SAPPORO, "everyone");
    expect(day.joint.members.map((m) => [m.name, m.direction])).toEqual([
      ["あなた", "N"],
      ["現地の相手", null],
    ]);
    expect(day.tier).toBe("B");
    // 比べる相手がいないので一致度は出ない
    expect(day.joint.harmony).toBeNull();
  });

  it("日付で突き合わせるので、走査範囲が欠けた人はその日の判定に入らない", () => {
    const a = member("あなた", TOKYO, [
      row("2026-04-01", "S"),
      row("2026-04-02", "S"),
    ]);
    const b = member("母", FUKUOKA, [row("2026-04-02", "D")]);
    const days = jointTimeline([a, b], SAPPORO, "everyone");
    expect(days.map((d) => [d.date, d.tier])).toEqual([
      ["2026-04-01", "S"],
      ["2026-04-02", "D"],
    ]);
  });

  it("移動する人がいなければ空", () => {
    expect(jointTimeline([], SAPPORO, "everyone")).toEqual([]);
    const there = member("相手", TOKYO, [], { stationary: true });
    expect(jointTimeline([there], SAPPORO, "everyone")).toEqual([]);
  });

  it("jointDay は 1 日だけを返す（選択日の県塗り用）", () => {
    const a = member("あなた", TOKYO, [
      row("2026-04-01", "S"),
      row("2026-04-02", "C"),
    ]);
    expect(jointDay([a], "2026-04-02", SAPPORO, "everyone")?.tier).toBe("C");
    expect(jointDay([a], "2026-04-03", SAPPORO, "everyone")).toBeNull();
  });
});

describe("partyTimingReport", () => {
  it("今日以降で全員が動ける日を並べ、ずっと塞がっている人は理由つきで出す", () => {
    const a = member("あなた", TOKYO, [
      row("2026-03-30", "S"),
      row("2026-04-01", "S"),
      row("2026-04-02", "D"),
      row("2026-04-03", "B"),
    ]);
    const b = member("母", FUKUOKA, [
      row("2026-03-30", "S"),
      row("2026-04-01", "C"),
      row("2026-04-02", "C"),
      row("2026-04-03", "C"),
    ]);
    const report = partyTimingReport(
      jointTimeline([a, b], SAPPORO, "everyone"),
      "2026-04-01",
    );
    // 3/30 は過去なので数えない
    expect(report.scannedDays).toBe(3);
    expect(report.clearDates).toEqual(["2026-04-01", "2026-04-03"]);
    expect(report.nextAllClearDate).toBe("2026-04-01");
    expect(report.allClearDays).toBe(2);
    expect(report.alwaysBlockedBy).toEqual([]);

    const c = member("父", FUKUOKA, [
      row("2026-04-01", "A", { blocked: true }),
      row("2026-04-02", "A", { blocked: true }),
      row("2026-04-03", "A", { blocked: true }),
    ]);
    const blocked = partyTimingReport(
      jointTimeline([a, c], SAPPORO, "everyone"),
      "2026-04-01",
    );
    expect(blocked.clearDates).toEqual([]);
    expect(blocked.alwaysBlockedBy).toEqual([{ name: "父", status: "天中殺" }]);
  });
});
