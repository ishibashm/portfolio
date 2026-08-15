import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 位置参照情報から郵便番号の座標を埋めるときの突き合わせ規則。
 *
 * ここを外すと **1 件も当たらないまま「終わりました」と出る**（黙って
 * 何も起きない failure）。とくに 2 つ。
 *
 * 1. **文字コード。**位置参照情報は Shift-JIS。UTF-8 として読むと
 *    市区町村名が化けて、鍵が 1 つも一致しない
 * 2. **丁目。**郵便番号側の町域は括弧の但し書きを外してあるので
 *    「丸の内」までしか無いが、位置参照情報は「丸の内一丁目」で持つ。
 *    そのままでは丁目のある町が全部落ちる
 *
 * scripts は tsc の対象外（CLAUDE.md 4 節）なので、規則をここに写して
 * 検証し、あわせて実装側に規則が残っていることも見る。
 */

const SRC = readFileSync(
  join(process.cwd(), "scripts", "import_isj_coords.ts"),
  "utf8",
);

/** 実装の stripChome と同じ規則。 */
function stripChome(town: string): string {
  return town.replace(/[一二三四五六七八九十〇零壱弐参百千]+丁目$/, "");
}

/** 実装の averagePoint と同じ規則。 */
function averagePoint(points: { lat: number; lon: number }[]) {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}

describe("丁目の落とし方", () => {
  it("丁目を落とす（郵便番号側には丁目が無い）", () => {
    expect(stripChome("丸の内一丁目")).toBe("丸の内");
    expect(stripChome("東九条西山王町三丁目")).toBe("東九条西山王町");
    expect(stripChome("梅田十丁目")).toBe("梅田");
  });

  it("丁目が無い町名はそのまま", () => {
    expect(stripChome("東九条")).toBe("東九条");
    expect(stripChome("千代田")).toBe("千代田");
  });

  it("末尾以外の「丁目」は落とさない", () => {
    // 「一丁目町」のような地名を壊さない。
    expect(stripChome("一丁目町")).toBe("一丁目町");
  });

  it("漢数字でない丁目は落とさない（別の地名を巻き込まない）", () => {
    expect(stripChome("丸の内1丁目")).toBe("丸の内1丁目");
  });
});

describe("代表点", () => {
  it("同じ町の複数の丁目は平均を取る", () => {
    const p = averagePoint([
      { lat: 35.68156, lon: 139.767201 },
      { lat: 35.680022, lon: 139.763447 },
      { lat: 35.676952, lon: 139.763476 },
    ]);
    expect(p.lat).toBeCloseTo(35.679511, 5);
    expect(p.lon).toBeCloseTo(139.764708, 5);
  });

  it("1 点しかなければそのまま", () => {
    expect(averagePoint([{ lat: 35.1, lon: 139.2 }])).toEqual({
      lat: 35.1,
      lon: 139.2,
    });
  });
});

describe("取り込みスクリプトの作り", () => {
  it("Shift-JIS で読んでいる（UTF-8 で読むと 1 件も当たらない）", () => {
    expect(SRC).toContain('new TextDecoder("shift_jis")');
  });

  it("列を見出しの名前で引いている（位置で決め打ちしない）", () => {
    expect(SRC).toContain('idx("大字町丁目名")');
    expect(SRC).not.toMatch(/cols\[5\]\s*,\s*\/\/\s*大字町丁目名/);
  });

  it("見出しに必要な列が無ければ止まる（黙って 0 件で終わらない）", () => {
    expect(SRC).toContain("見出しに必要な列がありません");
  });

  it("0,0 の座標を捨てている", () => {
    // 0,0 は大西洋上の実在の点。入れると方位が出てしまう。
    expect(SRC).toContain("lat === 0 && lon === 0");
  });

  it("すでに埋まっている行を触らない", () => {
    // 1 件ずつ引いて埋めた分を消さない。
    expect(SRC).toContain("WHERE lat IS NULL");
  });

  it("カーソルで前へ進めている（同じ範囲を読み直して止まらない）", () => {
    expect(SRC).toContain("code > $1");
    expect(SRC).toContain("cursor = row.code");
  });

  it("既定の段は probe（書き込まない側）", () => {
    expect(SRC).toContain('process.env.ISJ_STAGE || "probe"');
  });

  it("置き場を 1 つに決め打ちしていない", () => {
    // 日本郵便で 2 回外している（#342・#343）。候補を順に試して、
    // 全滅したら配布ページから拾う。
    expect(SRC).toContain("zipCandidates");
    expect(SRC).toContain("discoverZipLinks");
  });

  it("方位の計算を持ち込んでいない", () => {
    // 八方位に落とす実装は directionFromBearing ただ 1 つ（CLAUDE.md 3 節）。
    expect(SRC).not.toMatch(/b >= 345 \|\| b < 15/);
    expect(SRC).not.toMatch(/22\.5\) % 360\) \/ 45/);
  });
});
