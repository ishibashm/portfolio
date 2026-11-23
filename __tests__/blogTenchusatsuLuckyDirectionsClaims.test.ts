import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getYearDirections } from "@/lib/kigakuContent";
import { generateBoard, getClassicalYearStar } from "@/utils/ephemerisEngine";
import { tenchusatsuForCivilDate } from "@/utils/tenchusatsuCore";
import { getYearBranch } from "@/utils/tenchusatsu";

/**
 * 公開記事の数値をエンジンと照合する。
 *
 * 記事 tenchusatsu-and-lucky-directions は「1985年10月12日生まれ」を例に、
 * 本命星・日柱・天中殺と、2026・2027 年の年盤の吉凶を**具体的な値**で
 * 載せている。記事は散文なので tsc も lint も守ってくれない。エンジンの
 * 修正で値が変わったのに記事が古いまま、が他の記事で実際に起きている
 * （#656・#657）。ここで機械的に照合する。
 *
 * 記事を書き換えて文の形が変わったら、このテストも一緒に直すこと。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/tenchusatsu-and-lucky-directions.md"),
  "utf-8",
);
/** 太字の印を外した本文。照合は字面で行うので、強調の有無で外れないようにする */
const text = md.replace(/\*\*/g, "");

const JP: Record<string, string> = {
  N: "北",
  NE: "北東",
  E: "東",
  SE: "南東",
  S: "南",
  SW: "南西",
  W: "西",
  NW: "北西",
};
const OPPOSITE: Record<string, string> = {
  N: "S",
  NE: "SW",
  E: "W",
  SE: "NW",
  S: "N",
  SW: "NE",
  W: "E",
  NW: "SE",
};
/** 十二支 → その支が座る方位（破は年の支の反対側） */
const BRANCH_DIR: Record<string, string> = {
  子: "N",
  丑: "NE",
  寅: "NE",
  卯: "E",
  辰: "SE",
  巳: "SE",
  午: "S",
  未: "SW",
  申: "SW",
  酉: "W",
  戌: "NW",
  亥: "NW",
};

/** 年の正午（日本時間）で本命星を引く。立春の前後をまたがない日だけを渡す */
function honmei(date: string): number {
  return getClassicalYearStar(new Date(`${date}T12:00:00+09:00`));
}

function seatOf(year: number, star: number): string {
  const board = generateBoard(
    getClassicalYearStar(new Date(Date.UTC(year, 5, 1))),
  ) as Record<string, number>;
  const dir = Object.keys(JP).find((d) => board[d] === star);
  if (!dir) throw new Error(`${year} 年盤に ${star} が無い`);
  return dir;
}

describe("記事: 1985年10月12日生まれの本命星", () => {
  it("六白金星。立春前の 1985-01-15 なら前年扱いで七赤金星", () => {
    expect(text).toContain("九星気学では六白金星です");
    expect(text).toContain("1985年1月15日生まれなら前年");
    expect(text).toContain("七赤金星になります");
    expect(honmei("1985-10-12")).toBe(6);
    expect(honmei("1985-01-15")).toBe(7);
  });

  it("2日前の 1985-10-10 も同じ六白金星", () => {
    expect(text).toContain("1985年10月10日生まれ");
    expect(honmei("1985-10-10")).toBe(6);
  });
});

describe("記事: 日柱と天中殺", () => {
  it("1985-10-12 は 2000-01-07（甲子）から −5,200 日、番号 20 の甲申で午未天中殺", () => {
    expect(text).toContain("（−5,200日）");
    expect(text).toContain("番号20の甲申");
    expect(text).toContain("午未天中殺");
    const days = (Date.UTC(1985, 9, 12) - Date.UTC(2000, 0, 7)) / 86_400_000;
    expect(days).toBe(-5200);
    const r = tenchusatsuForCivilDate(1985, 10, 12);
    expect(r.ganZhiIndex).toBe(20);
    expect(r.ganZhi).toBe("甲申");
    expect(r.tenchusatsu.name).toBe("午未");
  });

  it("午未天中殺の年天中殺は 2026・2027 年（午・未の年）", () => {
    expect(text).toContain(
      "2026年2月4日の立春から2028年2月4日の立春前まで2年間が年天中殺",
    );
    expect(getYearBranch(2026)).toBe("午");
    expect(getYearBranch(2027)).toBe("未");
    expect(getYearBranch(2028)).not.toBe("午");
    expect(getYearBranch(2028)).not.toBe("未");
  });

  it("1985-10-10 は番号 18 の壬午で申酉天中殺。年天中殺は 2028・2029 年", () => {
    expect(text).toContain("番号18の壬午");
    expect(text).toContain("申酉天中殺（年天中殺は2028年・2029年）");
    const r = tenchusatsuForCivilDate(1985, 10, 10);
    expect(r.ganZhiIndex).toBe(18);
    expect(r.ganZhi).toBe("壬午");
    expect(r.tenchusatsu.name).toBe("申酉");
    expect(getYearBranch(2028)).toBe("申");
    expect(getYearBranch(2029)).toBe("酉");
  });
});

