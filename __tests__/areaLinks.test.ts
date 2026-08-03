import { describe, it, expect } from "vitest";
import {
  AREAS,
  areasByPref,
  siblingAreas,
  topAreasByPref,
} from "@/lib/areaContent";

/**
 * 記事ページからエリアページへの内部リンクを組み立てる部分。
 * リンク先が実在しない、あるいは自分自身に戻るリンクを出すと、
 * 生成される 400 枚以上の静的ページに一斉に混ざり込む。
 */
describe("エリアの内部リンク", () => {
  const codes = new Set(AREAS.map((a) => a.code));

  it("県ごとの一覧が全エリアを漏れなく含む", () => {
    const total = [...areasByPref().values()].reduce(
      (n, list) => n + list.length,
      0,
    );
    expect(total).toBe(AREAS.length);
  });

  it("県内は掲載数の多い順に並ぶ", () => {
    for (const list of areasByPref().values()) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i - 1].count).toBeGreaterThanOrEqual(list[i].count);
      }
    }
  });

  it("記事に出す候補はどの県も落とさない", () => {
    const prefs = topAreasByPref(3).map(([pref]) => pref);
    expect(new Set(prefs)).toEqual(new Set(AREAS.map((a) => a.pref)));
    // 1 ページに並べる本数が増えすぎないこと
    for (const [, list] of topAreasByPref(3)) {
      expect(list.length).toBeLessThanOrEqual(3);
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it("同県リンクは自分自身を含まず、同じ県のものだけを返す", () => {
    for (const area of AREAS) {
      for (const s of siblingAreas(area)) {
        expect(s.code).not.toBe(area.code);
        expect(s.pref).toBe(area.pref);
      }
    }
  });

  it("リンク先のコードはすべて実在する", () => {
    for (const [, list] of topAreasByPref(3)) {
      for (const a of list) expect(codes.has(a.code)).toBe(true);
    }
    for (const area of AREAS) {
      for (const s of siblingAreas(area)) expect(codes.has(s.code)).toBe(true);
    }
  });

  it("県内に1エリアしかない場合でも空配列を返して落ちない", () => {
    const only = [...areasByPref().values()].find((l) => l.length === 1);
    if (only) expect(siblingAreas(only[0])).toEqual([]);
    // 該当する県が無いデータでも、少なくとも上限は守られる
    for (const area of AREAS) {
      expect(siblingAreas(area, 5).length).toBeLessThanOrEqual(5);
    }
  });
});
