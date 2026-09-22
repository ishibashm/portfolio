import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOYOU_RANGES,
  DOYOU_SATSU_DIRECTIONS,
  checkIsDoyouHazard,
  doyouTypeOfDay,
  getCurrentZodiac,
  getUpcomingDoyouPeriod,
} from "@/utils/ephemerisEngine";
import { DIRECTION_LABELS } from "@/utils/directionGeo";

/**
 * 公開記事 doyou-and-doyousatsu の数字と表を、暦エンジンと照合する。
 *
 * この記事は**サイトの土用の実装をそのまま説明している**。黄経の区切り、
 * 季節ごとの間日の十二支、土用殺の方位、期間の長さ — どれも
 * ephemerisEngine が持っている値を日本語に写しただけで、実装を直すと
 * 記事だけが古くなる。散文は tsc も lint も守ってくれない
 * （blogTenshaClaims・blogToolLimitsClaims と同じ考え方）。
 *
 * 本文の表と文を**読んで**突き合わせる。記事の数字をこちらに写して
 * 固定すると、両方を同時に間違えたときに気付けない。
 */

const SLUG = "doyou-and-doyousatsu";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

type DoyouType = "SPRING" | "SUMMER" | "AUTUMN" | "WINTER";

const SEASON_OF: Record<string, DoyouType> = {
  春: "SPRING",
  夏: "SUMMER",
  秋: "AUTUMN",
  冬: "WINTER",
};

/** 日本時間の正午。日の境目（0 時）から離しておく。 */
function jstNoon(iso: string): Date {
  return new Date(`${iso}T03:00:00Z`);
}

/** 2024〜2029 年の土用をすべて拾う。 */
function allPeriods() {
  const out: {
    start: string;
    end: string;
    type: DoyouType;
    mabiDays: string[];
    days: number;
  }[] = [];
  let cursor = jstNoon("2024-01-01");
  const limit = jstNoon("2030-01-01").getTime();
  while (cursor.getTime() < limit) {
    const p = getUpcomingDoyouPeriod(cursor);
    if (!p) break;
    const end = jstNoon(p.end);
    if (end.getTime() >= limit) break;
    out.push({
      start: p.start,
      end: p.end,
      type: p.type as DoyouType,
      mabiDays: p.mabiDays,
      days:
        Math.round((end.getTime() - jstNoon(p.start).getTime()) / 86_400_000) +
        1,
    });
    cursor = new Date(end.getTime() + 86_400_000);
  }
  return out;
}

const PERIODS = allPeriods();

