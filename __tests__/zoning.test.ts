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
  MUTED_ZONING_FILL,
  UNKNOWN_ZONING_FILL,
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
