import { describe, expect, it } from "vitest";
import { stepDayTier } from "@/lib/stepTier";
import { gradeVerdict, isAuspicious } from "@/utils/auspiciousDays";

/**
 * シミュレータの「出発日の段階」がカレンダーと同じ規則で決まることの検証。
 *
 * 発端は利用者の指摘「評価が色々ありすぎて何を信じればいいか分からない」。
 * シミュレータだけが nbaEngine の Q 値（他のどの画面にも出ない指標）で
 * 出発日の良し悪しを出していた。#698 で 12 か月の見通しを段階評価に
 * 置き換えたのに続き、シミュレータも同じ段階に寄せた。
 *
 * stepDayTier は段階の割り当てを自分で書かず gradeVerdict に渡すだけ、
 * というのがこの置き換えの肝。ここではその「渡し方」——特に
 * isTripleAuspicious の組み立て——が auspiciousDays.verdict と同じ式で
 * あることを固定する。
 */

const ev = (
  status: string,
  yearLayer: string,
  monthLayer: string,
  dayLayer: string,
) => ({ status, details: { yearLayer, monthLayer, dayLayer } });

describe("stepDayTier", () => {
  it("全部 SAFE なら C（平）", () => {
    expect(stepDayTier(ev("SAFE", "SAFE", "SAFE", "SAFE"))).toBe("C");
  });

  it("三盤すべて吉で最終も吉なら S（三盤吉）", () => {
    expect(
      stepDayTier(ev("OPTIMAL", "OPTIMAL_REGULAR", "OPTIMAL", "OPTIMAL")),
    ).toBe("S");
  });

  it("吉 2 盤なら A、吉 1 盤なら B", () => {
    expect(stepDayTier(ev("SAFE", "OPTIMAL", "OPTIMAL", "SAFE"))).toBe("A");
    expect(stepDayTier(ev("SAFE", "OPTIMAL", "SAFE", "SAFE"))).toBe("B");
  });

  it("五大凶殺（五黄殺など）が 1 盤でもあれば X", () => {
    expect(stepDayTier(ev("NOISE_GOU", "NOISE_GOU", "SAFE", "SAFE"))).toBe("X");
    expect(stepDayTier(ev("SAFE", "SAFE", "NOISE_ANKEN", "OPTIMAL"))).toBe("X");
  });

  it("軽い凶（月命殺など）は D", () => {
    expect(
      stepDayTier(ev("NOISE_GETSUMEI", "SAFE", "SAFE", "NOISE_GETSUMEI")),
    ).toBe("D");
  });

  it("最終が凶なら、層が全部 SAFE でも吉にならない", () => {
    // 本命的殺は五大凶殺の 1 つ（noiseSeverity.FIVE_FATAL_NOISES）なので X
    expect(stepDayTier(ev("NOISE_TEKI", "SAFE", "SAFE", "SAFE"))).toBe("X");
    // 月命殺は五大凶殺ではないので D
    expect(stepDayTier(ev("NOISE_GETSUMEI", "SAFE", "SAFE", "SAFE"))).toBe("D");
  });

  it("gradeVerdict に自前の isTripleAuspicious を渡した結果と常に一致する（総当たり）", () => {
    const STATUSES = [
      "SAFE",
      "OPTIMAL",
      "OPTIMAL_REGULAR",
      "WARNING",
      "NOISE_GOU",
      "NOISE_ANKEN",
      "NOISE_HA",
      "NOISE_VOID",
      "NOISE_HONMEI",
      "NOISE_GETSUMEI",
      "NOISE_NODE",
    ];
    for (const f of STATUSES)
      for (const y of STATUSES)
        for (const m of STATUSES)
          for (const d of STATUSES) {
            const viaStep = stepDayTier(ev(f, y, m, d));
            const direct = gradeVerdict({
              finalStatus: f,
              yearLayer: y,
              monthLayer: m,
              dayLayer: d,
              // auspiciousDays.verdict と同じ式（最終と 3 層すべてが吉）
              isTripleAuspicious:
                isAuspicious(f) &&
                isAuspicious(y) &&
                isAuspicious(m) &&
                isAuspicious(d),
            });
            expect(viaStep).toBe(direct);
          }
  });
});
