import { describe, expect, it } from "vitest";
import { PREF_REGION, regionSiblings, prefNameByCode } from "@/lib/prefContent";
import { PRACTITIONER_AREAS } from "@/lib/practitioners";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";

/**
 * 県ページ同士の導線（同じ地方の県）。
 *
 * ここで守りたいのは 2 つ。
 *
 * 1. **地方の呼び名を 2 通り持たない。**鑑定士の対応地域
 *    （PRACTITIONER_AREAS）と同じ語を使う。片方だけ「中部」に
 *    変えるといった食い違いが起きたら落ちる
 * 2. 47 都道府県が漏れなく 1 つの地方に入っている
 */

describe("PREF_REGION", () => {
  it("47 都道府県をコード 01〜47 で漏れなく持つ", () => {
    const codes = Object.keys(PREF_REGION).sort();
    expect(codes).toHaveLength(47);
    expect(codes[0]).toBe("01");
    expect(codes[46]).toBe("47");
  });

  it("地方の呼び名は鑑定士の対応地域と同じ語だけを使う", () => {
    /* オンラインは地域ではないので対象外 */
    const areas = new Set<string>(
      PRACTITIONER_AREAS.filter((a) => a !== "オンライン"),
    );
    for (const region of new Set(Object.values(PREF_REGION))) {
      expect(areas.has(region)).toBe(true);
    }
  });

  it("県ページを公開している県は、すべて地方が引ける", () => {
    for (const code of Object.keys(PREF_EDITORIAL)) {
      expect(PREF_REGION[code]).toBeTruthy();
    }
  });
});

describe("regionSiblings", () => {
  it("自分を含めず、同じ地方の県だけをコード順で返す", () => {
    /* 13 = 東京都（関東） */
    const siblings = regionSiblings("13");
    expect(siblings.map((s) => s.code)).toEqual([
      "08",
      "09",
      "10",
      "11",
      "12",
      "14",
    ]);
    expect(siblings.map((s) => s.name)).not.toContain(prefNameByCode("13"));
  });

  it("同じ地方に 1 県しか無ければ空（北海道）", () => {
    expect(regionSiblings("01")).toEqual([]);
  });

  it("知らないコードでは空を返す（落とさない）", () => {
    expect(regionSiblings("99")).toEqual([]);
  });
});
