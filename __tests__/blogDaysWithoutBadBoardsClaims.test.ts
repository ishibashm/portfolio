import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_DIRECTIONS,
  DIRECTION_LABELS,
  findAuspiciousDaysAllDirections,
  gradeVerdict,
  isAuspicious,
  judgeDayAllDirections,
  type DayTier,
  type DayVerdict,
} from "@/utils/auspiciousDays";
import { TIER_LABELS } from "@/utils/dayTier";
import { isFatalNoise } from "@/utils/noiseSeverity";
import { STATUS_INFO } from "@/lib/kigakuContent";

/**
 * 記事「三盤吉の日でなくても、凶の無い日なら引越しに使えるのか」の数字を
 * エンジンと照合する。
 *
 * この記事は /calendar の日取りの表が凶の無い日（S・A・B・C）まで出すように
 * なった（scope "noBad"）ことを受けて、**判定を 1 年ぶん回した結果をその
 * まま表に書いている。**段階の定義（gradeVerdict）や拾う範囲を直すと記事
 * だけが古くなる。散文は tsc も lint も守らないので、ここで突き合わせる
 * （blogWhichDayClaims と同じ考え方。前提もそちらの記事と揃えた）。
 *
 * ## 記事の前提（本文の表に書いてある）
 *
 *   本命星         七赤金星
 *   出発地の経度   東経 135.7 度
 *   期間           2026-10-01〜2027-09-30（365 日）
 *   天中殺         含めない（空で計算）
 */

const md = readFileSync(
  join(__dirname, "../content/blog/days-without-bad-boards.md"),
  "utf-8",
);

const P = {
  honmeiStar: 7 as const,
  voidZodiacs: [] as string[],
  lon: 135.7,
  tenchusatsuMode: "strict" as const,
};
const FROM = new Date("2026-10-01T12:00:00+09:00");
const TO = new Date("2027-09-30T12:00:00+09:00");

/** /calendar と同じ呼び方（scope "noBad"）。並びもそのまま使う。 */
const summaries = findAuspiciousDaysAllDirections(FROM, TO, P, "noBad");

/** 期間の全日 × 8 方位の判定。X・D を含む数と、年盤の札を見るため。 */
const grid: { date: string; byDir: Record<string, DayVerdict> }[] = [];
for (let t = FROM.getTime(); t <= TO.getTime(); t += 86400000) {
  const all = judgeDayAllDirections(new Date(t), P);
  grid.push({ date: all.N.date, byDir: all });
}

const labelOf = (dir: string) => DIRECTION_LABELS[dir];
const summaryOf = (label: string) =>
  summaries.find((s) => s.directionLabel === label)!;
const tierCount = (label: string, t: DayTier) =>
  summaryOf(label).days.filter((d) => d.tier === t).length;

/** 「2026-11-08」を記事の書き方「2026 年 11 月 8 日」にする。 */
const jpDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
};

/** 表の行（先頭のセルが label のもの）をセルに割る。強調は落とす。 */
function rowsOf(label: string): string[][] {
  return [
    ...md.matchAll(new RegExp(`^\\|\\s*${label}\\s*\\|(.*)\\|\\s*$`, "gm")),
  ].map((m) => m[1].split("|").map((c) => c.replace(/\*/g, "").trim()));
}

/** 段階ごとの日数の表（数字だけの 5 列の行）。 */
function countRow(label: string): number[] | null {
  const row = rowsOf(label).find(
    (cells) => cells.length === 5 && cells.every((c) => /^\d+$/.test(c)),
  );
  return row ? row.map(Number) : null;
}

/** 三盤吉 0 日の方位の表（期間のセルで始まる 3 列の行）。 */
function spanRow(label: string): string[] | null {
  return (
    rowsOf(label).find((cells) => cells.length === 3 && /〜/.test(cells[0])) ??
    null
  );
}

describe("記事: 前提", () => {
  it("本文の前提が計算の前提と同じ", () => {
    expect(md).toContain("| 移動する人   | 本命星が七赤金星");
    expect(md).toContain("東経 135.7 度あたり");
    expect(md).toContain("2026 年 10 月 1 日〜2027 年 9 月 30 日（365 日）");
    expect(md).toContain("含めない（生年月日が要るため）");
    expect(grid).toHaveLength(365);
    expect(summaries.every((s) => s.scannedDays === 365)).toBe(true);
  });
});

