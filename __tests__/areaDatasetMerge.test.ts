/**
 * 「一度公開した市区町村の URL を消さない」の固定。
 *
 * 直す前の挙動は「今回の集計だけを書き出す」——つまり
 * `mergeAreaDataset(fresh, previous, today).areas` が `fresh` と同じ長さに
 * なる、というもの。下の「引き継ぎ」のテストは、その旧挙動に戻すと落ちる。
 */
import { describe, it, expect } from "vitest";
import {
  mergeAreaDataset,
  isFresh,
  parsePreviousAreas,
  type AreaEntry,
} from "@/utils/areaDatasetMerge";

const TODAY = "2026-08-23";

/** 今回の集計の行（asOf はまだ無い）。 */
function freshRow(code: string, count: number): Omit<AreaEntry, "asOf"> {
  return {
    code,
    pref: "福島県",
    city: `市${code}`,
    full: `福島県市${code}`,
    lat: 37.5,
    lon: 140.4,
    count,
    sqmRent: 1500,
    medianRent: 55000,
  };
}

/** 書き出し済みの行（asOf 付き）。 */
function entry(code: string, count: number, asOf = TODAY): AreaEntry {
  return { ...freshRow(code, count), asOf };
}

describe("mergeAreaDataset", () => {
  it("今回の集計から落ちた市区町村を消さない", () => {
    // 07322（大玉村）は掲載 32 件で MIN_ROWS=30 の境目にいる。
    // 実際に 08-17 は載り 08-18 は落ちて、Google が 404 を踏んだ。
    const previous = [entry("07322", 32, "2026-08-20")];
    const result = mergeAreaDataset([freshRow("13101", 900)], previous, TODAY);

    expect(result.areas.map((a) => a.code).sort()).toEqual(["07322", "13101"]);
    expect(result.fresh).toBe(1);
    expect(result.carried).toBe(1);
    expect(result.carriedCodes).toEqual(["07322"]);
  });

  it("引き継いだ行の asOf は前回のまま。today で上書きしない", () => {
    // 上書きすると、更新していない相場を「今日の数字」として出すことになる。
    const previous = [entry("07322", 32, "2026-08-20")];
    const { areas } = mergeAreaDataset([], previous, TODAY);

    expect(areas[0].asOf).toBe("2026-08-20");
    expect(isFresh(areas[0], TODAY)).toBe(false);
  });

  it("同じ code は今回の数字が勝つ", () => {
    const previous = [entry("07322", 32, "2026-08-20")];
    const { areas, carried } = mergeAreaDataset(
      [freshRow("07322", 41)],
      previous,
      TODAY,
    );

    expect(areas).toHaveLength(1);
    expect(areas[0].count).toBe(41);
    expect(areas[0].asOf).toBe(TODAY);
    expect(carried).toBe(0);
  });

  it("今回ぶんが先、引き継ぎは後ろ。同じ鮮度なら掲載の多い順", () => {
    // 引き継ぎが件数で上位に混ざると、一覧の先頭に古い数字が並ぶ。
    const previous = [entry("07322", 5000, "2026-08-20")];
    const { areas } = mergeAreaDataset(
      [freshRow("13101", 900), freshRow("23106", 1200)],
      previous,
      TODAY,
    );

    expect(areas.map((a) => a.code)).toEqual(["23106", "13101", "07322"]);
  });

  it("前回が空でも落ちない（初回のビルド）", () => {
    const { areas, carried } = mergeAreaDataset(
      [freshRow("13101", 900)],
      [],
      TODAY,
    );
    expect(areas).toHaveLength(1);
    expect(carried).toBe(0);
  });

  it("引き継ぎは積み上がる（前回の引き継ぎ分も残る）", () => {
    const previous = [
      entry("07322", 32, "2026-08-20"),
      entry("07323", 31, "2026-08-12"),
    ];
    const { areas, carriedCodes } = mergeAreaDataset([], previous, TODAY);
    expect(areas).toHaveLength(2);
    expect(carriedCodes.sort()).toEqual(["07322", "07323"]);
  });
});

describe("parsePreviousAreas", () => {
  it("前回の JSON を読む", () => {
    const raw = JSON.stringify({
      generatedAt: "2026-08-20T00:00:00.000Z",
      areas: [entry("07322", 32, "2026-08-20")],
    });
    expect(parsePreviousAreas(raw)).toHaveLength(1);
  });

  it("asOf の無い行はファイルの generatedAt で埋める", () => {
    // 埋めないと引き継いだ行の asOf が空文字になり、画面が
    // new Date("") を掴んで「Invalid Date」を出す。実ファイル
    // （1,068 行・asOf ゼロ）で再現した。
    //
    // 併合前は全行が同じ日に集計されていたので、ファイルの日付が答え。
    const raw = JSON.stringify({
      generatedAt: "2026-08-23T18:04:11.123Z",
      areas: [{ ...entry("07322", 32), asOf: undefined }],
    });
    expect(parsePreviousAreas(raw)[0].asOf).toBe("2026-08-23");
  });

  it("generatedAt も無ければ空のまま（読める側で落とす）", () => {
    const raw = JSON.stringify({
      areas: [{ ...entry("07322", 32), asOf: undefined }],
    });
    expect(parsePreviousAreas(raw)[0].asOf).toBe("");
  });

  it("asOf を持つ行は generatedAt で上書きしない", () => {
    const raw = JSON.stringify({
      generatedAt: "2026-08-23T18:04:11.123Z",
      areas: [entry("07322", 32, "2026-08-12")],
    });
    expect(parsePreviousAreas(raw)[0].asOf).toBe("2026-08-12");
  });

  it("asOf を持たない過去の JSON も読める（移行の 1 日目）", () => {
    // 既存の areaDirections.json には asOf が無い。読めずに空を返すと、
    // 移行した日に全件が「引き継ぎ無し」になって元の木阿弥になる。
    const raw = JSON.stringify({
      areas: [{ ...entry("07322", 32), asOf: undefined }],
    });
    const parsed = parsePreviousAreas(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe("07322");
  });

  it("無い・壊れている・形が違うときは空", () => {
    expect(parsePreviousAreas(null)).toEqual([]);
    expect(parsePreviousAreas("{")).toEqual([]);
    expect(parsePreviousAreas("{}")).toEqual([]);
    expect(parsePreviousAreas(JSON.stringify({ areas: "x" }))).toEqual([]);
  });

  it("code を持たない行は捨てる", () => {
    const raw = JSON.stringify({
      areas: [{ pref: "福島県" }, entry("07322", 32)],
    });
    expect(parsePreviousAreas(raw).map((a) => a.code)).toEqual(["07322"]);
  });
});
