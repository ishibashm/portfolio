import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 不動産の成約価格の取り込み（scripts/import_property_transactions.ts）。
 *
 * この取り込みは 2 つの事故が起きやすい。
 *
 * 1. **㎡単価を画面で割る。**面積 0 の取引が混ざると Infinity になり、
 *    相場の表示が壊れる。取り込み時に出して持つ、を守る
 * 2. **応答の項目名が想定と違っても気付けない。**行は入るのに中身が
 *    全部 null になる。probe と対応づけの検査でそれを止める
 *
 * scripts は tsc の対象外（CLAUDE.md 4 節）なので、規則をここに写して
 * 検証し、あわせて実装側に規則が残っていることも見る。
 */

const SRC = readFileSync(
  join(process.cwd(), "scripts", "import_property_transactions.ts"),
  "utf8",
);

/** 実装の toNumber と同じ規則。 */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const digits = v.replace(/[^0-9.-]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** 実装の unit_price_sqm と同じ規則。 */
function unitPrice(price: number | null, area: number | null): number | null {
  return price !== null && area !== null && area > 0 ? price / area : null;
}

/** 実装の pickRecords と同じ規則。 */
function pickRecords(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of ["data", "Data", "results", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  const arrays = Object.values(obj).filter(Array.isArray);
  return arrays.length === 1 ? (arrays[0] as unknown[]) : [];
}

describe("数の取り出し", () => {
  it("数はそのまま通す", () => {
    expect(toNumber(12000000)).toBe(12000000);
  });

  it("文字列の桁区切りや単位を落とす", () => {
    expect(toNumber("12,000,000")).toBe(12000000);
    expect(toNumber("55.5")).toBe(55.5);
  });

  it("数の入っていないものは null（0 にしない）", () => {
    // 0 にすると「価格 0 円の取引」として相場に混ざる。
    expect(toNumber("")).toBeNull();
    expect(toNumber("不明")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(NaN)).toBeNull();
  });
});

describe("㎡単価", () => {
  it("総額と面積があれば割る", () => {
    expect(unitPrice(12000000, 60)).toBe(200000);
  });

  it("面積 0 は null にする（Infinity を作らない）", () => {
    // ここが素の割り算だと Infinity になり、画面の相場が壊れる。
    expect(unitPrice(12000000, 0)).toBeNull();
    expect(Number.isFinite(unitPrice(12000000, 0) ?? 0)).toBe(true);
  });

  it("面積が負でも null（外れ値を通さない）", () => {
    expect(unitPrice(12000000, -10)).toBeNull();
  });

  it("どちらかが欠けていれば null", () => {
    expect(unitPrice(null, 60)).toBeNull();
    expect(unitPrice(12000000, null)).toBeNull();
  });
});

describe("応答から一覧を探す", () => {
  it("data の枝を使う", () => {
    expect(pickRecords({ status: "OK", data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it("配列がそのまま来ても読める", () => {
    expect(pickRecords([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("名前が違っても、配列の枝が 1 つならそれを使う", () => {
    // 提供元が包みの名前を変えたときに 0 件で静かに終わらないため。
    expect(pickRecords({ status: "OK", records: [{ a: 1 }] })).toEqual([
      { a: 1 },
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

describe("取り込みスクリプトの作り", () => {
  it("既定の段は probe（書き込まない側）", () => {
    // 既定を fetch にすると、対応づけ未確認のまま書き込みが走る。
    expect(SRC).toContain('process.env.TX_STAGE || "probe"');
  });

  it("最初の応答で対応づけを検査している", () => {
    expect(SRC).toContain("assertMapping(raw)");
  });

  it("㎡単価を取り込み時に出している（画面で割らない）", () => {
    expect(SRC).toContain("unit_price_sqm");
    expect(SRC).toMatch(/area > 0 \? price \/ area : null/);
  });

  it("上書きで座標を消していない（2 段目の成果を守る）", () => {
    // lat/lon を EXCLUDED で上書きすると、fetch を回すたびに geocode の
    // 成果が消えていつまでも埋まらない。
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

  it("時間の上限で打ち切れる（再開できる）", () => {
    expect(SRC).toContain("budgetReached()");
  });

  it("方位の計算を持ち込んでいない", () => {
    // 方位を八方位に落とす実装は directionFromBearing ただ 1 つ
    // （CLAUDE.md 3 節）。取り込みは座標を入れるところまで。
    expect(SRC).not.toMatch(/b >= 345 \|\| b < 15/);
    expect(SRC).not.toMatch(/22\.5\) % 360\) \/ 45/);
  });
});