describe("記事: 段階の決まり方の表", () => {
  it("呼び名は画面の段階名（TIER_LABELS）と同じ", () => {
    for (const t of ["X", "D", "S", "A", "B", "C"] as DayTier[]) {
      const row = rowsOf(t).find((cells) => cells.length === 2);
      expect(row, `${t} の行`).toBeDefined();
      expect(row![0], t).toBe(TIER_LABELS[t]);
    }
  });

  it("凶が 1 枚でも入れば、残りが吉でも A・B・C にならない", () => {
    expect(md).toContain(
      "**凶が 1 枚でも入れば、残りの 2 枚が吉でも A・B・C にはなりません**",
    );
    const v = (y: string, m: string, d: string, f = "OPTIMAL") => ({
      yearLayer: y,
      monthLayer: m,
      dayLayer: d,
      finalStatus: f,
      isTripleAuspicious: false,
    });
    expect(gradeVerdict(v("OPTIMAL", "OPTIMAL", "NOISE_GOU"))).toBe("X");
    expect(gradeVerdict(v("OPTIMAL", "OPTIMAL", "NOISE_VOID"))).toBe("D");
    expect(gradeVerdict(v("SAFE", "SAFE", "SAFE", "SAFE"))).toBe("C");
  });

  it("土用殺の当たる日は X に入る（期間内に実在する）", () => {
    expect(md).toContain(
      "土用殺の当たる方位も、最終判定では五黄殺と同じ扱いになり X に入ります",
    );
    const doyou = grid.flatMap((g) =>
      Object.values(g.byDir).filter((v) => v.isDoyouSatsu),
    );
    expect(doyou.length).toBeGreaterThan(0);
    for (const v of doyou) {
      expect(v.finalStatus).toBe("NOISE_GOU");
      expect(gradeVerdict(v)).toBe("X");
    }
  });

  it("平の説明はサイトの札の説明をそのまま引いている", () => {
    expect(STATUS_INFO.SAFE.label).toBe("平");
    expect(md).toContain(
      `平を「${STATUS_INFO.SAFE.note.replace(/です。$/, "")}」`,
    );
  });
});

describe("記事: 1 年の段階ごとの日数の表", () => {
  it("見張りが空回りしていない（8 方位 × 5 列を読めている）", () => {
    for (const dir of ALL_DIRECTIONS) {
      expect(countRow(labelOf(dir)), labelOf(dir)).not.toBeNull();
    }
  });

  it("行の並びが /calendar と同じ（三盤吉の多い順、同じなら凶の無い日の多い順）", () => {
    const order = [
      ...md.matchAll(/^\|\s*(\S+)\s*\|\s*\d+\s*\|\s*\d+\s*\|/gm),
    ].map((m) => m[1]);
    expect(order).toEqual(summaries.map((s) => s.directionLabel));
  });

  it.each(ALL_DIRECTIONS.map((d) => DIRECTION_LABELS[d]))(
    "%s の S・A・B・C と合計がエンジンと一致する",
    (label) => {
      const [s, a, b, c, total] = countRow(label)!;
      const sum = summaryOf(label);
      expect(s, "S").toBe(tierCount(label, "S"));
      expect(s, "S は三盤吉の数").toBe(sum.tripleAuspiciousDays);
      expect(a, "A").toBe(tierCount(label, "A"));
      expect(b, "B").toBe(tierCount(label, "B"));
      expect(c, "C").toBe(tierCount(label, "C"));
      expect(total, "凶の無い日").toBe(sum.noBadDays);
      expect(s + a + b + c, "合計は S〜C の和").toBe(total);
    },
  );

  it("表に無い日はすべて X で、D は 1 日も無い", () => {
    expect(md).toContain(
      "表に無い日は、すべて X でした。この前提では D の日は 1 日もありません。",
    );
    for (const g of grid) {
      for (const dir of ALL_DIRECTIONS) {
        const t = gradeVerdict(g.byDir[dir]);
        expect(t, `${g.date} ${dir}`).not.toBe("D");
      }
    }
  });

  it("三盤吉で最多は北西 38 日、凶の無い日で最多は南東 112 日", () => {
    expect(md).toContain(
      "三盤吉なら北西（38 日）、凶の無い日なら南東（112 日）",
    );
    const byTriple = [...summaries].sort(
      (a, b) => b.tripleAuspiciousDays - a.tripleAuspiciousDays,
    )[0];
    const byNoBad = [...summaries].sort(
      (a, b) => (b.noBadDays ?? 0) - (a.noBadDays ?? 0),
    )[0];
    expect([byTriple.directionLabel, byTriple.tripleAuspiciousDays]).toEqual([
      "北西",
      38,
    ]);
    expect([byNoBad.directionLabel, byNoBad.noBadDays]).toEqual(["南東", 112]);
  });

  it("北・北東・南は年盤が 1 年ずっと五大凶殺で、365 日すべて X", () => {
    expect(md).toContain(
      "北・北東・南は、年盤がこの 1 年ずっと五大凶殺に当たっていて、365 日すべてが X でした",
    );
    for (const dir of ["N", "NE", "S"]) {
      for (const g of grid) {
        expect(isFatalNoise(g.byDir[dir].yearLayer), `${g.date} ${dir}`).toBe(
          true,
        );
        expect(gradeVerdict(g.byDir[dir])).toBe("X");
      }
    }
  });
});

