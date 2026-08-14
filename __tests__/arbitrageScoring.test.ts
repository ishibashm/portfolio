import { describe, expect, it } from "vitest";
import {
  CANDIDATE_STRATEGIES,
  DEFAULT_CANDIDATE_STRATEGY,
  isCandidateStrategy,
} from "@/utils/arbitrageScoring";

/**
 * 候補の切り出し方（抽出戦略）。
 *
 * 評価軸・重み・総合スコアのテストはここにあったが、機能ごと廃止した
 * （#304〜#308）ので消した。残るのは抽出戦略だけ。id は URL パラメータ
 * （candidateStrategy）としてそのまま流れ、SQL の ORDER BY の分岐
 * （arbitrageQuery の candidateOrderSql）と突き合うので、型が崩れると
 * 既定の割安順に黙って倒れる。
 */
describe("CANDIDATE_STRATEGIES", () => {
  it("既定の戦略が一覧に居る", () => {
    expect(
      CANDIDATE_STRATEGIES.some((s) => s.id === DEFAULT_CANDIDATE_STRATEGY),
    ).toBe(true);
  });

  it("id が重複していない（select の value が衝突しない）", () => {
    const ids = CANDIDATE_STRATEGIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("画面に出す label と説明が全戦略に付いている", () => {
    for (const s of CANDIDATE_STRATEGIES) {
      expect(s.label.length, s.id).toBeGreaterThan(0);
      expect(s.description.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe("isCandidateStrategy", () => {
  it("一覧の id だけを通す", () => {
    for (const s of CANDIDATE_STRATEGIES) {
      expect(isCandidateStrategy(s.id)).toBe(true);
    }
    expect(isCandidateStrategy("unknown")).toBe(false);
    expect(isCandidateStrategy("")).toBe(false);
  });
});
