import { describe, expect, it } from "vitest";
import { decodeBlockCause, encodeBlockCause } from "@/lib/blockCause";

/*
  時期の走査は方位ごとに段階（S〜X）しか返さず、「五大凶殺あり」が
  本命殺なのか五黄殺なのかを画面が言えなかった。同行者の帯で
  「私（東）が 506 日『五大凶殺あり』」と出ても、年盤の本命的殺
  （その気学年は待っても戻らない）だとは伝わらない（利用者報告
  2026-09-19）。符号で理由を運ぶ。
*/
describe("塞いでいる理由の符号", () => {
  it("年盤の凶を最初に採る（月盤・日盤に別の凶があっても）", () => {
    expect(encodeBlockCause("NOISE_TEKI", "NOISE_GOU", "SAFE")).toBe("yT");
    expect(decodeBlockCause("yT")).toBe("年盤の本命的殺");
  });

  it("年盤が平なら月盤、月盤も平なら日盤", () => {
    expect(encodeBlockCause("SAFE", "NOISE_GOU", "NOISE_HA")).toBe("mG");
    expect(encodeBlockCause("OPTIMAL", "SAFE", "NOISE_ANKEN")).toBe("dA");
  });

  it("五大凶殺を軽い凶より先に採る（軽い凶が上の盤にあっても）", () => {
    // 年盤は月交点（軽い凶）、日盤は暗剣殺（五大凶殺）→ 日盤の暗剣殺
    expect(encodeBlockCause("NOISE_NODE", "SAFE", "NOISE_ANKEN")).toBe("dA");
  });

  it("破は盤で名前が変わる", () => {
    expect(decodeBlockCause("yH")).toBe("年盤の歳破");
    expect(decodeBlockCause("mH")).toBe("月盤の月破");
    expect(decodeBlockCause("dH")).toBe("日盤の日破");
  });

  it("凶が無ければ空", () => {
    expect(encodeBlockCause("OPTIMAL", "SAFE", "SAFE")).toBe("");
    expect(encodeBlockCause(undefined, undefined, undefined)).toBe("");
    expect(decodeBlockCause("")).toBe("");
    expect(decodeBlockCause(undefined)).toBe("");
  });

  it("知らない凶は「凶」、壊れた符号は空", () => {
    expect(encodeBlockCause("NOISE_SOMETHING", "SAFE", "SAFE")).toBe("y?");
    expect(decodeBlockCause("y?")).toBe("年盤の凶");
    expect(decodeBlockCause("zM")).toBe("");
    expect(decodeBlockCause("yZ")).toBe("");
    expect(decodeBlockCause("yMM")).toBe("");
  });

  it("往復で名前が揃う", () => {
    for (const [code, name] of [
      ["yG", "年盤の五黄殺"],
      ["mA", "月盤の暗剣殺"],
      ["yM", "年盤の本命殺"],
      ["dV", "日盤の天中殺方位"],
      ["mN", "月盤の羅睺・計都軸"],
    ]) {
      expect(decodeBlockCause(code)).toBe(name);
    }
  });
});
