import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Solar } from "lunar-javascript";
import { getClassicalYearStar, getYearStar } from "@/utils/ephemerisEngine";
import { STAR_NAMES } from "@/lib/kigakuContent";

/**
 * 公開記事 does-bad-direction-last-60-years の数字をエンジンと照合する。
 *
 * この記事は「凶方位の影響は 60 年続く」という説を、**サイトの年盤で
 * 実際に並べて**検算している。中宮の並び、60 年後のずれ、干支の一巡、
 * 木星黄経モデルの重複 — どれもエンジンを回した結果をそのまま表に
 * したもので、暦の出し方を直すと記事だけが古くなる。
 *
 * 本文の表を**読んで**突き合わせる。記事の数字をこちらに写して固定
 * すると、両方を同時に間違えたときに気付けない
 * （blogTenshaClaims・blogDoyouClaims と同じ考え方）。
 */

const SLUG = "does-bad-direction-last-60-years";
const md = readFileSync(join(__dirname, `../content/blog/${SLUG}.md`), "utf-8");

/** その年の年盤を引く代表時刻。立春を過ぎた日本時間の正午。 */
function midYear(year: number): Date {
  return new Date(Date.UTC(year, 5, 1, 3));
}

/** 「七赤金星」→「七」。記事の表のセルと同じ書き方。 */
function kanji(star: number): string {
  return STAR_NAMES[star].charAt(0);
}

/**
 * 記事の表の、先頭のセルが `head` で列数が `columns` の行。
 *
 * 列数まで見るのは、この記事に「年」で始まる行が 2 本あるため
 * （中宮の表の見出しと、干支の表の見出し）。
 */
function rowFor(head: string, columns: number): string[] {
  const hit = md
    .split("\n")
    .filter((l) => l.startsWith(`| ${head} `))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    )
    .filter((r) => r.length === columns);
  expect(hit, `「${head}」の ${columns} 列の行が 1 本でない`).toHaveLength(1);
  return hit[0];
}

/**
 * その年の干支（十干＋十二支）。
 *
 * 八字の年柱から組む。年柱は立春の**瞬間**で切り替わるので、6 月 1 日を
 * 代表に取れば年の内側に入る。`getYearInGanZhiExact` を直に呼ばないのは、
 * lunar-javascript の型に写していないため（写すのは呼ぶものだけ、という
 * `src/types/lunar-javascript.d.ts` の方針）。
 */
function yearGanZhi(year: number): string {
  const e = Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar().getEightChar();
  return e.getYearGan() + e.getYearZhi();
}

describe("記事: 凶方位の影響は60年続くのか", () => {
  it("2020〜2029 の中宮の表がエンジンと一致する", () => {
    const years = rowFor("年", 11).slice(1).map(Number);
    expect(years).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029,
    ]);

    const written = rowFor("中宮", 11)
      .slice(1)
      .map((c) => c.replace(/\*/g, ""));
    expect(written).toEqual(
      years.map((y) => kanji(getClassicalYearStar(midYear(y)))),
    );
  });

  it("年盤は 9 年で一巡する（記事の芯）", () => {
    for (let y = 1950; y <= 2100; y++) {
      expect(getClassicalYearStar(midYear(y + 9)), `${y} と ${y + 9}`).toBe(
        getClassicalYearStar(midYear(y)),
      );
    }
  });

  it("60 年後は元に戻らず、ずれは記事が書いている 6 つ", () => {
    /* 「60年後の年盤は、元の配置から6つずれた場所にいます」。
       中宮は 1 年ごとに 1 つ戻る（9 → 8 → …）ので、60 年で
       戻る数は 60 mod 9 ＝ 6。実際の星で確かめる。 */
    const m = md.match(/60 ÷ 9 = (\d+) あまり (\d+)/);
    expect(m, "「60 ÷ 9 = …」の式が見つからない").not.toBeNull();
    expect([Number(m![1]), Number(m![2])]).toEqual([
      Math.floor(60 / 9),
      60 % 9,
    ]);

    const shift = md.match(/元の配置から(\d+)つずれた/);
    expect(shift, "ずれの数を書いた文が見つからない").not.toBeNull();

    for (let y = 1950; y <= 2050; y++) {
      const a = getClassicalYearStar(midYear(y));
      const b = getClassicalYearStar(midYear(y + 60));
      expect(a, `${y} と ${y + 60}`).not.toBe(b);
      /* 中宮は 1 年ごとに 1 つ減る（9 の剰余）。60 年ぶんの減りは
         記事が書いている数と同じ。 */
      expect((a - b + 9) % 9, `${y} のずれ`).toBe(Number(shift![1]) % 9);
    }
  });

  it("2000〜2020 と 2060〜2080 の並びがエンジンと一致する", () => {
    for (const [head, from] of [
      ["2000〜2020年", 2000],
      ["2060〜2080年", 2060],
    ] as const) {
      const [, head2, seq] = rowFor(head, 3);
      expect(head2, `${head} の開始年の中宮`).toBe(
        kanji(getClassicalYearStar(midYear(from))),
      );
      const actual = Array.from({ length: 21 }, (_, i) =>
        String(getClassicalYearStar(midYear(from + i))),
      ).join(",");
      expect(seq, `${head} の並び`).toBe(actual);
    }
  });

  it("干支の表（2024・2033・2084）がエンジンと一致する", () => {
    for (const [head, year] of [
      ["2024", 2024],
      ["2033（+9年）", 2033],
      ["2084（+60年）", 2084],
    ] as const) {
      const [, ganzhi] = rowFor(head, 3);
      expect(ganzhi, `${year} の干支`).toBe(yearGanZhi(year));
    }
    /* 「一致する / 一致しない」も実際にそうであること。 */
    expect(yearGanZhi(2033)).not.toBe(yearGanZhi(2024));
    expect(yearGanZhi(2084)).toBe(yearGanZhi(2024));
  });

  it("九星と干支が両方そろうのは 180 年後（2024 → 2204）", () => {
    expect(md).toContain("180年後");
    const star = getClassicalYearStar(midYear(2024));
    const gz = yearGanZhi(2024);

    let next = 0;
    for (let y = 2025; y <= 2400; y++) {
      if (getClassicalYearStar(midYear(y)) === star && yearGanZhi(y) === gz) {
        next = y;
        break;
      }
    }
    expect(next, "2024 と同じ 星 × 干支 の次の年").toBe(2204);
    expect(next - 2024).toBe(180);
    expect(md).toContain(`${next}年`);
  });

  it("物理モデルの並びがエンジンと一致し、同じ星が 2 年続く", () => {
    const m = md.match(/2020年から: ([0-9,]+)/);
    expect(m, "物理モデルの並びが見つからない").not.toBeNull();
    const written = m![1].split(",");

    const actual = written.map((_, i) =>
      String(getYearStar(midYear(2020 + i))),
    );
    expect(written).toEqual(actual);

    /* 「同じ星が2年続く箇所があります」 */
    const repeats = actual.filter((v, i) => i > 0 && v === actual[i - 1]);
    expect(repeats.length, "重複が 1 つも無い").toBeGreaterThan(0);
  });
});
