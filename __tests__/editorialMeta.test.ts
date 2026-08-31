import { describe, expect, it } from "vitest";
import { metaDescriptionFromIntro } from "@/lib/editorialMeta";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";

/**
 * meta description が頁ごとに違うこと。
 *
 * #379 で索引から外す原因になったのは「地の文はどの URL でも同一、
 * 変わるのは地名と表の数字だけ」という状態だった。**その状態が
 * description に残っていた**（地名だけを差し替えた同じ 1 文を
 * 全頁に配っていた）。文章を書いた頁は、その文章から作る。
 */

const FALLBACK = "既定の 1 文。";

describe("metaDescriptionFromIntro", () => {
  it("文章が無ければ既定を返す", () => {
    expect(metaDescriptionFromIntro(undefined, FALLBACK)).toBe(FALLBACK);
    expect(metaDescriptionFromIntro([], FALLBACK)).toBe(FALLBACK);
    expect(metaDescriptionFromIntro(["   "], FALLBACK)).toBe(FALLBACK);
  });

  it("文の切れ目で切る（途中で切らない）", () => {
    const intro = [
      "駿河区から見て、南には市区町村が 1 つもありません。駿河湾がそのまま太平洋に続いていて、150km を越えても街に当たらない行き止まりの方位です。南が吉方位に出た年は、この頁の一覧では受け皿を出せません。",
    ];
    const out = metaDescriptionFromIntro(intro, FALLBACK);
    expect(out.endsWith("。")).toBe(true);
    /* 「1 つもありません」が「1 つも」で終わるような切り方をしない */
    expect(intro[0].startsWith(out)).toBe(true);
  });

  it("1 文目だけで長すぎるときは、その 1 文を返す（詰めない）", () => {
    const long = `${"あ".repeat(200)}。次の文。`;
    expect(metaDescriptionFromIntro([long], FALLBACK)).toBe(
      `${"あ".repeat(200)}。`,
    );
  });

  it("市区町村ページの description が頁ごとに違う", () => {
    const seen = new Set<string>();
    for (const [code, e] of Object.entries(AREA_EDITORIAL)) {
      const d = metaDescriptionFromIntro(e.intro, `既定 ${code}`);
      expect(d, code).not.toBe(`既定 ${code}`);
      seen.add(d);
    }
    expect(seen.size).toBe(Object.keys(AREA_EDITORIAL).length);
  });

  it("県ページの description が頁ごとに違う", () => {
    const seen = new Set<string>();
    for (const [code, e] of Object.entries(PREF_EDITORIAL)) {
      seen.add(metaDescriptionFromIntro(e.intro, `既定 ${code}`));
    }
    expect(seen.size).toBe(47);
  });

  it("額が入らない（文章の側で書かない決め事が効いている）", () => {
    /* description は検索結果に出るので、毎晩動く数字が入ると
       いちばん目立つところが古くなる */
    for (const e of Object.values(PREF_EDITORIAL)) {
      expect(metaDescriptionFromIntro(e.intro, FALLBACK)).not.toMatch(/円/);
    }
    for (const e of Object.values(AREA_EDITORIAL)) {
      expect(metaDescriptionFromIntro(e.intro, FALLBACK)).not.toMatch(/円/);
    }
  });
});
