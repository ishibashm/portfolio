import { describe, expect, it } from "vitest";
import {
  absoluteNiftyUrl,
  buildLandUpsert,
  municipalityKeyFromAddress,
  parseLandArea,
  parseLandPrice,
  pricePerSqm,
  type LandUpsertRow,
} from "@/lib/landUpsert";

/**
 * 売地の欄の読み方。値の例は 2026-09-10 の下見（run 34522593169）で
 * 港区の一覧から実際に出たもの。**同じ土地を別の出どころが別の書式で
 * 書く**ので、どちらも同じ値に落ちることを固定する。
 */
describe("parseLandPrice", () => {
  it("同じ土地の 2 つの書式が同じ円になる", () => {
    expect(parseLandPrice("1億5980万円")).toBe(159_800_000);
    expect(parseLandPrice("15,980万円")).toBe(159_800_000);
  });

  it("億だけ・万だけ・小数の億", () => {
    expect(parseLandPrice("1億円")).toBe(100_000_000);
    expect(parseLandPrice("980万円")).toBe(9_800_000);
    expect(parseLandPrice("1.5億円")).toBe(150_000_000);
    expect(parseLandPrice("2,480万円")).toBe(24_800_000);
  });

  it("万の下に円の端数が付く形", () => {
    expect(parseLandPrice("1980万5000円")).toBe(19_805_000);
  });

  it("読めなければ null（0 にしない）", () => {
    expect(parseLandPrice("-")).toBeNull();
    expect(parseLandPrice("相談")).toBeNull();
    expect(parseLandPrice(undefined)).toBeNull();
    expect(parseLandPrice("")).toBeNull();
  });
});

describe("parseLandArea", () => {
  it("坪の併記も HTML 実体も先頭の数値を取る", () => {
    expect(parseLandArea("44.33㎡（13.40坪）（実測）")).toBe(44.33);
    expect(parseLandArea("44.33m&sup2;")).toBe(44.33);
    expect(parseLandArea("1,200.5㎡")).toBe(1200.5);
  });

  it("読めなければ null", () => {
    expect(parseLandArea("-")).toBeNull();
    expect(parseLandArea(undefined)).toBeNull();
  });
});

describe("pricePerSqm", () => {
  it("円/㎡ を丸めて返し、どちらかが無ければ null", () => {
    expect(pricePerSqm(159_800_000, 44.33)).toBe(3_604_782);
    expect(pricePerSqm(null, 44.33)).toBeNull();
    expect(pricePerSqm(100, null)).toBeNull();
    expect(pricePerSqm(100, 0)).toBeNull();
  });
});

describe("municipalityKeyFromAddress", () => {
  /* rental_properties のトリガー（20260814_add_rental_dedupe_keys.sql）と
     同じ規則。政令市は区まで、それ以外は市区町村まで */
  it("トリガーと同じ切り出し", () => {
    expect(municipalityKeyFromAddress("東京都港区白金台")).toBe("東京都港区");
    expect(municipalityKeyFromAddress("神奈川県横浜市中区本町1")).toBe(
      "神奈川県横浜市中区",
    );
    expect(municipalityKeyFromAddress("北海道旭川市宮下通")).toBe(
      "北海道旭川市",
    );
    /* 郡は [市区町村] に入らないので、村まで含めて 1 つの鍵になる */
    expect(municipalityKeyFromAddress("千葉県長生郡長生村岩沼")).toBe(
      "千葉県長生郡長生村",
    );
    expect(municipalityKeyFromAddress(null)).toBeNull();
    expect(municipalityKeyFromAddress("白金台")).toBeNull();
  });
});

describe("absoluteNiftyUrl", () => {
  it("相対だけをホストで補い、外部サイトはそのまま", () => {
    expect(absoluteNiftyUrl("/tochi/tokyo/minatoku_ct/suumof_1/")).toBe(
      "https://myhome.nifty.com/tochi/tokyo/minatoku_ct/suumof_1/",
    );
    expect(absoluteNiftyUrl("https://www.pitat.com/buyDetail/SJ1.html")).toBe(
      "https://www.pitat.com/buyDetail/SJ1.html",
    );
  });
});

describe("buildLandUpsert", () => {
  const row = (url: string, price: number | null): LandUpsertRow => ({
    url,
    group_id: "g1",
    address: "東京都港区白金台",
    price,
    land_area_sqm: 44.33,
    price_per_sqm: pricePerSqm(price, 44.33),
    plot_ratio_text: "60%",
    access: "東京メトロ南北線/白金台駅 徒歩3分",
    municipality_key: "東京都港区",
    source_scraper: "nifty_land",
    expire_date: null,
  });

  it("空なら null", () => {
    expect(buildLandUpsert([], new Date())).toBeNull();
  });

  it("同じ url は後勝ちで 1 行にまとめ、url で更新する", () => {
    const now = new Date("2026-09-10T00:00:00Z");
    const st = buildLandUpsert(
      [
        row("https://a/1", 100),
        row("https://a/2", 200),
        row("https://a/1", 300),
      ],
      now,
    )!;
    expect(st.sql).toContain("INSERT INTO land_listings");
    expect(st.sql).toContain("ON CONFLICT (url) DO UPDATE SET");
    /* 13 列 × 2 行 */
    expect(st.params).toHaveLength(26);
    expect(st.params[2]).toBe(300);
    expect(st.params).toContain("https://a/1");
    expect(st.params).toContain("https://a/2");
    /* 更新する列に first_seen_at は入れない（初見の時刻を残す） */
    expect(st.sql).not.toMatch(/first_seen_at = EXCLUDED/);
    expect(st.sql).toMatch(/last_seen_at = EXCLUDED/);
  });
});
