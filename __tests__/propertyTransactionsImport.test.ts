import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pickRecords,
  toNumber,
  toRow,
  toRows,
  checkMapping,
} from "../scripts/propertyTxParse";

/**
 * 不動産の取引価格の取り込み（国土交通省 XIT001）。
 *
 * **2026-08-16 の probe が返した実物をそのまま食わせる。**京都府・
 * 2025 年第 1 四半期・2,964 件のうち先頭 2 件。以前はスクリプトの字面を
 * 検査していたが、位置参照情報の取り込みで**字面が合っていても動かない**
 * ことが 2 回続いたので、実際に通す形に変えた。
 *
 * この取り込みで起きやすい事故は 2 つ。
 *
 * 1. **㎡単価を画面で割る。**面積 0 の取引が混ざると Infinity になり、
 *    相場の表示が壊れる。取り込み時に出して持つ
 * 2. **項目名が想定と違っても気付けない。**行は入るのに中身が全部 null に
 *    なる。checkMapping が最初の 1 件で止める
 */

const SRC = readFileSync(
  join(process.cwd(), "scripts", "import_property_transactions.ts"),
  "utf8",
);

/** probe が返した実物（先頭 2 件）。項目は削っていない。 */
const REAL_LAND = {
  PriceCategory: "不動産取引価格情報",
  Type: "宅地(土地と建物)",
  Region: "住宅地",
  MunicipalityCode: "26101",
  Prefecture: "京都府",
  Municipality: "京都市北区",
  DistrictName: "出雲路神楽町",
  TradePrice: "18000000",
  PricePerUnit: "",
  FloorPlan: "",
  Area: "85",
  UnitPrice: "",
  LandShape: "長方形",
  Frontage: "6",
  TotalFloorArea: "85",
  BuildingYear: "",
  Structure: "木造",
  Use: "住宅",
  Purpose: "その他",
  Direction: "南西",
  Classification: "市道",
  Breadth: "1.6",
  CityPlanning: "第１種低層住居専用地域",
  CoverageRatio: "60",
  FloorAreaRatio: "100",
  Period: "2025年第1四半期",
  Renovation: "",
  Remarks: "私道を含む取引",
  DistrictCode: "261010010",
};

const REAL_HOUSE = {
  ...REAL_LAND,
  Region: "商業地",
  DistrictName: "大宮南椿原町",
  TradePrice: "39000000",
  Area: "75",
  Frontage: "7.3",
  TotalFloorArea: "135",
  BuildingYear: "2010年",
  Use: "住宅、店舗",
  Purpose: "住宅",
  Remarks: "",
  DistrictCode: "261010440",
};

describe("実物の応答を 1 行にする", () => {
  it("土地と建物の取引（築年が空）", () => {
    const row = toRow(REAL_LAND, 2025, 1);
    expect(row).toEqual({
      id: "26101|出雲路神楽町|宅地(土地と建物)|85|18000000|85||木造|住宅|住宅地|2025|1",
      trade_year: 2025,
      trade_quarter: 1,
      municipality_code: "26101",
      prefecture: "京都府",
      municipality: "京都市北区",
      district_name: "出雲路神楽町",
      property_type: "宅地(土地と建物)",
      trade_price: 18000000,
      area_sqm: 85,
      // 18,000,000 / 85 ≒ 211,764.7 円/㎡
      unit_price_sqm: 18000000 / 85,
      building_year: null, // "" は null。0 年築にしない
      structure: "木造",
      use_type: "住宅",
    });
  });

  it("築年の「2010年」から数を取り出す", () => {
    // 実物は単位付きの文字列で来る。そのまま入れると型が合わない。
    expect(toRow(REAL_HOUSE, 2025, 1)?.building_year).toBe(2010);
  });

  it("同じ期の別の取引は別の id になる", () => {
    const a = toRow(REAL_LAND, 2025, 1)!;
    const b = toRow(REAL_HOUSE, 2025, 1)!;
    expect(a.id).not.toBe(b.id);
  });

  it("同じ取引を二度読んでも同じ id（二度入れを防ぐ）", () => {
    expect(toRow(REAL_LAND, 2025, 1)!.id).toBe(toRow(REAL_LAND, 2025, 1)!.id);
  });

  it("市区町村が取れない行は捨てる", () => {
    // どこの取引か分からないものは方位を測れない。
    expect(toRow({ ...REAL_LAND, Municipality: "" }, 2025, 1)).toBeNull();
    expect(toRow({ ...REAL_LAND, MunicipalityCode: "" }, 2025, 1)).toBeNull();
  });
});

/**
 * 京都府の 1 回目の取り込みが、ここで落ちた。
 *
 *   error: ON CONFLICT DO UPDATE command cannot affect row a second time
 *
 * 同じ INSERT に同じ id が 2 つあると PostgreSQL が拒む。id を
 * 「市区町村・地区・種類・面積・価格・期」だけで作っていたので、
 * **同じ町で同じ広さ・同じ価格の取引が同じ四半期に 2 件あると潰れていた。**
 * 京都市では普通に起きる。
 */
