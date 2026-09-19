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
import { getZonedDateTimeFields } from "@/utils/solarTime";

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
 * 立春から翌年の立春の前日まで、方位ごとに段階を数える。
 *
 * **三盤吉（S）と「吉を含む日」（S・A・B）は別物。**記事は最初この 2 つを
 * 同じ列に「三盤が吉になる日」として出していて、31〜93 日という数字は
 * 実際には S+A+B だった（東は 31 日あるのに S は 0 日）。サイトは S を
 * 三盤吉と定義している（`TIER_LABELS`）ので、混ぜると自分の用語と
 * 食い違う。分けて数える。
 *
 * 天中殺は方位の段階とは独立に判定されるので、S のまま
 * `blockedByTenchusatsu` が立つ日がある。実際に動ける日はそのぶん減る。
 */
function scan() {
  const from = risshun(YEAR);
  const to = new Date(risshun(YEAR + 1).getTime() - 86_400_000);
  const open: Record<string, number> = {};
  const triple: Record<string, number> = {};
  const tripleFree: Record<string, number> = {};
  const tripleMonths: Record<string, Set<string>> = {};
  let days = 0;
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const f = getZonedDateTimeFields(d, 9);
    const all = judgeDayAllDirections(d, base);
    days++;
    for (const dir of ALL_DIRECTIONS) {
      const v = all[dir];
      const tier = gradeVerdict(v);
      open[dir] ??= 0;
      triple[dir] ??= 0;
      tripleFree[dir] ??= 0;
      tripleMonths[dir] ??= new Set();
      if (tier === "S" || tier === "A" || tier === "B") open[dir]++;
      if (tier === "S") {
        triple[dir]++;
        tripleMonths[dir].add(`${f.year}-${f.month}`);
        if (!v.blockedByTenchusatsu) tripleFree[dir]++;
      }
    }
  }
  return { days, open, triple, tripleFree, tripleMonths };
}

const scanned = scan();
const yearBoard = getYearDirections(YEAR, base.honmeiStar);

/**
 * 記事の表の 1 行。
 * 「| 北   | 五黄殺 | **0 日**    | **0 日**              |」
 *
 * prettier が markdown の表の桁を揃えるので、区切りの前後の空白は
 * 可変として読む（書いたときの見た目で固定すると、整形で落ちる）。
 *
 * 記事にはもう 1 つ「三盤吉 / 天中殺を外すと / 出る月」の表があるが、
 * そちらは 2 列目が「29 日」（空白を含む）なので `(\S+)` に当たらず、
 * ここには入ってこない。
 */
