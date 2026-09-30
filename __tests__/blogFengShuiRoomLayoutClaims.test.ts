import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  readFengShui,
  honmeiGua,
  GUA_NAME,
  guaGroup,
  AUSPICIOUS_YOUXING,
  type Sex,
  type YouXing,
} from "@/utils/fengShuiEngine";
import {
  DIRECTION_LABELS,
  directionFromBearing,
  type CompassDirection,
} from "@/utils/directionGeo";

/**
 * 公開記事 feng-shui-where-to-put-things-in-a-room の表と数字をエンジンと
 * 照合する（利用者の依頼、2026-09-30「風水で部屋のなかの位置に関しての
 * ブログも書いて」）。
 *
 * 記事は 1990 年生まれの男性（坎）と女性（艮）の 8 方位を表にし、そこから
 * 「机は生気・寝る向きは天医・コンロは凶の区画」の当て先を書き出している。
 * 散文と表は tsc も lint も守ってくれないので、表を手で書き換えたとき、
 * またはエンジンの表を直したときに、ここが落ちるようにする。
 *
 *   ・表の 8 行 × 2 人は readFengShui の遊星と吉凶に一致する
 *   ・2 人の吉の 4 方位は重ならない（本文の主張）
 *   ・箇条書きの生気・天医・凶の区画はエンジンから出したものと一致する
 *   ・区画は 45 度ずつ、気学の古典は四正 30 度・四隅 60 度（本文の主張）
 */

const md = readFileSync(
  join(__dirname, "../content/blog/feng-shui-where-to-put-things-in-a-room.md"),
  "utf-8",
);

const PEOPLE: { label: string; year: number; sex: Sex; column: number }[] = [
  { label: "男性", year: 1990, sex: "male", column: 1 },
  { label: "女性", year: 1990, sex: "female", column: 2 },
];

const LABEL_TO_DIRECTION = new Map<string, CompassDirection>(
  (Object.entries(DIRECTION_LABELS) as [CompassDirection, string][]).map(
    ([d, label]) => [label, d],
  ),
);

/** 表の行。`| 北 | 伏位（吉） | 五鬼（凶） |` の形。 */
function tableRows(): string[][] {
  return md
    .split("\n")
    .filter((l) => /^\|\s*(北|南|東|西|北東|北西|南東|南西)\s*\|/.test(l))
    .map((l) =>
      l
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
    );
}

function directionOf(sex: Sex, youxing: YouXing): string {
  const d = readFengShui(1990, sex).directions.find(
    (x) => x.youxing === youxing,
  );
  if (!d) throw new Error(`${youxing} が無い`);
  return DIRECTION_LABELS[d.direction];
}

function badOf(sex: Sex): string[] {
  return readFengShui(1990, sex)
    .directions.filter((d) => !d.auspicious)
    .map((d) => DIRECTION_LABELS[d.direction]);
}

describe("本命卦の見出しの数字", () => {
  it("1990 年生まれの男性は坎（東四命）、女性は艮（西四命）", () => {
    expect(GUA_NAME[honmeiGua(1990, "male")]).toBe("坎");
    expect(guaGroup(honmeiGua(1990, "male"))).toBe("東四命");
    expect(GUA_NAME[honmeiGua(1990, "female")]).toBe("艮");
    expect(guaGroup(honmeiGua(1990, "female"))).toBe("西四命");
    expect(md).toContain("男性は坎（東四命）、女性は艮（西四命）");
  });
});

describe("8 方位の表", () => {
  const rows = tableRows();

  it("8 行ある（この検査自体が空回りしていない）", () => {
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r[0])).size).toBe(8);
  });

  it.each(PEOPLE)("$label（1990 年）の列はエンジンと一致する", (p) => {
    const reading = readFengShui(p.year, p.sex);
    for (const row of rows) {
      const dir = LABEL_TO_DIRECTION.get(row[0]);
      expect(dir, row[0]).toBeDefined();
      const d = reading.directions.find((x) => x.direction === dir)!;
      expect(row[p.column]).toBe(
        `${d.youxing}（${d.auspicious ? "吉" : "凶"}）`,
      );
    }
  });

  it("2 人の吉の 4 方位は 1 つも重ならない", () => {
    const good = (sex: Sex) =>
      new Set(
        readFengShui(1990, sex)
          .directions.filter((d) => AUSPICIOUS_YOUXING.includes(d.youxing))
          .map((d) => d.direction),
      );
    const m = good("male");
    const f = good("female");
    expect(m.size).toBe(4);
    expect(f.size).toBe(4);
    expect([...m].filter((d) => f.has(d))).toEqual([]);
    expect(md).toContain("2 人の吉の 4 方位は 1 つも重なりません");
  });
});

describe("当て先の箇条書き", () => {
  it("机の生気・寝る向きの天医・コンロの凶の区画", () => {
    expect(md).toContain(
      `机で顔を向ける方位（生気）: 男性は${directionOf("male", "生気")}、女性は${directionOf("female", "生気")}`,
    );
    expect(md).toContain(
      `寝るときの頭の向き（天医）: 男性は${directionOf("male", "天医")}、女性は${directionOf("female", "天医")}`,
    );
    expect(md).toContain(
      `コンロを置く区画（凶）: 男性は${badOf("male").join("・")}、女性は${badOf("female").join("・")}`,
    );
  });
});

describe("区画の切り方", () => {
  it("八宅は 45 度ずつ（北と北東の境目は 22.5 度）", () => {
    expect(directionFromBearing(22.4, "physical")).toBe("N");
    expect(directionFromBearing(22.6, "physical")).toBe("NE");
    expect(md).toContain("区画は 45 度ずつに切ります");
  });

  it("気学の古典は四正 30 度・四隅 60 度（北は 345〜15 度、北東は 15〜75 度）", () => {
    expect(directionFromBearing(14.9, "traditional")).toBe("N");
    expect(directionFromBearing(15.1, "traditional")).toBe("NE");
    expect(directionFromBearing(74.9, "traditional")).toBe("NE");
    expect(directionFromBearing(75.1, "traditional")).toBe("E");
    expect(md).toContain("四正 30 度・四隅 60 度");
  });
});
