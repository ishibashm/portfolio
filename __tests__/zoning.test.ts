import { describe, expect, it } from "vitest";
import {
  ZONING_FILL,
  ZONING_ID_HINTS,
  ZONING_NAMES,
  ZONING_ORDER,
  ZONING_SUMMARY,
  formatPercent,
  isZoningName,
  parsePercent,
  zoningFill,
  zoningFillFiltered,
  zoningNameOf,
  isTileCoordinate,
  isZoningZoom,
  zoningPropertiesOf,
  MUTED_ZONING_FILL,
  UNKNOWN_ZONING_FILL,
  ZONING_MAX_ZOOM,
  ZONING_MIN_ZOOM,
  ZONING_RASTER_MAX_ZOOM,
  ZONING_RASTER_MIN_ZOOM,
  isZoningRasterZoom,
  zoningRasterFill,
} from "@/utils/zoning";

/**
 * 用途地域の読み方。
 *
 * 値は `scripts/probe_zoning.ts` の実測（2026-08-23・全国 18 か所）に
 * 合わせてある。**推測で埋めた箇所が無いこと**をここで固定する。
 */

describe("区分名", () => {
  it("13 区分そろっている", () => {
    expect(ZONING_NAMES).toHaveLength(13);
  });

  it("数字は全角（API がそう返す）", () => {
    /*
      半角で書くと照合が外れて、全部「知らない区分」になる。
      実測の値をそのまま写しているかを見る。
    */
    expect(ZONING_NAMES).toContain("第１種低層住居専用地域");
    expect(ZONING_NAMES).not.toContain("第1種低層住居専用地域");
    expect(isZoningName("第1種低層住居専用地域")).toBe(false);
  });

  it("色・説明・並びが 13 区分すべてに付いている", () => {
    for (const name of ZONING_NAMES) {
      expect(ZONING_FILL[name]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(ZONING_SUMMARY[name].length).toBeGreaterThan(5);
    }
    expect(ZONING_ORDER).toHaveLength(13);
  });

  it("色が重複していない（別の区分が同じ色にならない）", () => {
    const fills = Object.values(ZONING_FILL);
    expect(new Set(fills).size).toBe(fills.length);
    expect(fills).not.toContain(UNKNOWN_ZONING_FILL);
  });
});

describe("番号の対応表", () => {
  it("実測で確かめた 12 件だけを持つ", () => {
    /*
      走査で youto_id の 8 が 1 件も出なかった。13 区分のうち 1 つが
      埋まっていない。ここが 13 件になっていたら、誰かが推測で足した。
    */
    expect(Object.keys(ZONING_ID_HINTS)).toHaveLength(12);
    expect(ZONING_ID_HINTS[8]).toBeUndefined();
  });

  it("実測どおりの対応（抜き取り）", () => {
    expect(ZONING_ID_HINTS[1]).toBe("第１種低層住居専用地域");
    expect(ZONING_ID_HINTS[10]).toBe("商業地域");
    expect(ZONING_ID_HINTS[13]).toBe("工業専用地域");
  });

  it("対応表の値はすべて正式な区分名", () => {
    for (const name of Object.values(ZONING_ID_HINTS)) {
      expect(isZoningName(name)).toBe(true);
    }
  });
});

describe("表示する区分を決める", () => {
  it("API の名前を最優先する", () => {
    expect(zoningNameOf("商業地域", 999)).toBe("商業地域");
  });

  it("名前が無ければ番号で引く", () => {
    expect(zoningNameOf("", 10)).toBe("商業地域");
    expect(zoningNameOf(undefined, 1)).toBe("第１種低層住居専用地域");
  });

  it("どちらも駄目なら null（近い区分に寄せない）", () => {
    /*
      用途地域は建てられるものが変わる情報で、隣に寄せると意味が
      反転する（住居専用 ↔ 工業専用）。分からないときは分からないと出す。
    */
    expect(zoningNameOf("なにか別のもの", 8)).toBeNull();
    expect(zoningNameOf(null, null)).toBeNull();
  });

  it("知らない区分は灰色（色でも区別が付く）", () => {
    expect(zoningFill(null)).toBe(UNKNOWN_ZONING_FILL);
    expect(zoningFill("商業地域")).toBe(ZONING_FILL["商業地域"]);
  });
});

describe("建蔽率・容積率の書式", () => {
  it("実測で出た両方の書式を同じ数にする", () => {
    /*
      同じ走査で「50%」と「50.0%」の両方が出た。揃えずに並べると
      表が不揃いになる。
    */
    expect(parsePercent("50%")).toBe(50);
    expect(parsePercent("50.0%")).toBe(50);
    expect(parsePercent("1000%")).toBe(1000);
    expect(parsePercent("100.0%")).toBe(100);
  });

  it("％が無くても読む", () => {
    expect(parsePercent("60")).toBe(60);
    expect(parsePercent(80)).toBe(80);
  });

  it("読めない値は null。0 に落とさない", () => {
    /*
      0% は「建てられない」という別の意味になる。欠測と混ぜない。
    */
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("−")).toBeNull();
    expect(parsePercent(undefined)).toBeNull();
    expect(parsePercent(NaN)).toBeNull();
  });

  it("表示は整数なら小数点を落とす", () => {
    expect(formatPercent(50)).toBe("50%");
    expect(formatPercent(12.5)).toBe("12.5%");
    expect(formatPercent(null)).toBeNull();
  });

  it("読んで書き戻すと書式が揃う", () => {
    const raw = ["50%", "50.0%", "600%", "600.0%"];
    expect(raw.map((r) => formatPercent(parsePercent(r)))).toEqual([
      "50%",
      "50%",
      "600%",
      "600%",
    ]);
  });
});

