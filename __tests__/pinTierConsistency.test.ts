import { describe, expect, it } from "vitest";

import { getPropertyPinColors } from "@/utils/arbitrageHelpers";
import {
  gradeVerdict,
  judgeDayAllDirections,
  ALL_DIRECTIONS,
} from "@/utils/auspiciousDays";

/**
 * 地図と時期パネルの食い違いの回帰テスト。
 *
 * 症状は「地図では南が緑（吉）なのに、方位×月のセルでは北西・東・西が S」。
 * 原因は 2 本の別経路だった。
 *
 *   ・地図の扇形とピン … サーバが layerMode（既定は年盤）で出した
 *     単盤の status。年盤だけ吉なら緑になる。
 *   ・時期パネルのセル … 三盤（年・月・日）を合成した段階。しかも
 *     セルは「その月の最良」で、選択日の判定ではない。
 *
 * 修正後は、扇形・ピン・「選択日」列がすべて gradeVerdict の段階を読む。
 * ここでは (1) 段階が単盤の status を上書きすること、(2) 実際に
 * 単盤と三盤がずれる日が存在すること、の 2 点を固定する。
 */

describe("ピンの色は三盤の段階に従う", () => {
  /** 年盤だけ見れば「吉方位」に見える物件 */
  const yearBoardLooksGood = {
    astrologyStatus: "SAFE",
    isTendo: true,
    direction: "S",
    dateScores: [null, null, null, { scoreDetails: {} }],
  };

  it("段階を渡さなければ従来どおり単盤の status で決まる", () => {
    expect(getPropertyPinColors(yearBoardLooksGood).label).toBe("吉");
  });

  it("三盤で五大凶殺（X）なら、単盤が吉でもピンは五大凶殺", () => {
    expect(getPropertyPinColors(yearBoardLooksGood, "X").label).toBe(
      "五大凶殺",
    );
  });

  it("三盤で軽い凶（D）なら軽い凶", () => {
    expect(getPropertyPinColors(yearBoardLooksGood, "D").label).toBe("軽い凶");
  });

  it("天中殺で塞がっている方位は段階に関わらず天中殺", () => {
    expect(getPropertyPinColors(yearBoardLooksGood, "S", true).label).toBe(
      "天中殺",
    );
  });

  it("段階が渡れば良い段階でも語彙は段階のもの（超吉・吉などの旧語彙は使わない）", () => {
    // 同じ地図に「三盤吉/S」と「超吉/吉」の 2 系統が並ぶのが
    // 食い違いの原因だった。段階があるときは常に段階の語彙。
    expect(getPropertyPinColors(yearBoardLooksGood, "S").label).toBe("三盤吉");
    expect(getPropertyPinColors(yearBoardLooksGood, "A").label).toBe("吉2盤");
    expect(getPropertyPinColors(yearBoardLooksGood, "B").label).toBe("吉1盤");
    expect(getPropertyPinColors(yearBoardLooksGood, "C").label).toBe("平");
  });

  it("扇形・県塗り・ピンで同じ段階は同じ色（tierDisplay が唯一の情報源）", async () => {
    const { TIER_FILL } = await import("@/utils/tierDisplay");
    expect(getPropertyPinColors(yearBoardLooksGood, "S").fillColor).toBe(
      TIER_FILL.S,
    );
    expect(getPropertyPinColors(yearBoardLooksGood, "X").fillColor).toBe(
      TIER_FILL.X,
    );
  });
});

describe("単盤と三盤は実際にずれる（食い違いの再現）", () => {
  // 報告時と同じ条件。本命7・天中殺 子丑・京都あたり。
  const params = {
    honmeiStar: 7,
    voidZodiacs: ["子", "丑"],
    lon: 135.75,
    tenchusatsuMode: "strict" as const,
    involuntaryMove: false,
    directionFilterMode: "composite",
  };

  it("年盤が凶でない方位でも、三盤では X になる日がある", () => {
    const all = judgeDayAllDirections(
      new Date("2026-08-10T12:00:00+09:00"),
      params,
    );
    // 年盤だけを見ると通れるのに、月盤か日盤の五大凶殺で X に落ちる方位
    const split = ALL_DIRECTIONS.filter((d) => {
      const v = all[d];
      return !v.yearLayer.startsWith("NOISE") && gradeVerdict(v) === "X";
    });
    expect(split.length).toBeGreaterThan(0);
  });

  it("同じ方位でも日によって段階が変わる（月のセル＝その月の最良、と読み違えないこと）", () => {
    const d10 = judgeDayAllDirections(
      new Date("2026-08-10T12:00:00+09:00"),
      params,
    );
    const d12 = judgeDayAllDirections(
      new Date("2026-08-12T12:00:00+09:00"),
      params,
    );
    // 8/10 の北西は X だが 8/12 の北西は S。マトリクスの 08 列が S でも
    // 選択日（8/10）の地図が赤いのは矛盾ではない。
    expect(gradeVerdict(d10.NW)).toBe("X");
    expect(gradeVerdict(d12.NW)).toBe("S");
  });
});
