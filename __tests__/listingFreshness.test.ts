import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LISTING_STALE_AFTER_DAYS,
  describeListingFreshness,
  listingFreshnessMessage,
  listingSnapshotNote,
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

/**
 * 掲載が尽きたときに、**代わりの行き先を出しているか**（2026-09-14）。
 *
 * 「もう無い」だけで終えると、読む側は次に何もできない。出発地の
 * 市区町村ページ（`/houi/area/{code}`）は方位ごとに街と相場を並べ、
 * その街の募集を見に行く導線（#1296 の `CityPortalLinks`）まで持って
 * いる。**代わりは既にある**ので、作らずに繋ぐ。
 *
 * 減っている途中（`stopped`）には出さない。まだ物件が出るので、そちらを
 * 先に見てもらう。
 */
describe("掲載が尽きたときの行き先", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
    "utf8",
  );

  it("empty のときだけ出す（stopped では出さない）", () => {
    expect(SRC).toContain('listingFreshness.kind === "empty" && basePlace');
  });

  it("行き先は出発地の市区町村ページ", () => {
    expect(SRC).toContain("/houi/area/${basePlace.code}");
  });

  it("鮮度そのものを持っている（文言だけでは分岐できない）", () => {
    /* 文言（string | null）からは empty か stopped かを判別できない。
       `describeListingFreshness` の結果を持っていること */
    expect(SRC).toContain("const listingFreshness = useMemo(");
    expect(SRC).toContain("listingFreshnessMessage(listingFreshness)");
  });

  it("出発地が分からないときは出さない（東京へ落とさない）", () => {
    /* 既定値に落とすと、名古屋の人に東京の街を出す。#1100 の系統 */
    expect(SRC).toMatch(/kind === "empty" && basePlace &&/);
  });
});

/**
 * 掲載から作った**静止した数字**に添える断り（市区町村ページ・県ページ）。
 *
 * 物件検索とは事情が違う。あちらは DB を毎回引くので 30 日の窓から外れて
 * **0 件に向かって減る**。市区町村ページが読む `areaDirections.json` を焼く
 * `build_area_dataset` は `scrape-rentals.yml` の中にしか無いので、巡回を
 * 止めた時点で**その日の値のまま凍結している。**
 */
describe("静止した数字の断り", () => {
  it("巡回が続いていれば何も言わない", () => {
    for (const d of [0, 1, LISTING_STALE_AFTER_DAYS - 1]) {
      expect(listingSnapshotNote(daysAgo(d), NOW), `${d} 日前`).toBeNull();
    }
  });

  it("止まっていれば「以降は更新していません」と書く", () => {
    const note = listingSnapshotNote(daysAgo(LISTING_STALE_AFTER_DAYS), NOW);
    expect(note).toContain("以降は更新していません");
    expect(note).toContain("規約に従って止めています");
  });

  it("窓を越えても文言は変わらない（0 件にはならないので）", () => {
    /* 物件検索は 30 日で 0 件になるが、こちらは凍結するだけ。
       「0 件になります」と書くと嘘になる */
    const a = listingSnapshotNote(daysAgo(LISTING_STALE_AFTER_DAYS), NOW);
    const b = listingSnapshotNote(daysAgo(365), NOW);
    expect(b).toBe(a);
    expect(b).not.toContain("0 件");
  });

  it("日数を出さない（静的生成なのでビルド時刻が焼き込まれる）", () => {
    /* この頁は generateStaticParams で焼くので、`new Date()` はビルド
       時刻になる。「3 日前」と焼かれた頁が 3 か月後も「3 日前」と言う */
    const note = listingSnapshotNote(daysAgo(200), NOW) ?? "";
    expect(note).not.toMatch(/\d+\s*日前/);
    expect(note).not.toMatch(/あと\s*\d+/);
  });

  it("日時が無ければ何も言わない", () => {
    expect(listingSnapshotNote(null, NOW)).toBeNull();
    expect(listingSnapshotNote("こわれた値", NOW)).toBeNull();
  });

  it("県ページももう掲載の数字を出していない", () => {
    /* 市区町村ページ（#1454）に続けて、県ページも公開統計へ移した
       （2026-09-20）。凍結した数字を出さなくなったので断りも要らない。 */
    const page = readFileSync(
      join(process.cwd(), "src/app/houi/pref/[code]/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("listingSnapshotNote");
    expect(page).not.toContain("medianOfMedians");
  });

  it("市区町村ページはもう掲載の数字を出していない", () => {
    /*
      **2026-09-19 に出どころを移した。**掲載から作った中央値と ㎡単価を
      公開統計（e-Stat）に置き換えたので、凍結の断りも要らなくなった。
      断りが要るのは**凍結した数字を出している頁だけ**で、出さなくなった
      頁に残すと「何が古いのか」が分からない文が 1 つ増えるだけになる。

      家賃の出どころそのものは `houiAreaHousingSource` が見張る。
    */
    const page = readFileSync(
      join(process.cwd(), "src/app/houi/area/[code]/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("listingSnapshotNote");
  });
});