describe("1 区分だけを見る", () => {
  /*
    13 色を総当たりで見分けられる配色は作れない（実測 ΔE 6.8。下限 15）。
    色に区分を背負わせない代わりに、絞り込みで 1 区分だけ残す。
  */
  it("選んでいないときは、そのままの色", () => {
    expect(zoningFillFiltered("商業地域", null)).toBe(zoningFill("商業地域"));
  });

  it("選んだ区分はそのままの色", () => {
    expect(zoningFillFiltered("商業地域", "商業地域")).toBe(
      zoningFill("商業地域"),
    );
  });

  it("選ばなかった区分は落とすが、消さない", () => {
    /*
      隠すと「そこには何も無い」に見えるが、実際には別の区分がある。
    */
    expect(zoningFillFiltered("工業地域", "商業地域")).toBe(MUTED_ZONING_FILL);
    expect(MUTED_ZONING_FILL).not.toBe(UNKNOWN_ZONING_FILL);
  });

  it("知らない区分も落とす対象になる", () => {
    expect(zoningFillFiltered(null, "商業地域")).toBe(MUTED_ZONING_FILL);
  });
});

describe("中継が使う値の取り出し", () => {
  /** 実測（東京・z=14）の properties をそのまま写したもの。 */
  const REAL = {
    _id: "dZfcjJ8B6FvOHK1G2oX9",
    _index: "bs001_use_area_202607231142",
    prefecture: "東京都",
    use_area_ja: "商業地域",
    city_code: "13101",
    notice_number_s: "",
    decision_date: "",
    city_name: "千代田区",
    u_floor_area_ratio_ja: "600.0%",
    u_building_coverage_ratio_ja: "80.0%",
    notice_number: "",
    decision_classification: "",
    decision_maker: "",
    first_decision_date: "",
    youto_id: 10,
  };

  it("実物から要る値だけを取り出す", () => {
    expect(zoningPropertiesOf(REAL)).toEqual({
      name: "商業地域",
      rawName: "商業地域",
      coverage: 80,
      floorArea: 600,
      city: "千代田区",
    });
  });

  it("書式が違っても同じ数になる", () => {
    const other = { ...REAL, u_building_coverage_ratio_ja: "80%" };
    expect(zoningPropertiesOf(other).coverage).toBe(80);
  });

  it("空文字は null にする（空欄をそのまま出さない）", () => {
    const blank = { ...REAL, city_name: "", u_floor_area_ratio_ja: "" };
    const p = zoningPropertiesOf(blank);
    expect(p.city).toBeNull();
    expect(p.floorArea).toBeNull();
  });

  it("知らない区分でも、API の名前は捨てない", () => {
    /*
      name は null（色は灰色）になるが、rawName は残して画面に出す。
      「知らない区分」とだけ出すより、名前が見えたほうが調べようがある。
    */
    const unknown = { ...REAL, use_area_ja: "新しい区分", youto_id: 99 };
    const p = zoningPropertiesOf(unknown);
    expect(p.name).toBeNull();
    expect(p.rawName).toBe("新しい区分");
  });

  it("properties が無くても落ちない", () => {
    expect(zoningPropertiesOf(undefined)).toEqual({
      name: null,
      rawName: null,
      coverage: null,
      floorArea: null,
      city: null,
    });
  });
});

