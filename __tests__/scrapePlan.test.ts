import { describe, expect, it } from "vitest";

import prefecturesWithData from "@/data/prefecturesWithData.json";
import {
  SCRAPE_MAX_PARALLEL,
  SCRAPE_TARGETS,
  isScheduledOn,
  targetsForDate,
} from "@/lib/scrapeTargets";
import { buildPlan } from "../scripts/plan_scrape_matrix";

/** 検査に使う連続した日付 */
function days(count: number, from = "2026-01-01"): Date[] {
  const start = new Date(`${from}T00:00:00Z`);
  return Array.from(
    { length: count },
    (_, i) => new Date(start.getTime() + i * 86_400_000),
  );
}

describe("スクレイピング対象のレジストリ", () => {
  it("slug と日本語名が重複しない", () => {
    const slugs = SCRAPE_TARGETS.map((t) => t.slug);
    const names = SCRAPE_TARGETS.map((t) => t.name);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("slug は nifty の URL に入る小文字英字", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.slug).toMatch(/^[a-z]+$/);
    }
  });

  it("日本語名は都道府県の表記で終わる。パージが住所と前方一致で突き合わせる", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.name).toMatch(/[都道府県]$/);
    }
  });

  it("offsetDays は everyNDays の範囲に収まる。外れると永久に回らない県が出る", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.everyNDays).toBeGreaterThanOrEqual(1);
      expect(t.offsetDays).toBeGreaterThanOrEqual(0);
      expect(t.offsetDays).toBeLessThan(Math.max(t.everyNDays, 1));
    }
  });

  it("予算は正の分数", () => {
    for (const t of SCRAPE_TARGETS) {
      expect(t.budgetMin).toBeGreaterThan(0);
    }
  });

  it("metro は毎日回す", () => {
    for (const t of SCRAPE_TARGETS.filter((x) => x.tier === "metro")) {
      expect(t.everyNDays).toBe(1);
    }
  });
});

describe("巡回の割り付け", () => {
  it("どの県も everyNDays 日のうちに必ず 1 回は回る", () => {
    const window = days(31);
    for (const t of SCRAPE_TARGETS) {
      const hit = window
        .slice(0, t.everyNDays)
        .some((d) => isScheduledOn(t, d));
      expect(hit, `${t.slug} が ${t.everyNDays} 日以内に回らない`).toBe(true);
    }
  });

  it("metro は毎日、対象に入る", () => {
    for (const d of days(14)) {
      const slugs = new Set(targetsForDate(d).map((t) => t.slug));
      for (const t of SCRAPE_TARGETS.filter((x) => x.tier === "metro")) {
        expect(slugs.has(t.slug)).toBe(true);
      }
    }
  });

  it("対象が 0 件になる日は無い", () => {
    for (const d of days(60)) {
      expect(targetsForDate(d).length).toBeGreaterThan(0);
    }
  });
});

describe("1 回の実行にかかる実時間", () => {
  it("どの日も 24 時間を超えない。超えると日次の cron を追い越す", () => {
    for (const d of days(60)) {
      const plan = buildPlan(d);
      expect(
        plan.estimatedWallMin,
        `${d.toISOString().slice(0, 10)} の見積もりが ${plan.estimatedWallMin} 分`,
      ).toBeLessThan(24 * 60);
    }
  });

  it("geocode のぶんを残して 20 時間より短い", () => {
    for (const d of days(60)) {
      expect(buildPlan(d).estimatedWallMin).toBeLessThan(20 * 60);
    }
  });

  it("最長ジョブより短くは見積もらない", () => {
    for (const d of days(7)) {
      const plan = buildPlan(d);
      expect(plan.estimatedWallMin).toBeGreaterThanOrEqual(plan.longestMin);
    }
  });

  it("並列数を上げない限り、県を足しても負荷は変わらない", () => {
    // リクエスト頻度は並列数だけで決まる。ここを変えるときは相手サーバーへの
    // 負荷が比例して増えることを意識する、という意図をテストに固定しておく。
    expect(SCRAPE_MAX_PARALLEL).toBeLessThanOrEqual(4);
  });
});

describe("手動実行の上書き", () => {
  const day = new Date("2026-01-01T00:00:00Z");

  it("県を指定すると巡回予定を無視してその県だけになる", () => {
    const plan = buildPlan(day, { only: ["shimane"] });
    expect(plan.entries.map((e) => e.prefecture)).toEqual(["shimane"]);
  });

  it("知らない県を指定したら黙って落とさずエラーにする", () => {
    expect(() => buildPlan(day, { only: ["gifu"] })).toThrow(/gifu/);
  });

  it("分数の上書きが全県に効く", () => {
    const plan = buildPlan(day, { budgetOverrideMin: 10 });
    expect(plan.entries.every((e) => e.budget === 10)).toBe(true);
  });
});

describe("スキャナーの県プリセット", () => {
  it("データのある県はすべてスクレイピング対象に含まれる", () => {
    // 対象から外した県が prefecturesWithData.json に残っていると、UI の
    // プリセットに出るのに二度と更新されない県ができる。
    const names = new Set(SCRAPE_TARGETS.map((t) => t.name));
    for (const p of prefecturesWithData.prefs) {
      expect(names.has(p), `${p} がレジストリに無い`).toBe(true);
    }
  });

  it("市区町村の数が入っている", () => {
    expect(prefecturesWithData.areaCount).toBeGreaterThan(0);
  });
});

describe("県別の掲載数（地図の俯瞰の元データ）", () => {
  it("掲載数が載っている県はすべてスクレイピング対象", () => {
    const names = new Set(SCRAPE_TARGETS.map((t) => t.name));
    for (const [pref, count] of Object.entries(
      prefecturesWithData.listingCounts ?? {},
    )) {
      expect(names.has(pref), `${pref} がレジストリに無い`).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

  it("データがある県には掲載数もある。無いと俯瞰でその県が0件表示になる", () => {
    const counts: Record<string, number> =
      prefecturesWithData.listingCounts ?? {};
    for (const pref of prefecturesWithData.prefs) {
      expect(counts[pref], `${pref} の掲載数が無い`).toBeGreaterThan(0);
    }
  });
});