/** 期間の中の日を 1 日ずつ。 */
function daysOf(p: { start: string; days: number }): string[] {
  const out: string[] = [];
  for (let i = 0; i < p.days; i++) {
    out.push(
      new Date(jstNoon(p.start).getTime() + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  }
  return out;
}

describe("記事: 土用と土用殺", () => {
  it("走査できている（空回りしていない）", () => {
    /* 6 年 × 4 回 */
    expect(PERIODS).toHaveLength(24);
  });

  it("本文の黄経の区切りが、判定に使っている区切りと同じ", () => {
    const m = md.match(
      /春土用は太陽黄経(\d+)度から(\d+)度、夏は(\d+)度から(\d+)度、秋は(\d+)度から(\d+)度、冬は(\d+)度から(\d+)度/,
    );
    expect(m, "黄経の区切りを書いた文が見つからない").not.toBeNull();
    const n = m!.slice(1).map(Number);
    expect({
      SPRING: [n[0], n[1]],
      SUMMER: [n[2], n[3]],
      AUTUMN: [n[4], n[5]],
      WINTER: [n[6], n[7]],
    }).toEqual({
      SPRING: [...DOYOU_RANGES.SPRING],
      SUMMER: [...DOYOU_RANGES.SUMMER],
      AUTUMN: [...DOYOU_RANGES.AUTUMN],
      WINTER: [...DOYOU_RANGES.WINTER],
    });
  });

  it("期間の中の日はすべて土用、前後の日は土用でない", () => {
    /* 日の切り方そのもの（日本時間の日の終わり）は
       doyouDayBoundaryJst.test.ts が持つ。ここでは記事が言う
       「年に4回・約18日の期間」が期間として閉じていることだけ見る。 */
    for (const p of PERIODS) {
      for (const iso of daysOf(p)) {
        expect(doyouTypeOfDay(jstNoon(iso)), `${iso}（${p.type}）`).toBe(
          p.type,
        );
      }
      expect(
        doyouTypeOfDay(new Date(jstNoon(p.start).getTime() - 86_400_000)),
        `${p.start} の前日`,
      ).not.toBe(p.type);
      expect(
        doyouTypeOfDay(new Date(jstNoon(p.end).getTime() + 86_400_000)),
        `${p.end} の翌日`,
      ).not.toBe(p.type);
    }
  });

  it("「年に4回」「およそ18日間ずつ」「合計およそ72日・1年の約2割」", () => {
    for (const year of [2024, 2025, 2026, 2027, 2028, 2029]) {
      const inYear = PERIODS.filter((p) => p.start.startsWith(String(year)));
      expect(inYear, `${year} 年の土用の回数`).toHaveLength(4);
      expect(new Set(inYear.map((p) => p.type)).size, "季節が 4 つそろう").toBe(
        4,
      );

      for (const p of inYear) {
        expect(p.days, `${p.start} の日数`).toBeGreaterThanOrEqual(17);
        expect(p.days, `${p.start} の日数`).toBeLessThanOrEqual(19);
      }

      const total = inYear.reduce((a, p) => a + p.days, 0);
      expect(total, `${year} 年の合計日数`).toBeGreaterThanOrEqual(70);
      expect(total, `${year} 年の合計日数`).toBeLessThanOrEqual(74);
      const share = total / 365;
      expect(share, `${year} 年の割合`).toBeGreaterThan(0.18);
      expect(share, `${year} 年の割合`).toBeLessThan(0.22);
    }
  });

  it("間日の表の十二支が、実際に間日として扱われた日の十二支と同じ", () => {
    const rows = [
      ...md.matchAll(/^\|\s*([春夏秋冬])土用\s*\|\s*([^|]+?)\s*\|\s*$/gm),
    ];
    expect(rows.length, "間日の表の行数").toBe(4);

    for (const r of rows) {
      const type = SEASON_OF[r[1]];
      const written = r[2].split("・").map((s) => s.trim());
      expect(written.length, `${r[1]}土用の間日の数`).toBe(3);

      const seen = new Set<string>();
      for (const p of PERIODS.filter((x) => x.type === type)) {
        for (const iso of p.mabiDays) {
          seen.add(getCurrentZodiac(jstNoon(iso)).dayZodiac);
        }
      }
      expect([...seen].sort(), `${r[1]}土用の間日`).toEqual(
        [...written].sort(),
      );
    }
  });

  it("間日には土用殺が掛からず、それ以外の土用の日には必ず掛かる", () => {
    for (const p of PERIODS) {
      const mabi = new Set(p.mabiDays);
      for (const iso of daysOf(p)) {
        expect(checkIsDoyouHazard(jstNoon(iso)), `${iso} の土用殺`).toBe(
          !mabi.has(iso),
        );
      }
      /* 「土用の約18日間のうち、間日は3〜6日」 */
      expect(p.mabiDays.length, `${p.start} の間日の数`).toBeGreaterThanOrEqual(
        3,
      );
      expect(p.mabiDays.length, `${p.start} の間日の数`).toBeLessThanOrEqual(6);
    }
  });

  it("「多くの年で4〜5日」が実際の分布と合う", () => {
    const four5 = PERIODS.filter(
      (p) => p.mabiDays.length === 4 || p.mabiDays.length === 5,
    ).length;
    expect(four5 / PERIODS.length).toBeGreaterThan(0.5);
  });

  it("土用殺の方位の表が、判定の割り当てと同じ", () => {
    const rows = [
      ...md.matchAll(
        /^\|\s*([春夏秋冬])土用（[^）]*）\s*\|\s*([^|]+?)\s*\|\s*$/gm,
      ),
    ];
    expect(rows.length, "土用殺の表の行数").toBe(4);

    for (const r of rows) {
      const dir = DOYOU_SATSU_DIRECTIONS[SEASON_OF[r[1]]];
      expect(DIRECTION_LABELS[dir], `${r[1]}土用の土用殺`).toBe(r[2]);
    }

    /* 「四隅（南東・南西・北西・北東）が季節順に塞がっていく」。
       塞がるのは 1 方位だけ、という本文もここで見ている。 */
    const dirs = (["SPRING", "SUMMER", "AUTUMN", "WINTER"] as const).map(
      (t) => DOYOU_SATSU_DIRECTIONS[t],
    );
    expect(new Set(dirs).size).toBe(4);
    expect(dirs.every((d) => ["NE", "SE", "SW", "NW"].includes(d))).toBe(true);
  });
});
