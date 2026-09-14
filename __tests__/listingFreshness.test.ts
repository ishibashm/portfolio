import { describe, expect, it } from "vitest";
import {
  LISTING_STALE_AFTER_DAYS,
  describeListingFreshness,
  listingFreshnessMessage,
} from "@/lib/listingFreshness";
import {
  LIVE_LISTING_MAX_AGE_DAYS,
  LIVE_LISTING_SQL,
} from "@/lib/rentalListingSql";

/*
  巡回を止めたあと、掲載がどうなっていくかを画面に書くための判定。

  ## 気にしていること

  1. **SQL の窓と、画面の断りが同じ数字を見ている。**別々に持つと
     「もう 0 件のはずなのに『あと 5 日』」になる
  2. **止めた日を焼き込んでいない。**再開したら案内が消えること
  3. **境目。**3 日目に出始め、30 日目に文言が変わる
*/

const DAY = 86_400_000;
const NOW = new Date("2026-10-01T12:00:00+09:00");

/** NOW から n 日前の ISO。 */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY).toISOString();
}

describe("掲載の窓は 1 か所だけにある", () => {
  it("SQL が定数から組まれている（字面の 30 を別に持っていない）", () => {
    expect(LIVE_LISTING_SQL).toContain(
      `interval '${LIVE_LISTING_MAX_AGE_DAYS} days'`,
    );
  });

  it("0 件になるまでの日数は、その窓から数えている", () => {
    const f = describeListingFreshness(daysAgo(10), NOW);
    expect(f.kind).toBe("stopped");
    if (f.kind !== "stopped") return;
    /* 空回り防止: 窓を変えたらこの数も動く、という関係を固定する */
    expect(f.daysSince + f.daysUntilEmpty).toBe(LIVE_LISTING_MAX_AGE_DAYS);
  });
});

describe("鮮度の読み取り", () => {
  it("日時が無ければ何も言わない", () => {
    expect(describeListingFreshness(null, NOW).kind).toBe("unknown");
    expect(describeListingFreshness(undefined, NOW).kind).toBe("unknown");
    expect(describeListingFreshness("こわれた値", NOW).kind).toBe("unknown");
  });

  it("巡回が続いていれば何も言わない（再開したら案内が消える）", () => {
    for (const d of [0, 1, LISTING_STALE_AFTER_DAYS - 1]) {
      const f = describeListingFreshness(daysAgo(d), NOW);
      expect(f.kind, `${d} 日前`).toBe("fresh");
      expect(listingFreshnessMessage(f), `${d} 日前`).toBeNull();
    }
  });

  it("止まっていれば、あと何日で 0 件になるかまで言う", () => {
    const f = describeListingFreshness(daysAgo(LISTING_STALE_AFTER_DAYS), NOW);
    expect(f.kind).toBe("stopped");
    const msg = listingFreshnessMessage(f);
    expect(msg).toContain("止まっています");
    expect(msg).toContain(
      `${LIVE_LISTING_MAX_AGE_DAYS - LISTING_STALE_AFTER_DAYS} 日`,
    );
  });

  it("窓を越えたら、0 件の理由と「まだ使えるもの」を言う", () => {
    const f = describeListingFreshness(daysAgo(LIVE_LISTING_MAX_AGE_DAYS), NOW);
    expect(f.kind).toBe("empty");
    const msg = listingFreshnessMessage(f) ?? "";
    /* 掲載が無いだけで、道具そのものは動く。そう書かないと壊れて見える */
    expect(msg).toContain("方位の判定と地図は今までどおり");
  });

  it("時計が進んでいても負の日数を出さない", () => {
    const future = new Date(NOW.getTime() + 5 * DAY).toISOString();
    const f = describeListingFreshness(future, NOW);
    expect(f.kind).toBe("fresh");
    if (f.kind === "fresh") expect(f.daysSince).toBe(0);
  });
});

describe("境目", () => {
  it("止まりはじめる日と、0 件になる日がずれていない", () => {
    const kinds = Array.from(
      { length: LIVE_LISTING_MAX_AGE_DAYS + 2 },
      (_, d) => describeListingFreshness(daysAgo(d), NOW).kind,
    );
    expect(kinds[LISTING_STALE_AFTER_DAYS - 1]).toBe("fresh");
    expect(kinds[LISTING_STALE_AFTER_DAYS]).toBe("stopped");
    expect(kinds[LIVE_LISTING_MAX_AGE_DAYS - 1]).toBe("stopped");
    expect(kinds[LIVE_LISTING_MAX_AGE_DAYS]).toBe("empty");
  });

  it("止まっている間、残り日数は 1 日ずつ減る（0 未満にならない）", () => {
    for (let d = LISTING_STALE_AFTER_DAYS; d < LIVE_LISTING_MAX_AGE_DAYS; d++) {
      const f = describeListingFreshness(daysAgo(d), NOW);
      if (f.kind !== "stopped") throw new Error(`${d} 日前が stopped でない`);
      expect(f.daysUntilEmpty).toBe(LIVE_LISTING_MAX_AGE_DAYS - d);
      expect(f.daysUntilEmpty).toBeGreaterThan(0);
    }
  });
});
