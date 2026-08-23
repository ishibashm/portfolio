import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { NBAEngine, type NBAParams } from "@/utils/nbaEngine";

/**
 * **本命星が NBA エンジンに届いていること**を見張る。
 *
 * `utils/nbaEngine` は `ragContext.personalBazi.honmeiStar` を読むが、
 * 応答を作る 3 か所のどれも入れていなかった。`personalBazi` は
 * `baziEngine.calculate()` の戻り値そのままで、そこに `honmeiStar` は無い。
 * `|| 5` に落ちて**全利用者が五黄**の扱いになっていた。
 *
 * ## 点数は変わらない
 *
 * 自己アテンション行列のうち読まれるのは
 *
 *   const dmToRiskAttention = attentionMatrix[2][4] || 0.2;
 *
 * **行 2（日主）だけ。**本命（行 0）と月命（行 1）は計算して捨てられる。
 * だから本命星が届いても qValues は 1 つも動かない。**変わるのは
 * NBA 画面の「自己アテンション行列」の見え方だけ。**
 *
 * この 2 つを両方固定する。片方だけだと
 *
 *   - 点数の固定だけ … 届いていなくても通る（空回り）
 *   - 表示の固定だけ … 点数が動く変更を見逃す
 */

const engine = new NBAEngine();

function stateWith(honmeiStar?: {
  physical: number;
  classical: number;
}): NBAParams["stateVector"] {
  return {
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
      personalBazi: {
        ...(honmeiStar ? { honmeiStar } : {}),
        voidZodiac: "午未",
      },
      classicalRules: {
        pillars: {
          year: { gan: "丙", zhi: "午" },
          month: { gan: "甲", zhi: "寅" },
          day: { gan: "壬", zhi: "辰" },
        },
      },
    },
  } as NBAParams["stateVector"];
}

describe("本命星と提案の点数", () => {
  it("本命星をどう振っても qValues は動かない", async () => {
    const baseline = await engine.getNextBestAction({
      stateVector: stateWith(),
    });
    const moved: string[] = [];

    for (let star = 1; star <= 9; star++) {
      const result = await engine.getNextBestAction({
        stateVector: stateWith({ physical: star, classical: star }),
      });
      for (const action of Object.keys(baseline.qValues)) {
        const before =
          baseline.qValues[action as keyof typeof baseline.qValues];
        const after = result.qValues[action as keyof typeof result.qValues];
        if (before !== after) moved.push(`本命星 ${star} / ${action}`);
      }
    }

    // 読まれるのは行 2 だけなので、本命星は点数に効かない。
    expect(moved).toEqual([]);
  });

  it("本命星は自己アテンション行列の本命の行を動かす", async () => {
    // ここが空回りしていると「届いていない」ことに気付けない。
    const baseline = await engine.getNextBestAction({
      stateVector: stateWith(),
    });
    const moved = new Set<number>();

    for (let star = 1; star <= 9; star++) {
      const result = await engine.getNextBestAction({
        stateVector: stateWith({ physical: star, classical: star }),
      });
      if (
        JSON.stringify(result.attentionMatrix[0]) !==
        JSON.stringify(baseline.attentionMatrix[0])
      ) {
        moved.add(star);
      }
    }

    // 5 だけは従来の `|| 5` と同じ値なので動かない。残り 8 つは動く。
    expect(moved.has(5)).toBe(false);
    expect(moved.size).toBe(8);
  });
});

/**
 * 応答を作る側の見張り。エンジンの振る舞いだけでは
 * 「ルートが入れ忘れている」ことを捕まえられない。
 */
const ROUTES = [
  "src/app/api/nba/route.ts",
  "src/app/api/nba/forecast/route.ts",
  "src/app/api/relocation/nba-evaluate/route.ts",
];

describe("応答に本命星を入れているか", () => {
  for (const file of ROUTES) {
    it(`${file}: personalBazi に honmeiStar を入れている`, () => {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      expect(
        /honmeiStar:\s*getHonmeiStar\(/.test(code),
        `honmeiStar を入れていない。エンジンは読むので、無いと全利用者が五黄になる`,
      ).toBe(true);
    });
  }
});
