import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTIONS,
  gradeVerdict,
  judgeDayAllDirections,
} from "@/utils/auspiciousDays";
import {
  AstroEngine,
  getHonmeiStar,
  getPersonalVoidZodiac,
  parseDirectionFilterMode,
} from "@/utils/ephemerisEngine";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { getYearDirections } from "@/lib/kigakuContent";
import { getLuckyDays, getRokuyo } from "@/utils/lunar";

/**
 * 公開記事 direction-or-timing-which-matters の数字を判定エンジンと
 * 照合する。
 *
 * この記事の主張（**方位が先、日取りが後**）は、思想ではなく
 * 「年盤で塞がった方位は 365 日すべて最低評価になる」という実測に
 * 立っている。盤の切り替え・段階の付け方（gradeVerdict）・凶の重さの
 * 順序を直すと、記事の表だけが古くなる。散文は tsc も lint も守って
 * くれないので、ここで突き合わせる（blogTenshaClaims・
 * blogGouosatsuClaims と同じ考え方）。
 *
 * 入力（生年月日・経度・年）が同じなら、答えは必ず同じ値になる。
 */

const SLUG = "direction-or-timing-which-matters";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** 記事が使った条件。ここを変えたら記事の表も変わる。 */
const BIRTH = new Date("1985-05-20T09:00:00+09:00");
const NAGOYA_LON = 136.9008;
const YEAR = 2027;

/** 立春（黄経 315 度）の瞬間。solarTermTimezone と同じ二分探索。 */
function risshun(year: number): Date {
  let lo = Date.UTC(year, 0, 20);
  let hi = Date.UTC(year, 1, 20);
  const ahead = (t: number) =>
    (AstroEngine.getSolarLongitude(new Date(t)) - 315 + 360) % 360 < 180;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (ahead(mid)) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

const base = {
  honmeiStar: getHonmeiStar(BIRTH).classical,
  voidZodiacs: getPersonalVoidZodiac(BIRTH),
  lon: NAGOYA_LON,
  tenchusatsuMode: "strict" as const,
  involuntaryMove: false,
  directionFilterMode: parseDirectionFilterMode("composite"),
};

/**
 * 立春から翌年の立春の前日まで、方位ごとに「三盤が吉」の日を数える。
 * 吉は段階 S・A・B（凶なしで、どれかの盤が吉）。
 */
function scan() {
  const from = risshun(YEAR);
  const to = new Date(risshun(YEAR + 1).getTime() - 86_400_000);
  const open: Record<string, number> = {};
  let days = 0;
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
    const all = judgeDayAllDirections(new Date(t), base);
    days++;
    for (const dir of ALL_DIRECTIONS) {
      const tier = gradeVerdict(all[dir]);
      open[dir] ??= 0;
      if (tier === "S" || tier === "A" || tier === "B") open[dir]++;
    }
  }
  return { days, open };
}

const scanned = scan();
const yearBoard = getYearDirections(YEAR, base.honmeiStar);

/**
 * 記事の表の 1 行。「| 北   | 五黄殺 | **0 日**         |」
 *
 * prettier が markdown の表の桁を揃えるので、区切りの前後の空白は
 * 可変として読む（書いたときの見た目で固定すると、整形で落ちる）。
 */
const rows = [
  ...md.matchAll(
    /^\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*\*{0,2}(\d+) 日\*{0,2}\s*\|$/gm,
  ),
].map((m) => ({ jp: m[1], yearLabel: m[2], open: Number(m[3]) }));

describe("記事: 方位と日取りのどちらが重いのか（前提）", () => {
  it("記事が使った人の本命星は六白金星、空亡は子丑", () => {
    expect(base.honmeiStar).toBe(6);
    expect(base.voidZodiacs.join("")).toBe("子丑");
    expect(md).toContain("六白金星");
    expect(md).toContain("空亡は子丑");
  });

  it("走査は立春から翌年の立春の前日まで 365 日", () => {
    expect(scanned.days).toBe(365);
    expect(md).toContain("365 日 × 8 方位");
  });

  it("2027 年の立春は 2 月 4 日", () => {
    // 日本時間。記事は「2027 年の立春（2 月 4 日）から」と書いている。
    const jst = new Date(risshun(YEAR).getTime() + 9 * 3_600_000);
    expect(jst.getUTCMonth() + 1).toBe(2);
    expect(jst.getUTCDate()).toBe(4);
    expect(md).toContain("2027 年の立春（2 月 4 日）");
  });
});

describe("記事: 方位ごとの表", () => {
  it("表は 8 方位ぶん", () => {
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.jp)).toEqual(
      ALL_DIRECTIONS.map((d) => DIRECTION_LABELS[d]),
    );
  });

  it.each(ALL_DIRECTIONS)("%s の年盤の札と吉の日数が盤と一致する", (dir) => {
    const row = rows.find((r) => r.jp === DIRECTION_LABELS[dir]);
    expect(row, `${dir} の行が表に無い`).toBeTruthy();
    const verdict = yearBoard.verdicts.find((v) => v.direction === dir);
    expect(row!.yearLabel).toBe(verdict!.label);
    expect(row!.open).toBe(scanned.open[dir]);
  });
});

describe("記事: 方位が先、日取りが後（この記事の主張）", () => {
  it("年盤で塞がった方位は、365 日すべてが最低評価（吉の日は 0）", () => {
    const blocked = yearBoard.verdicts.filter((v) =>
      ["NOISE_GOU", "NOISE_ANKEN", "NOISE_HA", "NOISE_HONMEI"].includes(
        v.status,
      ),
    );
    // この年・この本命星では 4 方位。記事もそう書いている。
    expect(blocked).toHaveLength(4);
    expect(md).toContain("年盤で塞がった 4 方位は 365 日すべてが最低評価");
    for (const v of blocked) {
      expect(scanned.open[v.direction], `${v.jp}`).toBe(0);
    }
  });

  it("年盤が空いている方位には吉の日が 31〜93 日ある", () => {
    const opens = yearBoard.verdicts
      .filter((v) => v.status === "OPTIMAL" || v.status === "SAFE")
      .map((v) => scanned.open[v.direction]);
    expect(opens).toHaveLength(4);
    expect(Math.min(...opens)).toBe(31);
    expect(Math.max(...opens)).toBe(93);
    expect(md).toContain("**31〜93 日**");
  });
});

describe("記事: 択日は方位を持たない", () => {
  it("六曜・天赦日・一粒万倍日は日付だけで決まり、方位を受け取らない", () => {
    // 記事は「入力は日付だけです」と書いている。引数が 1 つであることを
    // 見れば、方位を混ぜようがないことが言える。
    expect(getRokuyo.length).toBe(1);
    expect(getLuckyDays.length).toBe(1);
    const d = new Date("2027-03-05T03:00:00Z");
    expect(typeof getRokuyo(d)).toBe("string");
    expect(typeof getLuckyDays(d).isTensho).toBe("boolean");
    expect(md).toContain("入力は日付だけです");
  });
});