/**
 * 記事の文から「X年（中宮：…）は A・B が吉方位で 南（五黄殺）・北（…）が
 * 凶方位」の形を拾う。凶方位の括弧の中は、その方位に掛かる凶の名前を
 * 全部並べたもの（エンジンの yearLayer は 1 方位に 1 つしか持たない）。
 */
function parseYear(year: number) {
  const re = new RegExp(
    `${year}年（中宮：([^）]+)）は([^が]+)が吉方位で(.+?)が凶方位`,
  );
  const m = text.match(re);
  if (!m) throw new Error(`${year} 年の文が記事に見つからない`);
  const good = m[2].split("・");
  const bad: Record<string, string[]> = {};
  for (const part of m[3].matchAll(/([北東南西]+)（([^）]+)）/g)) {
    bad[part[1]] = part[2].split("・");
  }
  return { center: m[1], good, bad };
}

const STAR_JP = [
  "",
  "一白水星",
  "二黒土星",
  "三碧木星",
  "四緑木星",
  "五黄土星",
  "六白金星",
  "七赤金星",
  "八白土星",
  "九紫火星",
];

describe.each([2026, 2027])("記事: 六白金星の %i 年の年盤", (year) => {
  const article = parseYear(year);
  const { centerStar, verdicts } = getYearDirections(year, 6);

  it("中宮の星が一致する", () => {
    expect(article.center).toBe(STAR_JP[centerStar]);
  });

  it("吉方位の並びがエンジンの吉と一致する", () => {
    const engineGood = verdicts
      .filter((v) => v.kind === "good")
      .map((v) => v.jp);
    expect([...article.good].sort()).toEqual([...engineGood].sort());
  });

  it("凶方位がエンジンの凶と一致し、先頭の名前がエンジンの判定と同じ", () => {
    const engineBad = verdicts.filter((v) => v.kind === "bad");
    expect(Object.keys(article.bad).sort()).toEqual(
      engineBad.map((v) => v.jp).sort(),
    );
    for (const v of engineBad) {
      expect(article.bad[v.jp], `${year} ${v.jp}`).toContain(v.label);
    }
  });

  it("括弧に並べた凶の名前が、盤の上で重なっている凶と過不足なく一致する", () => {
    // エンジンの yearLayer は 1 方位に 1 つしか持たない（先に付いた凶が
    // 勝つ）。記事は重なっている凶を全部並べているので、盤から直接
    // 組み立てて突き合わせる。「含むか」ではなく集合の一致で見る
    // （含むかだけだと、北東に本命殺を書き足しても通ってしまった）。
    const fiveDir = seatOf(year, 5);
    const honmeiDir = seatOf(year, 6);
    const haDir = OPPOSITE[BRANCH_DIR[getYearBranch(year)]];
    const expected: Record<string, string[]> = {};
    const add = (dir: string, name: string) => {
      (expected[JP[dir]] ??= []).push(name);
    };
    add(fiveDir, "五黄殺");
    add(OPPOSITE[fiveDir], "暗剣殺");
    add(haDir, "歳破");
    add(honmeiDir, "本命殺");
    add(OPPOSITE[honmeiDir], "本命的殺");
    const sortAll = (m: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(m)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, [...v].sort()]),
      );
    expect(sortAll(article.bad)).toEqual(sortAll(expected));
  });
});

describe("記事: 2026 年に北西へ移る計画は「方位は吉・期間は天中殺」", () => {
  it("北西は 2026 年の吉方位で、2026 年は午未天中殺の年天中殺", () => {
    expect(text).toContain("2026年に北西へ移る計画");
    const nw = getYearDirections(2026, 6).verdicts.find(
      (v) => v.direction === "NW",
    );
    expect(nw?.kind).toBe("good");
    expect(
      tenchusatsuForCivilDate(1985, 10, 12).tenchusatsu.voidBranches,
    ).toContain(getYearBranch(2026));
  });
});
