import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  judgeDayAllDirections,
  gradeVerdict,
  ALL_DIRECTIONS,
} from "@/utils/auspiciousDays";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";
import { forecastAnchorMs } from "@/utils/boardInstant";
import { parseJapanDateTime } from "@/utils/japanDate";
import { directionLabelName } from "@/lib/directionLabels";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import type { TenchusatsuMode } from "@/utils/tenchusatsuPolicy";
import { DEFAULT_TENCHUSATSU_MODE } from "@/utils/tenchusatsuPolicy";

/**
 * 公開記事 what-this-tool-can-and-cannot-decide の数字をエンジンと照合する。
 *
 * この記事は**判定エンジンを回した結果をそのまま表に書いている**。
 * 段階の割り当て（gradeVerdict）や年盤の塞ぎ方を直すと、記事だけが
 * 古くなる。散文は tsc も lint も守ってくれないので、ここで突き合わせる
 * （blogFengShuiClaims・blogHonmeisatsuClaims と同じ考え方）。
 *
 * ## 何を固定して、何を固定しないか
 *
 * **固定する**のは暦と判定エンジンから出る数字だけ。これは入力
 * （生年月日・期間・経度・天中殺の効かせ方）が同じなら必ず同じ値になる。
 *
 * **固定しないのは巡回のデータから出る数字**（記事の「数えられないもの」
 * にある空の方位の内訳 117 / 364 / 7 / 233）。あれは `areaDirections.json`
 * が更新されるたびに動くので、ここに書くと**関係の無いデータ更新で CI が
 * 落ちる**。記事側は測った日付を添えて「毎晩動く」と明記する扱いにした
 * （実際 4 日前は 714 方位で 113 / 365 / 7 / 229 だった）。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/what-this-tool-can-and-cannot-decide.md"),
  "utf-8",
);

/** 記事が条件として書いている値。ここを変えたら記事の表も変わる。 */
const FROM = "2026-10-01T12:00:00+09:00";
const TO = "2027-09-30T12:00:00+09:00";
const LON = 139.6917;
const YEAR_BOARD_AT = "2026-11-01T12:00:00+09:00";

/** 記事が並べている 4 人。 */
const BIRTHS = [
  "1990-01-02",
  "1985-07-20",
  "1972-11-11",
  "2000-03-15",
] as const;

/** 生年月日ごとの時刻（記事には出さないが計算には要る）。 */
const BIRTH_TIME: Record<string, string> = {
  "1990-01-02": "05:30",
  "1985-07-20": "12:00",
  "1972-11-11": "09:00",
  "2000-03-15": "18:00",
};

const ORDER = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function paramsFor(birth: string) {
  const d = parseJapanDateTime(`${birth}T${BIRTH_TIME[birth]}`);
  return {
    honmeiStar: getHonmeiStar(d).classical,
    voidZodiacs: getPersonalVoidZodiac(d),
    lon: LON,
    tenchusatsuMode: DEFAULT_TENCHUSATSU_MODE as TenchusatsuMode,
  };
}

interface Tally {
  /** 段階ごとの「方位 × 日」の数。 */
  tiers: Record<string, number>;
  /** 吉（S・A・B）の方位が 1 つでもある日。 */
  goodDays: number;
  /** 八方位すべてが X の日。 */
  allBadDays: number;
  /** 期間内に 1 日でも吉が出た方位（記事と同じ日本語表記・記事の並び順）。 */
  goodDirections: string[];
  /** 走査した日数。 */
  days: number;
}

/** 記事と同じ期間・同じ条件で 1 人ぶん数える。 */
function tally(birth: string): Tally {
  const p = paramsFor(birth);
  const tiers: Record<string, number> = {};
  const good = new Set<string>();
  let cursor = new Date(forecastAnchorMs(new Date(FROM)));
  const end = new Date(forecastAnchorMs(new Date(TO)));
  let days = 0;
  let goodDays = 0;
  let allBadDays = 0;

  while (cursor <= end && days < 400) {
    const all = judgeDayAllDirections(cursor, p);
    let hasGood = false;
    let allBad = true;
    for (const dir of ALL_DIRECTIONS) {
      const t = gradeVerdict(all[dir]);
      tiers[t] = (tiers[t] ?? 0) + 1;
      if (t === "S" || t === "A" || t === "B") {
        hasGood = true;
        good.add(dir);
      }
      if (t !== "X") allBad = false;
    }
    if (hasGood) goodDays++;
    if (allBad) allBadDays++;
    days++;
    cursor = new Date(cursor.getTime() + 86400000);
  }

  return {
    tiers,
    goodDays,
    allBadDays,
    // 記事は方位盤の並び（北→北西）で書く。Set の挿入順に依存させない。
    goodDirections: ORDER.filter((d) => good.has(d)).map(
      (d) => DIRECTION_LABELS[d],
    ),
    days,
  };
}

