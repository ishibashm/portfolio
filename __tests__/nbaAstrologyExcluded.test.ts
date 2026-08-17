import { describe, it, expect } from "vitest";
import { NBAEngine, NBAParams } from "@/utils/nbaEngine";

/**
 * 提案（NBA）の点数から**占星術を外した**ことの固定。
 *
 * ブログと手引きで「このサイトでは風水・奇門遁甲・ヴァーストゥは使って
 * いない」と書いているのに、判定の点数には
 *
 *   w_vedic  0.5   ヴェーダ占星術（ティティ＝月の日）
 *   w_ephem  0.4   西洋占星術（火星・土星のアスペクト）
 *   w_astro  0.6   西洋占星術（トランジットのソフト／ハード）
 *
 * が入っていた（EXECUTE_RELOCATION の場合。行動ごとに符号も違った）。
 * さらに重みとは別に、ヴェーダのティティが attention の鍵
 * （k_lunar）としても効いていた。**重みを 0 にするだけでは残る。**
 *
 * ## 何を固定するか
 *
 * 「重みが 0 である」ことを覗いて確かめるのではなく、**外から見て
 * 占星術の入力が答えを動かさないこと**を固定する。実装の形が変わっても
 * 意図が守られるし、重みを戻せば必ず落ちる。
 *
 *   1. 占星術の入力を広く振っても qValues が 1 つも動かない
 *   2. **占星術以外の入力なら動く**（1 が空回りしていないことの確認）
 *   3. 提案そのもの（suggestedAction）も動かない
 *
 * 2 が無いと「エンジンが何も見ていないから 1 が通る」のと区別できない。
 */

const baseState: NBAParams["stateVector"] = {
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
  /*
    **ragContext を必ず入れる。**これが無いと f9_personal が 0 になり、
    attention の問い（queries）が全部 0 → softmax が均等になる。均等だと
    鍵の中身を見なくなるので、「ヴェーダの鍵を抜いた」ことも
    「九星気学の盤が効いている」ことも試せない。**盤が効かない状態で
    「占星術も効かない」を確かめても意味がない。**
  */
  ragContext: {
    source: "test",
    personalBazi: {
      honmeiStar: { physical: 3, classical: 3 },
      // 年支の午に当てて天中殺を成立させ、f9_personal を 0 でなくする。
      // 0 のままだと queries が全部 0 になり、上と同じ理由で試せない。
      voidZodiac: ["午", "未"],
    },
    classicalRules: {
      pillars: {
        year: { gan: "丙", zhi: "午" },
        month: { gan: "甲", zhi: "寅" },
        day: { gan: "壬", zhi: "辰" },
      },
    },
  },
};

/**
 * 占星術の入力の振り方。**判定に効いていた頃なら、これで点数が動く。**
 *
 *   ティティ      1〜30（f5_vedic は -cos で ±1 に振れる）
 *   月の進み具合  0 / 0.5 / 1
 *   火星・土星    合（0度）から衝（180度）まで
 *   トランジット  ソフトだけ / ハードだけ / 混在
 */
function astrologyVariants(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  for (const tithi of [1, 8, 15, 23, 30]) {
    for (const moonProgress of [0, 0.5, 1]) {
      out.push({
        vedicAstrology: { tithi: `Tithi ${tithi}`, moonProgress },
      });
    }
  }

  for (const [mars, saturn] of [
    [0, 0],
    [0, 90],
    [0, 120],
    [0, 180],
    [45, 315],
    [270, 30],
  ]) {
    out.push({
      ephemerisData: {
        planetaryPositions: { mars: String(mars), saturn: String(saturn) },
      },
    });
  }

  for (const transits of [
    ["TRINE", "SEXTILE"],
    ["SQUARE", "OPPOSITION"],
    ["CONJUNCTION"],
    ["TRINE", "SQUARE", "OPPOSITION", "SEXTILE"],
    [],
  ]) {
    for (const retrogrades of [[], ["mercury"], ["mars", "saturn"]]) {
      out.push({ astrologyData: { source: "test", transits, retrogrades } });
    }
  }

  // 3 つ同時に最大まで振る（重みの符号が打ち消し合って見逃すのを防ぐ）
  out.push({
    vedicAstrology: { tithi: "Tithi 15", moonProgress: 1 },
    ephemerisData: {
      planetaryPositions: { mars: "0", saturn: "180" },
    },
    astrologyData: {
      source: "test",
      transits: ["SQUARE", "OPPOSITION"],
      retrogrades: ["mars"],
    },
  });

  return out;
}

const engine = new NBAEngine();

describe("提案の点数から占星術を外したこと", () => {
  it("占星術の入力をどう振っても qValues が動かない", async () => {
    const baseline = await engine.getNextBestAction({
      stateVector: baseState,
    });

    const moved: string[] = [];

    for (const variant of astrologyVariants()) {
      const result = await engine.getNextBestAction({
        stateVector: { ...baseState, ...variant },
      });

      for (const action of Object.keys(baseline.qValues)) {
        const before =
          baseline.qValues[action as keyof typeof baseline.qValues];
        const after = result.qValues[action as keyof typeof result.qValues];
        if (before !== after) {
          moved.push(
            `${action}: ${before} → ${after}（入力 ${JSON.stringify(variant)}）`,
          );
        }
      }
    }

    expect(moved).toEqual([]);
  });

  it("提案そのものも動かない", async () => {
    const baseline = await engine.getNextBestAction({ stateVector: baseState });

    for (const variant of astrologyVariants()) {
      const result = await engine.getNextBestAction({
        stateVector: { ...baseState, ...variant },
      });
      expect(result.suggestedAction, JSON.stringify(variant)).toBe(
        baseline.suggestedAction,
      );
    }
  });

  it("占星術以外の入力なら動く（上の 2 つが空回りしていないこと）", async () => {
    const baseline = await engine.getNextBestAction({ stateVector: baseState });

    /*
      エンジンが本当に入力を見ていることを、**使っている体系だけ**で示す。
      ここが動かなくなったら、上の 2 つは「何も見ていないから通る」に
      成り下がっているので、テストごと見直すこと。
    */
    const realInputs: { label: string; patch: Record<string, unknown> }[] = [
      { label: "自律神経の負荷", patch: { ansLoad: 95 } },
      { label: "遮蔽の余力", patch: { shieldCapacity: 5 } },
      { label: "環境リスク", patch: { environmentalRisk: 95 } },
      {
        label: "九星気学の盤",
        patch: { nineStarKi: { yearStar: 5, monthStar: 5, dayStar: 5 } },
      },
      {
        label: "宇宙天気（Kp 指数）",
        patch: {
          spaceWeather: { ...baseState.spaceWeather, kpIndex: 8.0 },
        },
      },
    ];

    for (const { label, patch } of realInputs) {
      const result = await engine.getNextBestAction({
        stateVector: { ...baseState, ...patch },
      });
      const changed = Object.keys(baseline.qValues).some(
        (action) =>
          baseline.qValues[action as keyof typeof baseline.qValues] !==
          result.qValues[action as keyof typeof result.qValues],
      );
      expect(changed, `${label} を変えても点数が動かない`).toBe(true);
    }
  });
});
