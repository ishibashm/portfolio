import { describe, expect, it } from "vitest";

import {
  PREFECTURE_CENTERS,
  prefectureDirections,
} from "@/lib/prefectureDirection";
import { SCRAPE_TARGETS } from "@/lib/scrapeTargets";
import { ALL_DIRECTIONS } from "@/utils/auspiciousDays";
import { bearingBetween, directionFromBearing } from "@/utils/directionGeo";

/**
 * 県→方位の割り当ての基準点を「巡回起点（概ね県庁所在地）」から
 * 「県の面積重心」に変えた変更の固定（利用者報告 2026-08-27）。
 *
 * 旧実装は SCRAPE_TARGETS の座標を県の代表点に流用していた。県庁は
 * 県の端にあることが多く、兵庫（代表点=神戸、県の南東端）は京都から
 * 「南西」に割り当てられていた。県の北半分は京都から見て北西にあり、
 * 「自分の北西の県が南西の色で塗られる」という報告になった。
 */

/** 旧実装の写し。SCRAPE_TARGETS の座標（巡回起点）を県の代表点にする。 */
function legacyPrefectureDirections(
  baseLat: number,
  baseLon: number,
  nodeMapping: "traditional" | "physical",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of SCRAPE_TARGETS) {
    out[t.name] = directionFromBearing(
      bearingBetween(baseLat, baseLon, t.lat, t.lon),
      nodeMapping,
    );
  }
  return out;
}

const KYOTO = { lat: 35.0116, lon: 135.7681 };

describe("県→方位の割り当て（面積重心）", () => {
  it("報告の再現: 京都から兵庫は、旧実装だと南西・重心だと西", () => {
    for (const m of ["traditional", "physical"] as const) {
      // 旧: 神戸（県の南東端）へは 236° = 南西
      expect(
        legacyPrefectureDirections(KYOTO.lat, KYOTO.lon, m)["兵庫県"],
      ).toBe("SW");
      // 新: 県中央部 (134.83, 35.09) へは 276° = 西。
      // 旧挙動（巡回起点を代表点にする）に戻すとここが SW になって落ちる。
      expect(prefectureDirections(KYOTO.lat, KYOTO.lon, m)["兵庫県"]).toBe("W");
    }
  });

  it("重心は 47 都道府県すべて揃っていて、割り当ては必ず八方位", () => {
    expect(Object.keys(PREFECTURE_CENTERS)).toHaveLength(47);
    // SCRAPE_TARGETS（塗りの県名の出どころ）と名前が一致していること。
    // ずれると県塗りがその県だけ黙って消える。
    for (const t of SCRAPE_TARGETS) {
      expect(PREFECTURE_CENTERS[t.name], t.name).toBeDefined();
    }
    const dirs = prefectureDirections(KYOTO.lat, KYOTO.lon, "traditional");
    for (const [name, d] of Object.entries(dirs)) {
      expect(ALL_DIRECTIONS.includes(d), `${name}: ${d}`).toBe(true);
    }
  });

  it("広い入力で固定: 47 重心を出発地にした全組み合わせの新旧差", () => {
    // 旧→新で変わる (出発地, 県) の組の数。基準点の表か区切りの実装が
    // 変われば必ずここが動く。47×46 = 2,162 組。
    const expected = { traditional: 180, physical: 203 } as const;
    for (const m of ["traditional", "physical"] as const) {
      let diff = 0;
      for (const [baseName, c] of Object.entries(PREFECTURE_CENTERS)) {
        const legacy = legacyPrefectureDirections(c.lat, c.lon, m);
        const neo = prefectureDirections(c.lat, c.lon, m);
        for (const p of Object.keys(PREFECTURE_CENTERS)) {
          if (p === baseName) continue;
          if (legacy[p] !== neo[p]) diff++;
        }
      }
      expect(diff, m).toBe(expected[m]);
    }
  });
});