/** 記事の表から、先頭のセルが `head` の行を拾う。 */
function rowsFor(head: string): string[][] {
  const rows = md
    .split("\n")
    .filter((l) => l.startsWith(`| ${head} `))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  expect(rows.length, `記事に「${head}」の行が無い`).toBeGreaterThan(0);
  return rows;
}

/**
 * 列数で 1 行に決める。
 *
 * 生年月日は 2 つの表に出る（段階の内訳が 9 列、日数と方位が 4 列）。
 * 最初に見つかった行を返すと取り違えるので、列数で選ばせる。
 */
function rowFor(head: string, columns: number): string[] {
  const hit = rowsFor(head).filter((r) => r.length === columns);
  expect(hit, `「${head}」の ${columns} 列の行が 1 本でない`).toHaveLength(1);
  return hit[0];
}

const TALLIES = new Map(BIRTHS.map((b) => [b, tally(b)]));

describe("記事: この道具で決められること、決められないこと", () => {
  it("条件として書いている値が記事と一致する", () => {
    // 数字だけ合っていても、前提が違えば再現できない。
    expect(md).toContain("2026-10-01 〜 2027-09-30（365 日）");
    expect(md).toContain("139.6917");
    for (const b of BIRTHS) expect(md).toContain(b);
    // 走査した日数そのもの。うるう年の扱いが変わればここで出る。
    for (const b of BIRTHS) expect(TALLIES.get(b)!.days).toBe(365);
  });

  it.each(BIRTHS)("%s の段階の内訳が engine と一致する", (birth) => {
    const t = TALLIES.get(birth)!;
    const [, , ...cells] = rowFor(birth, 9);
    // 列は S / A / B / C / D / X / X の割合。
    const [s, a, b, c, d, x, ratio] = cells;
    const num = (v: string) => Number(v.replace(/,/g, ""));

    expect(num(s), "S").toBe(t.tiers.S ?? 0);
    expect(num(a), "A").toBe(t.tiers.A ?? 0);
    expect(num(b), "B").toBe(t.tiers.B ?? 0);
    expect(num(c), "C").toBe(t.tiers.C ?? 0);
    expect(num(d), "D").toBe(t.tiers.D ?? 0);
    expect(num(x), "X").toBe(t.tiers.X ?? 0);

    const total = t.days * ALL_DIRECTIONS.length;
    expect(ratio).toBe(`${(((t.tiers.X ?? 0) / total) * 100).toFixed(1)}%`);
  });

  it("2,920 通り（365 日 × 8 方位）という書き方が合っている", () => {
    expect(md).toContain("2,920 通り（365 日 × 8 方位）");
    expect(365 * ALL_DIRECTIONS.length).toBe(2920);
  });

  it.each(BIRTHS)("%s の日数と使えた方位が engine と一致する", (birth) => {
    const t = TALLIES.get(birth)!;
    // 4 列の表（生年月日 / 吉の方位がある日 / どの方位も凶の日 / 方位）。
    const [, good, allBad, dirs] = rowFor(birth, 4);
    expect(good).toBe(`${t.goodDays} / ${t.days}`);
    expect(Number(allBad)).toBe(t.allBadDays);
    expect(dirs).toBe(t.goodDirections.join("・"));
  });

  it("北・北東・南・南西は4人とも0日（記事の主張）", () => {
    const never = ["北", "北東", "南", "南西"];
    for (const b of BIRTHS) {
      const got = TALLIES.get(b)!.goodDirections;
      for (const n of never) {
        expect(got, `${b} で ${n} に吉が出ている`).not.toContain(n);
      }
    }
    expect(md).toContain("北・北東・南・南西は、4 人とも 365 日すべて 0 日");
  });

  it("2026 年盤の表が engine と一致する", () => {
    const boards = BIRTHS.map((b) =>
      judgeDayAllDirections(
        new Date(forecastAnchorMs(new Date(YEAR_BOARD_AT))),
        paramsFor(b),
      ),
    );

    for (const dir of ORDER) {
      const row = rowFor(DIRECTION_LABELS[dir], 5);
      // 先頭は方位名。以降が 4 人ぶん。
      expect(row.slice(1)).toEqual(
        boards.map((b) =>
          // 記事は大吉を強調している。札の名前そのものは同じ。
          directionLabelName(b[dir].yearLayer) === "大吉"
            ? "**大吉**"
            : directionLabelName(b[dir].yearLayer),
        ),
      );
    }
  });

  it("「平穏は吉に数えない」という記事の主張が engine と合っている", () => {
    // 二黒の人の 2026 年盤には大吉が 1 つも無い、という記事の芯。
    const board = judgeDayAllDirections(
      new Date(forecastAnchorMs(new Date(YEAR_BOARD_AT))),
      paramsFor("1990-01-02"),
    );
    const names = ORDER.map((d) => directionLabelName(board[d].yearLayer));

    expect(names).not.toContain("大吉");
    expect(names).not.toContain("吉");
    expect(names.filter((n) => n === "平穏")).toHaveLength(2);
    expect(md).toContain("2026 年盤に大吉方位が 1 つもありません");
  });
});