describe("記事: 三盤吉 0 日なのに凶の無い日がある方位", () => {
  const ZERO = ["東", "西", "南西"];

  it("三盤吉 0 日で凶の無い日がある方位は、東・西・南西のちょうど 3 つ", () => {
    expect(md).toContain("東・西・南西の 3 つです");
    expect(md).toContain("（東 30 日・西 34 日・南西 35 日）");
    const found = summaries
      .filter((s) => s.tripleAuspiciousDays === 0 && (s.noBadDays ?? 0) > 0)
      .map((s) => s.directionLabel)
      .sort();
    expect(found).toEqual([...ZERO].sort());
    expect(summaryOf("東").noBadDays).toBe(30);
    expect(summaryOf("西").noBadDays).toBe(34);
    expect(summaryOf("南西").noBadDays).toBe(35);
  });

  it.each(ZERO)("%s の期間・年盤・内訳がエンジンと一致する", (label) => {
    const row = spanRow(label);
    expect(row, `${label} の行`).not.toBeNull();
    const days = summaryOf(label).days;
    const first = days[0].date;
    const last = days[days.length - 1].date;
    /* 同じ年なら終わりの年を省く書き方（「2027 年 4 月 7 日〜9 月 30 日」） */
    const lastText =
      first.slice(0, 4) === last.slice(0, 4)
        ? jpDate(last).replace(/^\d{4} 年 /, "")
        : jpDate(last);
    expect(row![0], "期間").toBe(`${jpDate(first)}〜${lastText}`);

    const years = new Set(
      days.map((d) =>
        isAuspicious(d.yearLayer) ? "吉" : d.yearLayer === "SAFE" ? "平" : "?",
      ),
    );
    expect([...years], "その間の年盤").toEqual([row![1]]);

    const parts = (["A", "B", "C"] as DayTier[])
      .map((t) => [t, tierCount(label, t)] as const)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${t} ${n} 日`)
      .join("・");
    expect(row![2], "内訳").toBe(parts);
  });

  it("東は年盤が吉の間、月盤が一度も吉にならない", () => {
    expect(md).toContain("この期間、東の月盤は一度も吉になりませんでした");
    const eastYearGood = grid.filter((g) => isAuspicious(g.byDir.E.yearLayer));
    expect(eastYearGood.length).toBeGreaterThan(100);
    for (const g of eastYearGood) {
      expect(isAuspicious(g.byDir.E.monthLayer), g.date).toBe(false);
    }
  });

  it("立春で東は本命殺・西は本命的殺に入り、2 月 2 日が最後（2 月 3 日は X）", () => {
    expect(md).toContain(
      "東は本命殺、西は本命的殺に入り、2 月 2 日が最後の日になりました（2 月 3 日は X）",
    );
    const on = (iso: string) => grid.find((g) => g.date === iso)!.byDir;
    expect(on("2027-02-04").E.yearLayer).toBe("NOISE_HONMEI");
    expect(on("2027-02-04").W.yearLayer).toBe("NOISE_TEKI");
    expect(on("2027-02-03").E.yearLayer).not.toBe("NOISE_HONMEI");
    for (const label of ["東", "西"]) {
      const days = summaryOf(label).days;
      expect(days[days.length - 1].date, label).toBe("2027-02-02");
    }
    expect(gradeVerdict(on("2027-02-03").E)).toBe("X");
    expect(gradeVerdict(on("2027-02-03").W)).toBe("X");
  });

  it("南西は立春まで年盤が本命殺で、凶の無い日は立春の後にしか出ない", () => {
    expect(md).toContain(
      "南西は、立春までは年盤が本命殺で、凶の無い日は立春の後にしか出ません",
    );
    for (const g of grid.filter((x) => x.date < "2027-02-04")) {
      expect(g.byDir.SW.yearLayer, g.date).toBe("NOISE_HONMEI");
    }
    expect(summaryOf("南西").days.every((d) => d.date >= "2027-02-04")).toBe(
      true,
    );
  });

  it("南西の 35 日のうち 28 日が C", () => {
    expect(md).toContain("南西の 35 日のうち 28 日は C（3 枚とも平）です");
    expect(tierCount("南西", "C")).toBe(28);
  });

  it("年盤の期限は 2027 年 2 月 3 日", () => {
    expect(md).toContain(
      "年盤の期限（この例の 2027 年 2 月 3 日にあたるもの）",
    );
    for (const s of summaries) {
      expect(s.window.yearBoardValidUntil).toBe("2027-02-03");
    }
  });
});

describe("記事: 同じ段階でも、吉になっている盤が違う", () => {
  /** その日の吉の盤を「年月日」の字で表す（例: 年と日が吉なら "年日"）。 */
  const goodBoards = (d: DayVerdict) =>
    [
      isAuspicious(d.yearLayer) ? "年" : "",
      isAuspicious(d.monthLayer) ? "月" : "",
      isAuspicious(d.dayLayer) ? "日" : "",
    ].join("");
  const breakdown = (label: string, t: DayTier) => {
    const out: Record<string, number> = {};
    for (const d of summaryOf(label).days.filter((x) => x.tier === t)) {
      const k = goodBoards(d);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  it("東の A 12 日は年盤と日盤、西の A 11 日は月盤と日盤", () => {
    expect(md).toContain(
      "東の A 12 日は年盤と日盤が吉、西の A 11 日は月盤と日盤が吉",
    );
    expect(breakdown("東", "A")).toEqual({ 年日: 12 });
    expect(breakdown("西", "A")).toEqual({ 月日: 11 });
  });

  it("南東の B 32 日は、年盤だけ 22 日・日盤だけ 10 日", () => {
    expect(md).toContain(
      "南東の B 32 日のうち、年盤だけが吉の日が 22 日、日盤だけが吉の日が 10 日",
    );
    expect(breakdown("南東", "B")).toEqual({ 年: 22, 日: 10 });
  });
});

describe("記事: /calendar の表の説明が画面と合っている", () => {
  const ui = readFileSync(
    join(__dirname, "../src/components/relocation/AuspiciousDayFinder.tsx"),
    "utf-8",
  );

  it("画面が凶の無い日まで拾って呼んでいる", () => {
    expect(ui).toContain('scope: "noBad"');
  });

  it.each([
    "凶なし（吉2盤・吉1盤・平を含む）",
    "三盤吉（S）だけ",
    "天中殺の日を隠す",
    "天中殺で不可",
  ])("記事に書いた画面の文言「%s」が画面にある", (text) => {
    expect(md).toContain(text);
    expect(ui).toContain(text);
  });

  it("段階の札の書き方は TIER_LABELS と同じ", () => {
    const tags = (["S", "A", "B", "C"] as DayTier[])
      .map((t) => `${t} ${TIER_LABELS[t]}`)
      .join("・");
    expect(md).toContain(`段階の札（${tags}）`);
  });
});
