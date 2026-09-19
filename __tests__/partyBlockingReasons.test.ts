import { describe, expect, it } from "vitest";
import {
  blockingReasons,
  jointTimeline,
  type MemberTimeline,
  type TimelineRow,
} from "@/lib/partyTimeline";

/*
  **なぜ最初の 1 日がそこまで出ないのか**を人ごとに出す
  （利用者の指摘。2026-09-19）。

  合流できる日が 1 年半先になっていても、画面は理由を何も出していな
  かった。そのため「天中殺が評価に入っているのでは」と推測させてしまい、
  実際には別の理由（年盤の五大凶殺）だった。

  `summarizeTiming` の `alwaysBlockedBy` は**走査した全日で塞がっていた
  人**しか出さない。途中で開く場合は 1 件も出ないので、いちばん知りたい
  ところが空になる。ここはその穴を埋める。
*/

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TOKYO = { baseLat: 35.6895, baseLon: 139.6917 };
const DEST = { lat: 43.0618, lon: 141.3545 }; // 東京から見て北

function row(date: string, tier: string, blocked = false): TimelineRow {
  const tiers: Record<string, string> = {};
  for (const d of DIRS) tiers[d] = tier;
  return { date, weekday: 1, rokuyo: "大安 (Taian)", tags: [], blocked, tiers };
}

function member(
  id: string,
  days: TimelineRow[],
  extra: Partial<MemberTimeline> = {},
): MemberTimeline {
  return {
    id,
    name: id,
    stationary: false,
    weight: 1,
    ...TOKYO,
    days,
    ...extra,
  };
}

const DATES = ["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"];

describe("塞いでいた理由", () => {
  it("最初の 1 日の前日までを見て、人ごとに理由を出す", () => {
    /* A は 3 日 X、B は 2 日 X。4 日目に両方 S で開く。 */
    const a = member(
      "A",
      DATES.map((d, i) => row(d, i < 3 ? "X" : "S")),
    );
    const b = member(
      "B",
      DATES.map((d, i) => row(d, i < 2 ? "X" : "S")),
    );
    const got = blockingReasons(
      jointTimeline([a, b], DEST, "everyone"),
      DATES[0],
    );
    expect(got.until).toBe("2026-09-22");
    expect(got.scanned).toBe(3);
    expect(got.reasons.map((r) => [r.name, r.days, r.status])).toEqual([
      ["A", 3, "五大凶殺あり"],
      ["B", 2, "五大凶殺あり"],
    ]);
  });

  it("**途中で開く場合でも理由が出る**（alwaysBlockedBy が空になる形）", () => {
    /* この形がまさに利用者の見ていた画面。最後の 1 日だけ開く。 */
    const a = member(
      "A",
      DATES.map((d, i) => row(d, i < 3 ? "X" : "S")),
    );
    const got = blockingReasons(jointTimeline([a], DEST, "everyone"), DATES[0]);
    expect(got.until).toBe("2026-09-22");
    expect(got.reasons).toHaveLength(1);
    expect(got.reasons[0].days).toBe(3);
  });

  it("1 日も開かないときは走査した全日を数える", () => {
    const a = member(
      "A",
      DATES.map((d) => row(d, "X")),
    );
    const got = blockingReasons(jointTimeline([a], DEST, "everyone"), DATES[0]);
    expect(got.until).toBeNull();
    expect(got.scanned).toBe(4);
    expect(got.reasons[0].days).toBe(4);
  });

  it("天中殺で塞がった日は「天中殺」と出る", () => {
    /* 段階は C（凶なし）でも、天中殺なら動けない。理由を取り違えない。 */
    const a = member(
      "A",
      DATES.map((d, i) => row(d, "C", i < 2)),
    );
    const got = blockingReasons(jointTimeline([a], DEST, "everyone"), DATES[0]);
    expect(got.until).toBe("2026-09-21");
    expect(got.reasons[0].status).toBe("天中殺");
    expect(got.reasons[0].days).toBe(2);
  });

  it("方位を添える（誰がどちらへ動くときの話か）", () => {
    const a = member(
      "A",
      DATES.map((d) => row(d, "X")),
    );
    const got = blockingReasons(jointTimeline([a], DEST, "everyone"), DATES[0]);
    expect(got.reasons[0].direction).toBe("N");
  });

  it("移動しない人は理由に出ない", () => {
    const a = member(
      "A",
      DATES.map((d) => row(d, "X")),
    );
    const b = member(
      "B",
      DATES.map((d) => row(d, "X")),
      { stationary: true },
    );
    const got = blockingReasons(
      jointTimeline([a, b], DEST, "everyone"),
      DATES[0],
    );
    expect(got.reasons.map((r) => r.name)).toEqual(["A"]);
  });

  it("今日より前は数えない", () => {
    const a = member("A", [
      row("2026-09-01", "X"),
      ...DATES.map((d) => row(d, "S")),
    ]);
    const got = blockingReasons(jointTimeline([a], DEST, "everyone"), DATES[0]);
    expect(got.until).toBe(DATES[0]);
    expect(got.scanned).toBe(0);
    expect(got.reasons).toEqual([]);
  });
});
