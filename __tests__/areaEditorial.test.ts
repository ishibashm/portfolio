import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS, findArea } from "@/lib/areaContent";

/**
 * 市区町村ページの固有文章。
 *
 * この表は**索引に載せるかどうかの鍵**を兼ねている（頁の robots が
 * ここを見る）。1,022 頁を雛形のまま索引に戻すと #379 の状態
 * （スケーリングされたコンテンツ）に戻ってしまうので、
 *
 * - 表の鍵は必ず実在する市区町村であること（綴り間違いで
 *   「文章はあるのに出ない」頁を作らない）
 * - 数を数えて、うっかり全件に広がっていないこと
 *
 * の 2 つを固定する。文章の中身（変わりうる数字を書かない）は
 * 人が見る。
 */

describe("AREA_EDITORIAL", () => {
  const codes = Object.keys(AREA_EDITORIAL);

  it("書いた市区町村がある（空回りしていない）", () => {
    expect(codes.length).toBeGreaterThan(0);
  });

  it("鍵がすべて実在する市区町村コードを指している", () => {
    const missing = codes.filter((c) => !findArea(c));
    expect(missing).toEqual([]);
  });

  it("雛形のまま全件へ広がっていない（索引に戻すのは書いた頁だけ）", () => {
    expect(codes.length).toBeLessThan(AREAS.length / 2);
  });

  it("本文に markdown の記法が混ざっていない", () => {
    /* 文章はそのまま <p> に入る。**強調** を書くとアスタリスクが
       画面にそのまま出る。実際に 1 度書いてしまった（#754 で除去） */
    const bad: string[] = [];
    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      for (const paragraph of editorial.intro) {
        if (/\*\*|\[.+\]\(.+\)|^#|^- /m.test(paragraph)) bad.push(code);
      }
    }
    expect(bad).toEqual([]);
  });

  it("本文に英単語が紛れ込んでいない（km だけ許す）", () => {
    /* 日本語の文章に英字が残ると、そこだけ読めない。実際に
       「山陽side」と書いてしまった（#760 で除去） */
    const bad: string[] = [];
    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      for (const paragraph of editorial.intro) {
        for (const word of paragraph.match(/[A-Za-z]+/g) ?? []) {
          if (word !== "km") bad.push(`${code}: ${word}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("各項目に本文がある", () => {
    for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
      expect(editorial.intro.length, code).toBeGreaterThan(0);
      for (const paragraph of editorial.intro) {
        expect(paragraph.length, code).toBeGreaterThan(40);
      }
    }
  });
});
