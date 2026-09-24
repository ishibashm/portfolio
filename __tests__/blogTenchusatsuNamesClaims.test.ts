import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TENCHUSATSU_GROUPS } from "@/utils/tenchusatsu";
import { TENCHUSATSU_MODES } from "@/utils/tenchusatsuPolicy";

/**
 * 公開記事 tenchusatsu-names-and-schools の「天中殺と大殺界を並べると」の
 * 表と、「同じ年に来るのか」の数字を照合する。
 *
 * Search Console（2026-09-24、過去 3 か月）で、この記事は「大殺界と
 * 天中殺の違い」系の検索語で 10 位前後に出ていた。答えの中心を 2 つを
 * 並べた表に置いたので、表のうち**このサイトのコードで確かめられる行**を
 * ここで固定する。大殺界の側（運命星・3 年）はサイトが計算していないので、
 * 記事の注記どおり「計算していない」ことのほうを固定する。
 */

const md = readFileSync(
  join(__dirname, "../content/blog/tenchusatsu-names-and-schools.md"),
  "utf-8",
);

/** 表の行（先頭の列が name の行）の残りの列。空白は問わない。 */
function row(name: string): string[] {
  const m = new RegExp(`^\\| ${name}\\s*\\|(.+)\\|$`, "m").exec(md);
  expect(m, name).not.toBeNull();
  return m![1].split("|").map((c) => c.trim());
}

describe("天中殺と大殺界を並べた表", () => {
  it("天中殺は 6 通り（コードの空亡の組の数）", () => {
    expect(TENCHUSATSU_GROUPS).toHaveLength(6);
    const pairs = new Set(TENCHUSATSU_GROUPS.map((g) => g.name));
    expect(pairs.size).toBe(6);
    expect(row("何通りに分かれるか")[0]).toBe("6 通り（空亡の 2 支の組）");
  });

  it("空亡の 6 組で、十二支の 12 個をちょうど 1 回ずつ使う", () => {
    const branches = TENCHUSATSU_GROUPS.flatMap((g) => g.voidBranches);
    expect(branches).toHaveLength(12);
    expect(new Set(branches).size).toBe(12);
  });

  it("長さと割合（天中殺 2 年＝6 分の 1、大殺界 3 年＝4 分の 1）", () => {
    const [tc, dsk] = row("1 回の長さ");
    expect(tc).toBe("**2 年**");
    expect(dsk).toMatch(/^\*\*3 年\*\*/);
    expect(2 / 12).toBeCloseTo(1 / 6);
    expect(3 / 12).toBeCloseTo(1 / 4);
    expect(row("12 年のうちの割合")).toEqual(["6 分の 1", "4 分の 1"]);
  });

  it("このサイトが計算しているのは天中殺だけ（大殺界の設定は無い）", () => {
    expect(TENCHUSATSU_MODES.map((m) => m.id)).not.toContain("daisakkai");
    const [tc, dsk] = row("Cloud Palette");
    expect(tc).toMatch(/実装している/);
    expect(dsk).toBe("**実装していない**");
  });
});

describe("同じ年に来るのか", () => {
  it("両方を避けると、12 年のうち 3〜5 年が塞がる（2 年と 3 年の重なり方で決まる）", () => {
    const tc = 2;
    const dsk = 3;
    // まったく重ならないとき最大、短いほうが長いほうに収まるとき最小
    expect(tc + dsk).toBe(5);
    expect(Math.max(tc, dsk)).toBe(3);
    expect(md).toContain("12 年のうち 5 年");
    expect(md).toContain("12 年のうち 3〜5 年");
  });
});
