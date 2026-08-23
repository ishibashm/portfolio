import { describe, expect, it } from "vitest";
import { NBAEngine, type NBAParams } from "@/utils/nbaEngine";
import {
  NBA_ATTENTION_KEYS,
  NBA_ATTENTION_QUERIES,
  NBA_ATTENTION_FALLBACK,
} from "@/lib/nbaAttentionKeys";

/**
 * 自己アテンション行列の**列がずれていない**ことを見張る。
 *
 * #380 でヴェーダのティティ（月相）を鍵から抜いたとき、エンジン側の添字は
 * 5 → 4 に直したが、**画面側の見出しを 6 列のまま残した。**その結果
 *
 *   「月相」の列に  宇宙（Kp）の値
 *   「宇宙」の列に  リスクの値
 *   「リスク」の列は 空
 *
 * が出ていた。#380 のコメントに「鍵を足し引きするときは、必ず添字と
 * 既定値を一緒に見ること」と書いておきながら、見たのはエンジン側だけだった。
 *
 * **字面ではなく、エンジンが実際に返す行列の形と突き合わせる。**
 * 鍵を足しても減らしても、見出しを直さなければここで落ちる。
 */

const state: NBAParams["stateVector"] = {
  ansLoad: 30,
  shieldCapacity: 80,
  environmentalNoise: "Low",
  environmentalRisk: 40,
  solarPhase: 120,
  spaceWeather: {
    kpIndex: 2.0,
    xrayFlux: "A1.0",
    solarWindSpeed: 380,
    timestamp: "2026-06-12T12:00:00Z",
    riskScore: 20,
  },
  qiMenGate: {
    name: "生門",
    direction: "NE",
    description: "Life Gate",
    status: "Auspicious",
  },
  nineStarKi: { yearStar: 4, monthStar: 3, dayStar: 2 },
  isVoidTime: false,
  isConflictDay: false,
  isDoyouHazard: false,
  ragContext: {
    source: "test",
    personalBazi: { voidZodiac: "午未" },
    classicalRules: {
      pillars: {
        year: { gan: "丙", zhi: "午" },
        month: { gan: "甲", zhi: "寅" },
        day: { gan: "壬", zhi: "辰" },
      },
    },
  },
} as NBAParams["stateVector"];

describe("自己アテンション行列の見出し", () => {
  it("列の数がエンジンの鍵の数と一致する", async () => {
    const engine = new NBAEngine();
    const result = await engine.getNextBestAction({ stateVector: state });
    // エンジンは平らに返す。API 側が actionResult の下に入れ直している
    // （NBADashboard は data.nba.actionResult.attentionMatrix で読む）。
    const matrix = result.attentionMatrix;

    expect(matrix, "attentionMatrix が返ってこない").toBeTruthy();
    for (const row of matrix) {
      expect(
        row.length,
        `見出しは ${NBA_ATTENTION_KEYS.length} 列だが、エンジンは ${row.length} 個の鍵を返した。` +
          `片方だけ変えると列がずれる（#380 でずれた）`,
      ).toBe(NBA_ATTENTION_KEYS.length);
    }
  });

  it("行の数がエンジンの問いの数と一致する", async () => {
    const engine = new NBAEngine();
    const result = await engine.getNextBestAction({ stateVector: state });
    expect(result.attentionMatrix.length).toBe(NBA_ATTENTION_QUERIES.length);
  });

  it("行列が来なかったときの既定値も列の数に合っている", () => {
    // 以前は 6 個（0.16 × 5 + 0.17）のまま置かれていた。
    expect(NBA_ATTENTION_FALLBACK).toHaveLength(NBA_ATTENTION_KEYS.length);
    const sum = NBA_ATTENTION_FALLBACK.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("鍵の名前が重複していない", () => {
    // 見出しがずれたとき、同じ名前が並んでいると気付きにくい。
    const shorts = NBA_ATTENTION_KEYS.map((k) => k.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});
