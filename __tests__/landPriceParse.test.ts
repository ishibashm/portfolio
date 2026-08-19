import { describe, expect, it } from "vitest";
import {
  parsePriceYenPerSqm,
  toLandPricePoint,
} from "../scripts/landPriceParse";

/**
 * 地価公示（XPT002）の 1 地点の読み方。
 *
 * import_land_prices.ts は価格の項目名を推測で並べ、当たらなければ
 * **properties の中で 1000 より大きい数値を何でも 1 つ拾う**実装だった。
 * probe（run 32305342276）で実物を見たところ、推測していた 5 つの
 * 項目名はどれも存在せず、キーの並び順から **point_id（地点の整理
 * 番号）が「地価」として保存されていた**。
 *
 * 下に旧実装を写してある。**旧実装に差し替えると落ちる**ことを
 * 確認済み。
 */

/** probe が実際に返した千代田区の 1 地点（使う項目に絞って写した）。 */
const REAL_FEATURE = {
  // GeoJSON は [経度, 緯度] の順。
  geometry: { type: "Point", coordinates: [139.7462, 35.7016] },
  properties: {
    prefecture_name_ja: "東京都",
    ward_town_village_name_ja: "千代田区",
    city_county_name_ja: "",
    front_road_width: 80,
    u_cadastral_ja: "142(㎡)",
    point_id: 7008430,
    u_current_years_price_ja: "1,970,000(円/㎡)",
    last_years_price: 1740000,
    use_category_name_ja: "住宅地",
    location: "東京都千代田区富士見１丁目８番６",
    standard_lot_number_ja: "千代田-4",
    land_price_type: 0,
    target_year_name_ja: "令和7年1月1日",
    year_on_year_change_rate: "13.2",
    depth_ratio: 10,
    frontage_ratio: 12,
    pause_flag: 0,
  },
};

/** 変更前の取り出し方（そのまま写し）。 */
function oldPrice(props: Record<string, unknown>): number | null {
  const price =
    (props as Record<string, number>).price ||
    (props as Record<string, number>).LandPrice ||
    (props as Record<string, number>)["地価"] ||
    (props as Record<string, number>).P01 ||
    parseInt(String((props as Record<string, string>).P01_006 || "0"));
  if (price) {
    const n = Number(price);
    if (!isNaN(n)) return n;
  }
  const anyPrice = Object.values(props).find(
    (v) => typeof v === "number" && v > 1000,
  );
  return typeof anyPrice === "number" ? anyPrice : null;
}

describe("当年価格の取り出し", () => {
  it('"1,970,000(円/㎡)" を 1970000 として読む', () => {
    expect(parsePriceYenPerSqm("1,970,000(円/㎡)")).toBe(1970000);
    expect(parsePriceYenPerSqm("3,680,000(円/㎡)")).toBe(3680000);
    expect(parsePriceYenPerSqm("52,000(円/㎡)")).toBe(52000);
  });

  it("数値で来ても読む（前年価格はこの形）", () => {
    expect(parsePriceYenPerSqm(1740000)).toBe(1740000);
  });

  it("読めない形は null。0 や NaN で埋めない", () => {
    for (const v of [
      "",
      "  ",
      "(円/㎡)",
      "－",
      null,
      undefined,
      {},
      [],
      0,
      -5,
      NaN,
    ]) {
      expect(parsePriceYenPerSqm(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("1 地点の読み取り", () => {
  it("実物の地点から当年価格と付随項目が取れる", () => {
    const p = toLandPricePoint(REAL_FEATURE)!;
    expect(p.pricePerSqm).toBe(1970000);
    expect(p.lastYearPricePerSqm).toBe(1740000);
    expect(p.useCategory).toBe("住宅地");
    expect(p.location).toBe("東京都千代田区富士見１丁目８番６");
    expect(p.standardLotNumber).toBe("千代田-4");
    expect(p.landPriceType).toBe(0);
    expect(p.targetYearLabel).toBe("令和7年1月1日");
    expect(p.pointId).toBe(7008430);
    expect(p.prefecture).toBe("東京都");
    expect(p.municipality).toBe("千代田区");
    expect(p.lon).toBe(139.7462);
    expect(p.lat).toBe(35.7016);
  });

  it("座標は [経度, 緯度] の順で読む（入れ替えない）", () => {
    // 入れ替えると日本の地点がインド洋へ飛ぶ。範囲の検査で捨てる。
    const swapped = {
      ...REAL_FEATURE,
      geometry: { type: "Point", coordinates: [35.7016, 139.7462] },
    };
    const p = toLandPricePoint(swapped)!;
    expect(p.lat).toBeNull();
    expect(p.lon).toBeNull();
    // 価格は使えるので行そのものは作る。
    expect(p.pricePerSqm).toBe(1970000);
  });

  it("geometry が無くても価格が取れれば行を作る", () => {
    const p = toLandPricePoint({ properties: REAL_FEATURE.properties })!;
    expect(p.pricePerSqm).toBe(1970000);
    expect(p.lat).toBeNull();
  });

  it("鍵になる項目が欠けた地点は取り込まない", () => {
    for (const missing of ["point_id", "land_price_type"]) {
      const props: Record<string, unknown> = { ...REAL_FEATURE.properties };
      delete props[missing];
      expect(
        toLandPricePoint({ ...REAL_FEATURE, properties: props }),
        `${missing} が無い`,
      ).toBeNull();
    }
  });

  it("**旧実装は point_id を地価として拾っていた**", () => {
    // これが本体。7,008,430 円/㎡ という値が保存され、コスパ指数
    // （所得 ÷ 地価）の分母になっていた。正しくは 1,970,000。
    expect(oldPrice(REAL_FEATURE.properties)).toBe(7008430);
    expect(toLandPricePoint(REAL_FEATURE)!.pricePerSqm).toBe(1970000);
  });

  it("推測していた 5 つの項目名は実物に存在しない", () => {
    for (const k of ["price", "LandPrice", "地価", "P01", "P01_006"]) {
      expect(
        Object.keys(REAL_FEATURE.properties),
        `${k} は応答に無い`,
      ).not.toContain(k);
    }
  });

  it("当年価格が読めない地点は null。前年価格や 0 で埋めない", () => {
    const broken = {
      properties: {
        ...REAL_FEATURE.properties,
        u_current_years_price_ja: "",
      },
    };
    expect(toLandPricePoint(broken)).toBeNull();
    // 旧実装はここでも point_id を返してしまう。
    expect(oldPrice(broken.properties)).toBe(7008430);
  });

  it("properties が無い feature は null", () => {
    expect(toLandPricePoint({})).toBeNull();
    expect(toLandPricePoint({ properties: null })).toBeNull();
  });

  it("空欄の文字列項目は null にする（空文字を値として持たない）", () => {
    const p = toLandPricePoint({
      properties: {
        ...REAL_FEATURE.properties,
        use_category_name_ja: "",
        location: "   ",
      },
    })!;
    expect(p.useCategory).toBeNull();
    expect(p.location).toBeNull();
  });
});
