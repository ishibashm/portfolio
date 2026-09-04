import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMunicipalityListings,
  parseMunicipalityListings,
  toMunicipalityListing,
  type AreaEntry,
} from "@/utils/areaDatasetMerge";

/**
 * 地図の広域表示が読む、軽い市区町村の一覧。
 *
 * 広域のバブルは長らく「安い順 500 件の窓」を数えたものだった。広い範囲を
 * 映すほど窓はいちばん安い一角に埋まり、残りは空白になる。物件が無いので
 * はなく見ていない（利用者の報告：物件が俯瞰で見ると数が出てこない）。
 *
 * ここが持つのは毎晩の集計＝**その日の掲載を全部**数えた値で、窓とも
 * 絞り込みとも無関係。
 */

const area = (over: Partial<AreaEntry>): AreaEntry => ({
  code: "13101",
  pref: "東京都",
  city: "千代田区",
  full: "東京都千代田区",
  lat: 35.694,
  lon: 139.7536,
  count: 100,
  sqmRent: 5000,
  medianRent: 150000,
  asOf: "2026-09-04",
  ...over,
});

describe("軽い一覧の組み立て", () => {
  it("code・緯度・経度・件数だけを組で持つ", () => {
    expect(buildMunicipalityListings([area({})])).toEqual([
      ["13101", 35.694, 139.7536, 100],
    ]);
  });

  it("座標を小数 4 桁に丸める", () => {
    /* 約 11m。バブルを置くには十分で、丸めないと 1 件 10 バイト増える */
    const [row] = buildMunicipalityListings([
      area({ lat: 35.69403649, lon: 139.75363058 }),
    ]);
    expect(row[1]).toBe(35.694);
    expect(row[2]).toBe(139.7536);
  });

  it("座標が壊れている市区町村は出さない", () => {
    expect(buildMunicipalityListings([area({ lat: NaN })])).toEqual([]);
  });

  it("組と名前つきが往復する", () => {
    /* 添字を直接読ませないための変換。緯度と経度が入れ替わっても型は
       通ってしまうので、ここで並びを固定する */
    const [row] = buildMunicipalityListings([area({})]);
    expect(toMunicipalityListing(row)).toEqual({
      code: "13101",
      lat: 35.694,
      lon: 139.7536,
      count: 100,
    });
  });
});

describe("読み込み側", () => {
  it("組み立てたものをそのまま読み戻せる", () => {
    const built = buildMunicipalityListings([
      area({}),
      area({ code: "13102" }),
    ]);
    expect(parseMunicipalityListings({ areas: built })).toHaveLength(2);
  });

  it("壊れた行だけを落として、残りは返す", () => {
    /* ファイルが古い・形が違うといった理由で地図そのものを落とさない。
       広域の地の分布が出ないだけで、ピンと方位の判定は動き続ける */
    const parsed = parseMunicipalityListings({
      areas: [
        ["13101", 35.694, 139.7536, 100],
        ["13102", "35.7", 139.7, 100], // 緯度が文字列
        ["13103", 35.7, 139.7, -1], // 件数が負
        ["", 35.7, 139.7, 5], // code が空
        [35.7, 139.7], // 短すぎる
        null,
        ["13104", 35.7, 139.7, 5],
      ],
    });
    expect(parsed.map((p) => p.code)).toEqual(["13101", "13104"]);
  });

  it("ファイルが無い・形が違うときは空", () => {
    expect(parseMunicipalityListings(null)).toEqual([]);
    expect(parseMunicipalityListings({})).toEqual([]);
    expect(parseMunicipalityListings({ areas: "だめ" })).toEqual([]);
  });
});

describe("実際に配るファイル", () => {
  const json = JSON.parse(
    readFileSync(
      join(process.cwd(), "public", "municipalityListings.json"),
      "utf8",
    ),
  );

  it("読めて、市区町村が入っている", () => {
    const parsed = parseMunicipalityListings(json);
    expect(parsed.length).toBeGreaterThan(900);
    expect(parsed.every((p) => p.count >= 0)).toBe(true);
  });

  it("日本の範囲に収まっている", () => {
    /* 緯度と経度を取り違えると、地図が世界の裏側にバブルを置く */
    for (const p of parseMunicipalityListings(json)) {
      expect(p.lat, p.code).toBeGreaterThan(20);
      expect(p.lat, p.code).toBeLessThan(46);
      expect(p.lon, p.code).toBeGreaterThan(122);
      expect(p.lon, p.code).toBeLessThan(154);
    }
  });

  it("整形されていない（毎回 client が落とすので嵩を増やさない）", () => {
    const raw = readFileSync(
      join(process.cwd(), "public", "municipalityListings.json"),
      "utf8",
    );
    expect(raw).not.toContain("\n  ");
    expect(raw.length).toBeLessThan(60_000);
  });
});
