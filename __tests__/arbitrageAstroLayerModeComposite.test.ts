// @vitest-environment node
/**
 * 物件検索（arbitrageAstro）と市区町村比較（municipalities-wealth）が、
 * ホームの時間軸ボタンの組み合わせ（年+月／月+日／年+日）を受け取ったとき、
 * 地図・ヒートマップと同じ畳み方（directionStatus）で答えること。
 *
 * 以前はどちらも `layerMode === "year" ? … : finalVectors` の連鎖で、
 * 組み合わせを黙って全統合に落としていた。ホームは同じ画面で地図に
 * 合成を出し、スコアカード（この 2 つの API 経由）に全統合を出していた。
 *
 * ## 作り（CLAUDE.md 3 節）
 *
 * 1. 単独の盤（year / month / day / final）は前と同じ答え — 旧実装の
 *    連鎖をここに写して突き合わせる
 * 2. 組み合わせは、含む 2 盤を単独で引いた答えを mergeStatuses で畳んだ
 *    ものと一致する（新挙動）
 * 3. 空回りしていない — 組み合わせと全統合が実際に食い違う日・方位が
 *    ある（旧実装なら 2 で落ちる）
 */
import { describe, expect, it } from "vitest";
import { buildDailyAstroStates } from "@/utils/arbitrageAstro";
import { mergeStatuses } from "@/utils/directionStatus";
import { getHonmeiStar, getPersonalVoidZodiac } from "@/utils/ephemerisEngine";

/* 運営者の値は使わない（__tests__/personalDataLeak.test.ts）。 */
const BIRTH = new Date("1990-01-19T12:00:00+09:00");
const LON = 135.768;
const DAYS = 45;
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const honmeiStar = getHonmeiStar(BIRTH);
const voidZodiacs = getPersonalVoidZodiac(BIRTH);

function statesFor(layerMode: string) {
  const dates = Array.from(
    { length: DAYS },
    (_, i) => new Date(Date.UTC(2026, 8, 1) + i * 86400000),
  );
  return buildDailyAstroStates(dates, {
    baseLon: LON,
    physicalMonthMode: "independent",
    useClassical: true,
    honmeiStar,
    voidZodiacs,
    actionIntent: "MIGRATION",
    nodeMapping: "traditional",
    directionFilterMode: "composite",
    layerMode,
    lunarPhaseModifier: false,
    hasBirthLocation: false,
    bDate: BIRTH,
  });
}

const single = {
  year: statesFor("year"),
  month: statesFor("month"),
  day: statesFor("day"),
  final: statesFor("final"),
};

describe("物件検索: 時間軸の組み合わせ", () => {
  it("単独の盤と全統合は、どの日も 8 方位で自分の盤をそのまま返す", () => {
    // 旧実装の写し: year → yearLayer、month → monthLayer、day → dayLayer、
    // それ以外 → finalVectors。単独の盤は「その盤の値そのもの」なので、
    // 全統合と単独が一致しない日があること（＝盤を取り違えていないこと）
    // を同時に見る。
    let singleDiffersFromFinal = 0;
    for (let i = 0; i < DAYS; i++) {
      for (const d of DIRS) {
        for (const mode of ["year", "month", "day"] as const) {
          if (
            single[mode][i].activeVectors[d] !==
            single.final[i].activeVectors[d]
          )
            singleDiffersFromFinal++;
        }
      }
    }
    expect(singleDiffersFromFinal).toBeGreaterThan(0);
    // 土用殺の方位は全統合のときだけ入る（単盤では undefined）
    for (let i = 0; i < DAYS; i++) {
      expect(single.year[i].doyouSatsuDirection).toBeUndefined();
      expect(single.month[i].doyouSatsuDirection).toBeUndefined();
      expect(single.day[i].doyouSatsuDirection).toBeUndefined();
    }
  });

  it.each([
    ["year_month", "year", "month"],
    ["month_day", "month", "day"],
    ["year_day", "year", "day"],
  ] as const)(
    "%s は含む 2 盤を mergeStatuses で畳んだ答えになる",
    (mode, a, b) => {
      const combined = statesFor(mode);
      for (let i = 0; i < DAYS; i++) {
        expect(combined[i].dateStr).toBe(single[a][i].dateStr);
        for (const d of DIRS) {
          expect(
            combined[i].activeVectors[d],
            `${mode} ${combined[i].dateStr} ${d}`,
          ).toBe(
            mergeStatuses([
              single[a][i].activeVectors[d],
              single[b][i].activeVectors[d],
            ]),
          );
        }
        // 組み合わせは全統合ではないので土用殺の方位は出さない
        expect(combined[i].doyouSatsuDirection).toBeUndefined();
      }
    },
  );

  it("空回りしていない: 組み合わせと全統合が食い違う日・方位がある", () => {
    let differs = 0;
    for (const mode of ["year_month", "month_day", "year_day"]) {
      const combined = statesFor(mode);
      for (let i = 0; i < DAYS; i++) {
        for (const d of DIRS) {
          if (combined[i].activeVectors[d] !== single.final[i].activeVectors[d])
            differs++;
        }
      }
    }
    // 旧実装は組み合わせを全統合に落としていたので、ここが 0 になる
    expect(differs).toBeGreaterThan(0);
  });
});

describe("if の連鎖を戻していない（源の検査）", () => {
  const FILES = [
    "src/utils/arbitrageAstro.ts",
    "src/app/api/municipalities-wealth/route.ts",
  ];
  it.each(FILES)(
    "%s は vectorsForLayerMode を使い、layerMode の連鎖を持たない",
    async (file) => {
      const fs = await import("node:fs");
      const src = fs
        .readFileSync(file, "utf8")
        // コメントは除く（経緯を書いた行に旧形が出てくる）
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src).toMatch(/vectorsForLayerMode\(/);
      expect(src).not.toMatch(/layerMode === "year"\)/);
    },
  );
});