describe("出すズームの範囲", () => {
  it("実測で決めた範囲だけ通す", () => {
    /*
      下限は**ブラウザが受け取る側**の実測で決める（utils/zoning に表）。
      絞り込み＋間引き後でも z=12 は 1 画面 6.5MB になるので出さない。
      z=13 は 1.6MB で、間引き前の z=14（1.1MB）と同じ桁に収まる。
    */
    expect(ZONING_MIN_ZOOM).toBe(13);
    expect(isZoningZoom(12)).toBe(false);
    expect(isZoningZoom(13)).toBe(true);
    expect(isZoningZoom(14)).toBe(true);
    expect(isZoningZoom(ZONING_MAX_ZOOM)).toBe(true);
    expect(isZoningZoom(ZONING_MAX_ZOOM + 1)).toBe(false);
  });

  it("上限は上流（XKT002）が受ける z15。z16 以上を上流に投げない", () => {
    /*
      以前は 18 だった。上流に無いズームを投げていたうえ、表示側は
      Math.min(zoom, ZONING_MAX_ZOOM) で取りに行くので、1 段拡大する
      たびに同じ場所を取り直していた。z16〜18 は z15 のタイルを使い回す。
    */
    expect(ZONING_MAX_ZOOM).toBe(15);
    expect(isZoningZoom(16)).toBe(false);
  });

  it("整数でないズームは通さない", () => {
    expect(isZoningZoom(14.5)).toBe(false);
    expect(isZoningZoom(NaN)).toBe(false);
  });
});

describe("塗り絵（俯瞰）のズーム", () => {
  it("多角形の下限のすぐ下から、上流の下限（z11）まで", () => {
    /*
      z11〜12 は上流 1 タイルを 1 枚の絵にできる。z10 以下は上流の
      z11 を 4 枚・16 枚と束ねないと作れないので出さない。
    */
    expect(ZONING_RASTER_MAX_ZOOM).toBe(ZONING_MIN_ZOOM - 1);
    expect(ZONING_RASTER_MIN_ZOOM).toBe(11);
    expect(isZoningRasterZoom(10)).toBe(false);
    expect(isZoningRasterZoom(11)).toBe(true);
    expect(isZoningRasterZoom(12)).toBe(true);
    expect(isZoningRasterZoom(13)).toBe(false);
    expect(isZoningRasterZoom(11.5)).toBe(false);
  });

  it("塗り絵と多角形で同じ縮尺を二重に受けない・隙間も無い", () => {
    for (let z = 0; z <= 20; z++) {
      expect(isZoningRasterZoom(z) && isZoningZoom(z), `z${z}`).toBe(false);
    }
    for (let z = ZONING_RASTER_MIN_ZOOM; z <= ZONING_MAX_ZOOM; z++) {
      expect(isZoningRasterZoom(z) || isZoningZoom(z), `z${z}`).toBe(true);
    }
  });

  it("塗る色は画面の多角形と同じ規則（絞り込みも同じ）", () => {
    const commercial = { use_area_ja: "商業地域", youto_id: 10 };
    expect(zoningRasterFill(commercial, null)).toBe(ZONING_FILL["商業地域"]);
    expect(zoningRasterFill(commercial, "商業地域")).toBe(
      ZONING_FILL["商業地域"],
    );
    expect(zoningRasterFill(commercial, "工業地域")).toBe(MUTED_ZONING_FILL);
    /* 知らない区分は灰色。番号だけなら番号で引く */
    expect(zoningRasterFill({ use_area_ja: "謎の地域" }, null)).toBe(
      UNKNOWN_ZONING_FILL,
    );
    expect(zoningRasterFill({ youto_id: 1 }, null)).toBe(
      ZONING_FILL["第１種低層住居専用地域"],
    );
    expect(zoningRasterFill(undefined, null)).toBe(UNKNOWN_ZONING_FILL);
  });
});

describe("タイル座標", () => {
  it("そのズームの範囲に収まっているか見る", () => {
    expect(isTileCoordinate(14, 0, 0)).toBe(true);
    expect(isTileCoordinate(14, 2 ** 14 - 1, 2 ** 14 - 1)).toBe(true);
    expect(isTileCoordinate(14, 2 ** 14, 0)).toBe(false);
    expect(isTileCoordinate(14, -1, 0)).toBe(false);
  });

  it("整数でない値は通さない", () => {
    expect(isTileCoordinate(14, 1.5, 0)).toBe(false);
    expect(isTileCoordinate(14, NaN, 0)).toBe(false);
  });
});
