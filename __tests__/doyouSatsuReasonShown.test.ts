/**
 * 土用殺の理由が画面に出ること。
 *
 * 土用殺は年盤・月盤・日盤のどれにも出ず、最終だけを NOISE_GOU
 * （＝どの画面でも「五黄殺」）にする。そのため、
 *
 *   年盤 大吉 / 月盤 大吉 / 日盤 大吉  なのに  段階 X（五大凶殺あり）
 *
 * という日ができて、理由が画面から分からなかった。しかも土用殺は
 * 五大凶殺（五黄殺・暗剣殺・破・本命殺・本命的殺）ではないので、
 * 段階のラベル自体も正確ではない。
 *
 * #568 で `DayVerdict.isDoyouSatsu` を足した。ここでは、
 *
 *   1. 判定側にその日が実在すること
 *   2. 画面まで値が渡っていること（配線）
 *
 * の 2 つを固定する。1 だけだと「印は出るが誰も読んでいない」に
 * 気付けない。実際、未使用のまま残った作りかけが何度も見つかっている。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { judgeDay, gradeVerdict } from "@/utils/auspiciousDays";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("土用殺の日が実在する", () => {
  it("三盤とも大吉なのに段階 X になり、土用殺の印が付く", () => {
    // 秋土用の北西。七赤・子丑空亡・明石。
    const v = judgeDay(new Date(Date.UTC(2026, 9, 23, 3)), {
      honmeiStar: 7,
      voidZodiacs: ["子", "丑"],
      lon: 135.75,
      direction: "NW",
      tenchusatsuMode: "off",
    });
    expect([v.yearLayer, v.monthLayer, v.dayLayer]).toEqual([
      "OPTIMAL",
      "OPTIMAL",
      "OPTIMAL",
    ]);
    expect(gradeVerdict(v)).toBe("X");
    expect(v.isDoyouSatsu).toBe(true);
  });
});

describe("画面まで配線されている", () => {
  const spot = read("src/components/relocation/SpotVerdict.tsx");
  const arbitrage = read("src/app/relocation/arbitrage/page.tsx");
  /* 判定を組む本体は page.tsx から lib/dayKigakuClient に切り出した
     （初回読み込みから暦エンジンを外すため。import() で遅延して呼ぶ）。
     配線の検査は「組む側」と「載せる側」の両方を見る。 */
  const dayKigaku = read("src/lib/dayKigakuClient.ts");

  it("SpotVerdict の DirectionCell が土用殺を受け取る", () => {
    expect(spot).toContain("doyouSatsu?: boolean;");
  });

  it("SpotVerdict が土用殺の理由を出す", () => {
    // 天中殺と同じく「段階とは別の 1 行」で理由を出す。
    expect(spot).toContain("cell?.doyouSatsu &&");
    expect(spot).toContain("土用殺の方位です");
  });

  it("arbitrage が判定の値をセルに載せている", () => {
    // 組む側: 土用殺の印を段階と一緒にセルへ入れている
    expect(dayKigaku).toContain("doyouSatsu: v.isDoyouSatsu,");
    // 載せる側: page.tsx はその結果を遅延して受け取り、SpotVerdict に渡す
    expect(arbitrage).toContain('import("@/lib/dayKigakuClient")');
    expect(arbitrage).toContain("dirKigaku={dayKigaku?.byDirection}");
  });

  it("天中殺の理由も残っている（置き換えではなく追加）", () => {
    expect(spot).toContain("cell?.blocked &&");
    expect(spot).toContain("天中殺により");
  });
});
