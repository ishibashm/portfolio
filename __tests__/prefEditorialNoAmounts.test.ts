import { describe, expect, it } from "vitest";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { prefNameByCode } from "@/lib/prefContent";

/**
 * 都道府県ページの文章に、毎晩動く数字を書かせないための検査。
 *
 * 頁の表は areaDirections.json（毎晩の巡回から再生成）を集計して
 * 今夜の家賃を出す。一方で文章は手書きなので、額を書くと**書いた日の
 * 値のまま固定される**。実際に 47 県のうち 33 県の文章に額が入っており、
 * そのうち 19 県ぶんは既に表の数字と食い違っていた（2026-08-31 に実測。
 * 例: 富山県の文章「4.8 万〜5.7 万円」に対して実データは 4.5 万〜6.8 万）。
 *
 * 文章が担当するのは地理の構造（どの方位に何があるか、相場の傾きの
 * 向き）だけ。額そのものは集計が出す。prefEditorial.ts と
 * prefContent.ts の冒頭に書いてある決め事を、検査として固定する。
 */

/** 「4.8 万円」「1 万円」「25 万」「5 万円台」など、金額に見える書き方。 */
const AMOUNT =
  /[0-9０-９][0-9０-９.．]*\s*万?\s*円|[0-9０-９][0-9０-９.．]*\s*万(?![一-龥])/;

describe("PREF_EDITORIAL に金額を書かない", () => {
  it("検出そのものが空回りしていない（見本を確かに拾う）", () => {
    /* 検査の側が壊れていると、全部素通りして緑になる。実際に
       #791 の突き合わせ検査で、区切り記号の取りこぼしにより
       0 件マッチのまま通りかけた。見本で先に確かめる */
    expect(AMOUNT.test("津（4.8 万円）が四日市より安い")).toBe(true);
    expect(AMOUNT.test("1 万円以上安い受け皿が残ります")).toBe(true);
    expect(AMOUNT.test("軽井沢（北東、中央値 25 万）は別世界")).toBe(true);
    expect(AMOUNT.test("掲載 28 市町村と広く")).toBe(false);
    expect(AMOUNT.test("三つの地域圏が別の方位に分かれています")).toBe(false);
  });

  it("どの県の文章にも金額が書かれていない", () => {
    const bad: string[] = [];
    for (const [code, editorial] of Object.entries(PREF_EDITORIAL)) {
      for (const paragraph of editorial.intro) {
        const hit = paragraph.match(AMOUNT);
        if (hit) bad.push(`${prefNameByCode(code) ?? code}: ${hit[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("そもそも文章が入っている（空回りしていない）", () => {
    const paragraphs = Object.values(PREF_EDITORIAL).flatMap((e) => e.intro);
    expect(paragraphs.length).toBeGreaterThan(40);
  });
});
