import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  judgeDayAllDirections,
  gradeVerdict,
  type DayVerdict,
} from "@/utils/auspiciousDays";
import { statusInfo } from "@/lib/kigakuContent";

/**
 * 記事「引き渡しは選べない。年盤が1年塞ぐとき、日取りをどう考えるか」の
 * 数字をエンジンと照合する。
 *
 * ## なぜ要るか
 *
 * **この記事は照合されていなかった。**2026-09-21 の監査で数え直したら、
 * 9 星 × 6 期間の表（54 個）が**「三盤吉」の条件を締める前**の基準で
 * 書かれていた。`auspiciousDays` のコメントにあるとおり、旧条件は
 * 「最終が吉」＋「どの盤にも凶が無い」だけで、**3 枚のうち 1 枚しか
 * 吉でない日まで三盤吉と数えていた。**
 *
 * 旧条件で計算すると記事の 54 個は 1 個違わず一致し、いまの条件では
 * ほとんどが 0 になる。つまり記事だけが古い基準のまま置き去りに
 * なっていた。読んだ人が「2026年11月なら 13 日ある」と思って道具を
 * 開くと 0 日、という食い違い。
 *
 * 直すときに、記事が数えている量を**道具が画面に出している段階**
 * （S・A・B）に揃えた。読者が道具を開いて同じ数を数えられることが、
 * 記事の数字が正しいことより大事なので。
 *
 * ## 記事の前提（本文の表に書いてある）
 *
 *   出発地の経度   東経 135.7 度
 *   方位           東
 *   天中殺の扱い   厳格（年・月・日）
 *
 * 天中殺の支は生年月日が要るので、記事は本命星だけの効果として
 * 空で計算している（本文にもそう書いてある）。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/year-board-blocks-a-whole-year.md"),
  "utf-8",
);

const LON = 135.7;
const STAR_NAMES = [
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

/** 記事の表の列（見出しと、数える期間）。 */
const PERIODS: { header: string; from: string; to: string }[] = [
  { header: "2026年11月", from: "2026-11-01", to: "2026-11-30" },
  { header: "2026年12月", from: "2026-12-01", to: "2026-12-31" },
  { header: "2027年1月", from: "2027-01-01", to: "2027-01-31" },
  { header: "2027年2/1-3", from: "2027-02-01", to: "2027-02-03" },
  { header: "2027年9月", from: "2027-09-01", to: "2027-09-30" },
  { header: "2028年3月", from: "2028-03-01", to: "2028-03-31" },
];

function eastOn(star: number, iso: string): DayVerdict {
  return judgeDayAllDirections(new Date(`${iso}T12:00:00+09:00`), {
    honmeiStar: star as never,
    voidZodiacs: [],
    lon: LON,
    tenchusatsuMode: "strict",
  }).E;
}

/** 記事が数えている「使える日」＝凶が無く、どれかの盤が吉（S・A・B）。 */
function isUsable(v: DayVerdict): boolean {
  if (v.blockedByTenchusatsu) return false;
  const tier = gradeVerdict(v);
  return tier === "S" || tier === "A" || tier === "B";
}

function countUsable(star: number, from: string, to: string): number {
  let n = 0;
  for (
    let t = Date.parse(`${from}T12:00:00+09:00`);
    t <= Date.parse(`${to}T12:00:00+09:00`);
    t += 86400000
  ) {
    if (isUsable(eastOn(star, new Date(t).toISOString().slice(0, 10)))) n++;
  }
  return n;
}

/** 「13日」「0」どちらの書き方でも数として読む。強調の ** は外す。 */
function cellToNumber(cell: string): number {
  const m = cell
    .replace(/\*/g, "")
    .trim()
    .match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
}

describe("記事: 本命星ごとの 9 × 6 の表", () => {
  /** 表の行（本命星 → 6 つのセル）を本文から読む。 */
  const rows = new Map<string, string[]>();
  for (const name of STAR_NAMES) {
    const m = md.match(new RegExp(`\\|\\s*${name}\\s*\\|([^\\n]*)\\|`));
    if (m) {
      rows.set(
        name,
        m[1].split("|").map((c) => c.trim()),
      );
    }
  }

  it("見張りが空回りしていない（9 行 × 6 列を読めている）", () => {
    expect(rows.size, "本命星の行を読めていない").toBe(9);
    for (const [name, cells] of rows) {
      expect(cells.length, `${name} の列数`).toBe(6);
    }
    /* 列の見出しも本文にある（期間を取り違えていない） */
    for (const p of PERIODS) expect(md, p.header).toContain(p.header);
  });

  it.each(STAR_NAMES)("%s の 6 つの数字がエンジンと一致する", (name) => {
    const cells = rows.get(name);
    expect(cells, `${name} の行が読めない`).toBeTruthy();
    PERIODS.forEach((p, i) => {
      expect(
        cellToNumber(cells![i]),
        `${name} / ${p.header}（記事の表とエンジンが食い違う）`,
      ).toBe(countUsable(STAR_NAMES.indexOf(name) + 1, p.from, p.to));
    });
  });
});