describe("同じ内容の取引が複数あっても id が重ならない", () => {
  it("まったく同じ 2 件に別の id を振る", () => {
    const rows = toRows([REAL_LAND, REAL_LAND], 2025, 1);
    expect(rows).toHaveLength(2); // 捨てない
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[1].id).toBe(`${rows[0].id}#2`);
  });

  it("3 件以上でも重ならない", () => {
    const rows = toRows([REAL_LAND, REAL_LAND, REAL_LAND], 2025, 1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });

  it("1 件目の id は番号を付けない（既存の行の id を変えない）", () => {
    expect(toRows([REAL_LAND], 2025, 1)[0].id).toBe(
      toRow(REAL_LAND, 2025, 1)!.id,
    );
  });

  it("二度読んでも同じ id（行が増えない）", () => {
    const a = toRows([REAL_LAND, REAL_LAND], 2025, 1).map((r) => r.id);
    const b = toRows([REAL_LAND, REAL_LAND], 2025, 1).map((r) => r.id);
    expect(a).toEqual(b);
  });

  it("面積や築年が違えば番号は付かない（別の取引として区別できる）", () => {
    // id に使う項目を増やしたので、この 2 件はそもそも衝突しない。
    const rows = toRows([REAL_LAND, REAL_HOUSE], 2025, 1);
    expect(rows.map((r) => r.id).some((id) => id.includes("#"))).toBe(false);
  });

  it("構造だけが違う取引も別の行になる", () => {
    const rows = toRows(
      [REAL_LAND, { ...REAL_LAND, Structure: "ＲＣ" }],
      2025,
      1,
    );
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[1].id).not.toContain("#");
  });

  it("市区町村が取れない行を除いても番号がずれない", () => {
    const rows = toRows(
      [{ ...REAL_LAND, Municipality: "" }, REAL_LAND, REAL_LAND],
      2025,
      1,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toContain("#");
    expect(rows[1].id).toContain("#2");
  });

  it("まとめて作った id は全部ちがう（同じ INSERT に入れられる）", () => {
    const many = Array.from({ length: 50 }, () => REAL_LAND);
    const rows = toRows(many, 2025, 1);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe("㎡単価", () => {
  it("面積 0 は null にする（Infinity を作らない）", () => {
    // ここが素の割り算だと Infinity になり、画面の相場が壊れる。
    const row = toRow({ ...REAL_LAND, Area: "0" }, 2025, 1);
    expect(row?.unit_price_sqm).toBeNull();
  });

  it("面積が空でも null", () => {
    expect(
      toRow({ ...REAL_LAND, Area: "" }, 2025, 1)?.unit_price_sqm,
    ).toBeNull();
  });

  it("価格が空でも null", () => {
    expect(
      toRow({ ...REAL_LAND, TradePrice: "" }, 2025, 1)?.unit_price_sqm,
    ).toBeNull();
  });
});

describe("数の取り出し", () => {
  it("数字だけの文字列を通す", () => {
    expect(toNumber("18000000")).toBe(18000000);
    expect(toNumber("1.6")).toBe(1.6);
  });

  it("単位が付いていても取り出す", () => {
    expect(toNumber("2010年")).toBe(2010);
    // 面積は範囲で来ることがある。下限を採る（上限は分からない）。
    expect(toNumber("2000㎡以上")).toBe(2000);
  });

  it("数の入っていないものは null（0 にしない）", () => {
    // 0 にすると「価格 0 円の取引」として相場に混ざる。
    expect(toNumber("")).toBeNull();
    expect(toNumber("不明")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(NaN)).toBeNull();
  });
});

describe("応答から一覧を探す", () => {
  it("実物の包み { status, data } から取れる", () => {
    expect(pickRecords({ status: "OK", data: [REAL_LAND] })).toEqual([
      REAL_LAND,
    ]);
  });

  it("名前が違っても、配列の枝が 1 つならそれを使う", () => {
    // 提供元が包みの名前を変えたときに 0 件で静かに終わらないため。
    expect(pickRecords({ status: "OK", records: [REAL_LAND] })).toEqual([
      REAL_LAND,
    ]);
  });

  it("配列の枝が複数あるときは決め打ちしない", () => {
    expect(pickRecords({ a: [1], b: [2] })).toEqual([]);
  });

  it("一覧が無ければ空", () => {
    expect(pickRecords({ status: "NG" })).toEqual([]);
    expect(pickRecords(null)).toEqual([]);
  });
});

describe("対応づけの検査", () => {
  it("実物は通る", () => {
    expect(checkMapping(REAL_LAND)).toBeNull();
  });

  it("項目名が変わったら、何が取れなかったかを言って止める", () => {
    const renamed = { ...REAL_LAND, TradePrice: undefined, price: "18000000" };
    const problem = checkMapping(renamed);
    expect(problem).toContain("TradePrice");
    expect(problem).toContain("実際に来た項目");
  });
});

describe("取り込みスクリプトの作り", () => {
  it("既定の段は probe（書き込まない側）", () => {
    expect(SRC).toContain('process.env.TX_STAGE || "probe"');
  });

  it("最初の応答で対応づけを検査している", () => {
    expect(SRC).toContain("checkMapping(raw[0])");
  });

  it("上書きで座標を消していない（geocode の成果を守る）", () => {
    const conflict = SRC.slice(SRC.indexOf("ON CONFLICT (id) DO UPDATE"));
    const clause = conflict.slice(0, conflict.indexOf("`"));
    expect(clause).toContain("trade_price = EXCLUDED.trade_price");
    expect(clause).not.toContain("lat =");
    expect(clause).not.toContain("lon =");
  });

  it("カーソルで前へ進めている（同じ行を読み直して止まらない）", () => {
    expect(SRC).toContain("id > $1");
    expect(SRC).toContain("cursor = row.id");
  });

  it("方位の計算を持ち込んでいない", () => {
    // 八方位に落とす実装は directionFromBearing ただ 1 つ（CLAUDE.md 3 節）。
    expect(SRC).not.toMatch(/b >= 345 \|\| b < 15/);
    expect(SRC).not.toMatch(/22\.5\) % 360\) \/ 45/);
  });
});
