import { describe, expect, it } from "vitest";
import { AREA_EDITORIAL } from "@/lib/areaEditorial";
import { AREAS, findArea, neighboursByDirection } from "@/lib/areaContent";

/**
 * 市区町村ページの文章が「この方位には何がある」と書いたところを、
 * 頁が実際に並べる一覧と突き合わせる。
 *
 * 頁は方位ごとに市区町村を並べる。文章が別の方位を書いていると、
 * **同じ画面の中で文章と一覧が矛盾する**。頁が増えるほど手では
 * 確かめられなくなるので、計算に当てて固定する（#552 の教訓。
 * 字面で探すのではなく、型と計算に出させる）。
 *
 * 県ページの同じ検査は prefEditorialDirections.test.ts。
 * 「街が無い方位」の言い切りは areaEditorialDeadEnds.test.ts。
 */

const DIR_JP: Record<string, string> = {
  北: "N",
  北東: "NE",
  東: "E",
  南東: "SE",
  南: "S",
  南西: "SW",
  西: "W",
  北西: "NW",
};
const D = "北東|南東|南西|北西|北|東|南|西";
/** 「北東は箕面・茨木・高槻から」「南には江田島・大洲」 */
const SEG = new RegExp(
  `(${D})(?:は|には|も)([一-龥ヶ]+(?:・[一-龥ヶ]+)+)`,
  "g",
);

/**
 * 文章の地名 → 市区町村。**1 つに定まるときだけ照合する。**
 *
 * 「栄」は横浜市栄区とも千葉県印旛郡栄町とも読めるし、「守山」は
 * 名古屋市守山区とも滋賀県守山市とも読める。曖昧なまま近い方に
 * 寄せると、正しい文章を誤りとして落とす（実際に 2 件落ちた）。
 */
const VARIANTS = (city: string) => [
  city,
  city.replace(/^.*郡/, ""),
  city.replace(/^.*市/, ""),
];
const SUFFIXES = ["", "区", "市", "町", "村"];
const matchesName = (city: string, name: string) =>
  VARIANTS(city).some((v) => SUFFIXES.some((s) => v === name + s));

interface Mismatch {
  text: string;
}

function audit(): { claims: number; checked: number; bad: Mismatch[] } {
  let claims = 0;
  let checked = 0;
  const bad: Mismatch[] = [];

  for (const [code, editorial] of Object.entries(AREA_EDITORIAL)) {
    const origin = findArea(code);
    if (!origin) continue;
    const groups = neighboursByDirection(origin);
    /** 頁が実際に並べた方位。5km 未満と 150km 超はここに入らない。 */
    const listed = new Map<string, string>();
    for (const [d, list] of Object.entries(groups)) {
      for (const a of list) listed.set(a.code, d);
    }

    for (const paragraph of editorial.intro) {
      for (const m of paragraph.matchAll(SEG)) {
        /* 「西から北西は」「西と南西も」は 2 方位をまとめて指す言い方。
           後ろの方位だけを取ると前半の街を誤りにしてしまうので外す */
        const before = paragraph.slice(Math.max(0, m.index - 2), m.index);
        if (/から$|と$|〜$/.test(before)) continue;

        const want = DIR_JP[m[1]];
        claims++;
        for (const name of m[2].split("・")) {
          const cands = AREAS.filter((a) => matchesName(a.city, name));
          if (cands.length !== 1) continue; // 曖昧な地名は照合しない
          const target = cands[0];
          /* 頁の一覧に出ない相手（隣接する区など 5km 未満、150km 超）は
             文章では触れてよい。決め事にもそう書いてある */
          if (!listed.has(target.code)) continue;
          checked++;
          if (listed.get(target.code) !== want) {
            bad.push({
              text: `${origin.pref}${origin.city} → ${target.pref}${target.city}: 文章=${m[1]} 頁の一覧=${listed.get(target.code)}`,
            });
          }
        }
      }
    }
  }
  return { claims, checked, bad };
}

describe("AREA_EDITORIAL の方位が頁の一覧と合っている", () => {
  const result = audit();

  it("突き合わせる材料が集まっている（空回りしていない）", () => {
    expect(result.claims).toBeGreaterThan(150);
    expect(result.checked).toBeGreaterThan(300);
  });

  it("文章の方位が頁の一覧と食い違っていない", () => {
    expect(result.bad.map((b) => b.text)).toEqual([]);
  });

  it("検出そのものが空回りしていない（わざと間違えた文章を拾う）", () => {
    /* 頁の一覧と 1 つでも食い違えば拾えることを、作った文章で確かめる。
       検査の側が壊れて 0 件マッチのまま緑になるのを防ぐ */
    const origin = findArea("13112")!; // 世田谷区
    const groups = neighboursByDirection(origin);
    const komae = groups.W.find((a) => a.city === "狛江市");
    expect(komae).toBeDefined();
    expect(groups.NW.some((a) => a.city === "狛江市")).toBe(false);
  });
});
