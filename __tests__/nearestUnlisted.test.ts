import { describe, expect, it } from "vitest";
import { AREAS, findArea, emptyDirections } from "@/lib/areaContent";

/**
 * 「街はあるが掲載が入らない」方位に、**実在する市区町村の名前**が
 * 添えられているか。
 *
 * ## なぜ要るか
 *
 * #836 でこの区別を出せるようになったが、頁は「市区町村は実在しますが、
 * その賃貸の掲載をまだ集計できていません」で終わっていた。**読む側は
 * そこから次に進めない。**どこにあるのか分からないので、掲載の外を
 * 当たることもできない。
 *
 * 名前と距離まで出せば、長崎市の西なら五島市、福岡市中央区の北西なら
 * 壱岐市・対馬市、と分かる。
 *
 * ## 150km で切る理由
 *
 * 切らないと釧路町の南に**小笠原村（1,959km）**が出る。方位としては
 * 正しいが引越し先の案内にならない。一覧そのものと同じ窓で切る。
 */
describe("掲載漏れの方位に、実在する市区町村の名前が付く", () => {
  it("長崎市の西は五島市（#833 で外した誤りの現場）", () => {
    const e = emptyDirections(findArea("42201")!).find(
      (x) => x.direction === "W",
    );
    expect(e?.hasAnyMunicipality).toBe(true);
    expect(e?.nearestUnlisted.map((u) => u.city)).toContain("五島市");
  });

  it("福岡市中央区の北西は壱岐市・対馬市", () => {
    const e = emptyDirections(findArea("40133")!).find(
      (x) => x.direction === "NW",
    );
    expect(e?.nearestUnlisted.map((u) => u.city)).toEqual(
      expect.arrayContaining(["壱岐市", "対馬市"]),
    );
  });

  it("釧路町の東は厚岸町", () => {
    const e = emptyDirections(findArea("01661")!).find(
      (x) => x.direction === "E",
    );
    expect(e?.nearestUnlisted.map((u) => u.city)).toContain("厚岸郡厚岸町");
  });

  it("行き止まりの方位には名前が付かない", () => {
    /* 名前が出るなら、それは行き止まりではない。分類と表示が食い違うと
       同じ画面の中で 2 つの記述が矛盾する（#790 で実際に起きた形） */
    const bad: string[] = [];
    for (const a of AREAS) {
      for (const e of emptyDirections(a)) {
        if (e.hasAnyMunicipality) continue;
        if (e.nearestUnlisted.length > 0) {
          bad.push(`${a.full} ${e.direction}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("150km より遠い相手を挙げていない", () => {
    const bad: string[] = [];
    for (const a of AREAS) {
      for (const e of emptyDirections(a)) {
        for (const u of e.nearestUnlisted) {
          if (u.distanceKm > 150)
            bad.push(`${a.full} ${e.direction} ${u.city}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("掲載のある市区町村を名前に混ぜていない", () => {
    /* 一覧の側に出るものをここでも挙げると、「掲載を集計できていない」
       という説明と食い違う */
    const listed = new Set(AREAS.map((x) => x.code));
    const names = new Set(
      AREAS.filter((x) => listed.has(x.code)).map((x) => x.city),
    );
    const bad: string[] = [];
    for (const a of AREAS.slice(0, 200)) {
      for (const e of emptyDirections(a)) {
        for (const u of e.nearestUnlisted) {
          /* 同名の別自治体があるので、県まで一致したときだけ見る */
          if (
            names.has(u.city) &&
            AREAS.some((x) => x.city === u.city && x.pref === u.pref)
          ) {
            bad.push(`${a.full} ${e.direction} ${u.pref}${u.city}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("空回りしていない（名前を出せている方位が十分ある）", () => {
    let named = 0;
    for (const a of AREAS) {
      for (const e of emptyDirections(a))
        named += e.nearestUnlisted.length > 0 ? 1 : 0;
    }
    /* 2026-08-31 の実測は 368 方位のうち 283（77%）。残りは相手が
       150km より遠いもの（長崎市の南の枕崎市 170km など） */
    expect(named).toBeGreaterThan(200);
  });
});