const rows = [
  ...md.matchAll(
    /^\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*\*{0,2}(\d+) 日\*{0,2}\s*\|\s*\*{0,2}(\d+) 日\*{0,2}\s*\|$/gm,
  ),
].map((m) => ({
  jp: m[1],
  yearLabel: m[2],
  triple: Number(m[3]),
  open: Number(m[4]),
}));

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

  it.each(ALL_DIRECTIONS)("%s の年盤の札と両方の日数が盤と一致する", (dir) => {
    const row = rows.find((r) => r.jp === DIRECTION_LABELS[dir]);
    expect(row, `${dir} の行が表に無い`).toBeTruthy();
    const verdict = yearBoard.verdicts.find((v) => v.direction === dir);
    expect(row!.yearLabel).toBe(verdict!.label);
    expect(row!.triple, `${dir} の三盤吉`).toBe(scanned.triple[dir]);
    expect(row!.open, `${dir} の吉を含む日`).toBe(scanned.open[dir]);
  });

  it("三盤吉と「吉を含む日」は別の数で、混ぜて書いていない", () => {
    // 記事はこの 2 つを 1 列にまとめて「三盤が吉になる日」と書いていた。
    // 少なくとも 1 方位で両者が食い違うことを押さえておけば、また
    // 1 列に戻したときにここが落ちる。
    const differ = rows.filter((r) => r.triple !== r.open);
    expect(differ.length).toBeGreaterThan(0);
    expect(md).toContain("三盤吉（S）");
    expect(md).toContain("吉を含む日（S・A・B）");
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

  it("年盤が平の方位には三盤吉が 1 日も出ない（上限は A）", () => {
    // 三盤吉は年・月・日の 3 つとも吉。年盤が平だと満たしようがない。
    // 記事の芯のひとつで、東が 31 日あるのに S は 0 日という形で出る。
    const flat = yearBoard.verdicts.filter((v) => v.status === "SAFE");
    expect(flat.length).toBeGreaterThan(0);
    for (const v of flat) {
      expect(scanned.triple[v.direction], `${v.jp} の三盤吉`).toBe(0);
      expect(scanned.open[v.direction], `${v.jp} の吉を含む日`).toBeGreaterThan(
        0,
      );
    }
    expect(md).toContain("年盤が平だと、三盤吉は原理的に出ません");
    expect(md).toContain("年盤は下限だけでなく、届く上限も決めています");
  });

  it("「日数が多い方位」は数え方で入れ替わる", () => {
    // 記事はこれを根拠に「多いほうを選ぶ、ではない」と書いている。
    // 両方の数え方で首位が同じになったら、その主張は成り立たない。
    const open = yearBoard.verdicts.filter((v) => v.status === "OPTIMAL");
    const byOpen = [...open].sort(
      (a, b) => scanned.open[b.direction] - scanned.open[a.direction],
    )[0];
    const byTriple = [...open].sort(
      (a, b) => scanned.triple[b.direction] - scanned.triple[a.direction],
    )[0];
    expect(byOpen.direction).not.toBe(byTriple.direction);
    expect(md).toContain("**別の方位を指します**");
  });
});

describe("記事: 少なくてもその日に動いてよいか", () => {
  it("段階は日ごとの盤だけで決まり、その方位の日数を見ていない", () => {
    // gradeVerdict が読むのは 4 項目だけ（年・月・日の層と最終）。
    // 「その方位に何日あるか」は引数に無いので、少ない方位の三盤吉が
    // 格落ちすることはありえない。記事の答えはここに立っている。
    const v = {
      yearLayer: "OPTIMAL",
      monthLayer: "OPTIMAL",
      dayLayer: "OPTIMAL",
      finalStatus: "OPTIMAL",
      isTripleAuspicious: true,
    };
    expect(gradeVerdict(v)).toBe("S");
    expect(md).toContain("**同じ三盤吉**");
    expect(md).toContain("**少なくてもその日に動いてかまいません**");
  });

  it("天中殺を外した三盤吉と、出る月の数が表と一致する", () => {
    const spread = [
      ...md.matchAll(
        /^\|\s*(\S+)\s*\|\s*(\d+) 日\s*\|\s*(\d+) 日\s*\|\s*(\d+) か月\s*\|$/gm,
      ),
    ].map((m) => ({
      jp: m[1],
      triple: Number(m[2]),
      free: Number(m[3]),
      months: Number(m[4]),
    }));
    expect(spread).toHaveLength(3);
    for (const row of spread) {
      const dir = ALL_DIRECTIONS.find((d) => DIRECTION_LABELS[d] === row.jp);
      expect(dir, `${row.jp} が八方位に無い`).toBeTruthy();
      expect(row.triple, `${row.jp} の三盤吉`).toBe(scanned.triple[dir!]);
      expect(row.free, `${row.jp} の天中殺を外した数`).toBe(
        scanned.tripleFree[dir!],
      );
      expect(row.months, `${row.jp} の出る月`).toBe(
        scanned.tripleMonths[dir!].size,
      );
    }
    // 天中殺で必ず減る方位があること（減らないなら表の 2 列目が要らない）
    expect(spread.some((r) => r.free < r.triple)).toBe(true);
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