describe("記事: 年盤が塞いでいる期間", () => {
  it("2027 の年盤の期間は、東に使える日が 1 日も無い", () => {
    expect(md).toContain("2027年2月4日〜2028年2月3日");
    expect(countUsable(7, "2027-02-04", "2028-02-03")).toBe(0);
  });

  it("その 365 日はすべて大凶（記事の「365 日すべて」）", () => {
    expect(md).toContain("365 日すべて");
    let x = 0;
    let total = 0;
    for (
      let t = Date.parse("2027-02-04T12:00:00+09:00");
      t <= Date.parse("2028-02-03T12:00:00+09:00");
      t += 86400000
    ) {
      const v = eastOn(7, new Date(t).toISOString().slice(0, 10));
      total++;
      if (gradeVerdict(v) === "X") x++;
    }
    expect(total).toBe(365);
    expect(x).toBe(365);
  });

  it("東の年盤の 5 年（2026〜2030）が表と一致する", () => {
    const want: [number, string][] = [
      [2026, "大吉"],
      [2027, "本命殺"],
      [2028, "平"],
      [2029, "五黄殺"],
      [2030, "平"],
    ];
    for (const [year, word] of want) {
      const layer = eastOn(7, `${year}-06-01`).yearLayer;
      const got =
        layer === "OPTIMAL" || layer === "OPTIMAL_REGULAR"
          ? "大吉"
          : layer === "SAFE"
            ? "平"
            : statusInfo(layer).label;
      expect(got, `${year} 年の東の年盤`).toBe(word);
      /* 記事の表にもその語が出ている */
      expect(md, `${year} の行`).toMatch(
        new RegExp(`\\|\\s*\\*{0,2}${year}\\*{0,2}\\s*\\|\\s*\\*{0,2}${word}`),
      );
    }
  });
});

describe("記事: 立春をまたぐ 3 日と、その後の窓", () => {
  it("2027-02-02 は凶が無く吉が 2 盤（記事の A）", () => {
    const v = eastOn(7, "2027-02-02");
    expect(gradeVerdict(v)).toBe("A");
    expect(md).toContain("A（凶なし・吉が2盤）");
  });

  it("2027-02-03 と 2027-02-04 は大凶", () => {
    expect(gradeVerdict(eastOn(7, "2027-02-03"))).toBe("X");
    expect(gradeVerdict(eastOn(7, "2027-02-04"))).toBe("X");
    /* 2/3 が落ちる理由（日盤が本命的殺）まで本文に書いてある */
    expect(eastOn(7, "2027-02-03").dayLayer).toBe("NOISE_TEKI");
    expect(md).toContain("日盤が本命的殺");
  });

  it("2028年3月は 15 日、うち吉が 2 盤は 5 日", () => {
    expect(md).toContain("15 日（うち吉が2盤の日が 5 日）");
    let usable = 0;
    let a = 0;
    for (
      let t = Date.parse("2028-03-01T12:00:00+09:00");
      t <= Date.parse("2028-03-31T12:00:00+09:00");
      t += 86400000
    ) {
      const v = eastOn(7, new Date(t).toISOString().slice(0, 10));
      if (!isUsable(v)) continue;
      usable++;
      if (gradeVerdict(v) === "A") a++;
    }
    expect(usable).toBe(15);
    expect(a).toBe(5);
  });
});

describe("記事: 三盤吉がどれだけ稀か", () => {
  it("2026〜2031 の 6 年で 6 日、すべて 2026 年 6〜7 月", () => {
    expect(md).toContain("**6 日**");
    const hits: string[] = [];
    for (
      let t = Date.parse("2026-01-01T12:00:00+09:00");
      t <= Date.parse("2031-12-31T12:00:00+09:00");
      t += 86400000
    ) {
      const v = eastOn(7, new Date(t).toISOString().slice(0, 10));
      if (!v.blockedByTenchusatsu && gradeVerdict(v) === "S") hits.push(v.date);
    }
    expect(hits).toHaveLength(6);
    for (const d of hits) expect(d.slice(0, 7), d).toMatch(/^2026-0[67]$/);
  });
});

describe("記事: 家族で動くときの重なり", () => {
  /** 2 つの本命星の両方で使える日。 */
  function common(a: number, b: number, from: string, to: string): number {
    let n = 0;
    for (
      let t = Date.parse(`${from}T12:00:00+09:00`);
      t <= Date.parse(`${to}T12:00:00+09:00`);
      t += 86400000
    ) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (isUsable(eastOn(a, iso)) && isUsable(eastOn(b, iso))) n++;
    }
    return n;
  }

  it("七赤金星と二黒土星の共通日（本文の 3 つの数）", () => {
    expect(common(7, 2, "2027-01-01", "2027-01-31")).toBe(6);
    expect(common(7, 2, "2026-11-01", "2026-11-30")).toBe(11);
    expect(common(7, 2, "2028-03-01", "2028-03-31")).toBe(12);
    expect(md).toContain("両方に開いている日は 6 日");
    expect(md).toContain("共通が 11 日");
    expect(md).toContain("共通が 12 日");
  });
});
