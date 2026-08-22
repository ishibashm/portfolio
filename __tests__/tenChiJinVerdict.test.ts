import { describe, expect, it } from "vitest";
import {
  buildTenChiJinVerdict,
  type VerdictInput,
} from "@/utils/tenChiJinVerdict";

/**
 * 天・地・人の帯と文言を固定する。
 *
 * 直す前は、帯（総合 70 超で良好）と助言（凶殺なし・天人 50 以上で緑）が
 * **別々のしきい値**で動いていて、総合 70 の画面に「注意」バッジと
 * 「安心してそのまま計画を実行してください」が同居していた（利用者の指摘、
 * 実際のスクリーンショットあり）。
 *
 * ここで固定するのは「帯と文言が必ず同じ側を向くこと」。**旧実装
 * （助言だけ別条件で緑になる）に戻すと、このテストが落ちる。**
 */

function input(over: Partial<VerdictInput> = {}): VerdictInput {
  return {
    overallScore: 80,
    hasSevereClash: false,
    worstClashType: null,
    timeScore: 84,
    humanScore: 80,
    spaceScore: 78,
    timeRiskFactors: [],
    highAnsLoad: false,
    bestAlternativeDate: null,
    canApplyAction: false,
    ...over,
  };
}

describe("帯と文言は必ず同じ側を向く", () => {
  it("スクリーンショットの実例（総合70・天84・地60・人80）は、緑の安心文にならない", () => {
    const v = buildTenChiJinVerdict(
      input({
        overallScore: 70,
        timeScore: 84,
        spaceScore: 60,
        humanScore: 80,
      }),
    );
    expect(v.band).toBe("caution");
    expect(v.title).not.toContain("良好");
    expect(v.solution).not.toContain("安心してそのまま");
  });

  it("逆向きの食い違いも起きない（総合75でも天が45なら注意）", () => {
    // 旧実装では帯が良好・助言が琥珀で割れていた組み合わせ
    const v = buildTenChiJinVerdict(
      input({ overallScore: 75, timeScore: 45, spaceScore: 95 }),
    );
    expect(v.band).toBe("caution");
  });

  it("広い入力で総当たり: 良好の文言が出るのは band=good のときだけ", () => {
    for (let overall = 0; overall <= 100; overall += 5) {
      for (const clash of [false, true]) {
        for (const time of [30, 45, 50, 84]) {
          for (const human of [30, 80]) {
            const v = buildTenChiJinVerdict(
              input({
                overallScore: overall,
                hasSevereClash: clash,
                worstClashType: clash ? "五黄殺" : null,
                timeScore: time,
                humanScore: human,
              }),
            );
            const isReassuring =
              v.title.includes("良好") || v.solution.includes("そのまま進めて");
            expect(
              isReassuring,
              `overall=${overall} clash=${clash} time=${time} human=${human}`,
            ).toBe(v.band === "good");
          }
        }
      }
    }
  });
});

describe("帯のしきい値（元の実装の値のまま）", () => {
  it("総合 71 で良好、70 で注意（境目は 70 超）", () => {
    expect(buildTenChiJinVerdict(input({ overallScore: 71 })).band).toBe(
      "good",
    );
    expect(buildTenChiJinVerdict(input({ overallScore: 70 })).band).toBe(
      "caution",
    );
  });

  it("凶殺があれば、他がどれだけ良くても危険", () => {
    const v = buildTenChiJinVerdict(
      input({
        overallScore: 100,
        hasSevereClash: true,
        worstClashType: "暗剣殺",
      }),
    );
    expect(v.band).toBe("danger");
    expect(v.problem).toContain("暗剣殺");
  });

  it("バッジは日本語（EXCELLENT などの英語をやめた）", () => {
    expect(buildTenChiJinVerdict(input()).bandLabel).toBe("良好");
    expect(buildTenChiJinVerdict(input({ overallScore: 50 })).bandLabel).toBe(
      "注意",
    );
    expect(
      buildTenChiJinVerdict(input({ hasSevereClash: true })).bandLabel,
    ).toBe("危険");
  });
});

describe("文言の中身", () => {
  it("総合が注意帯のとき、いちばん低い軸を名指しする", () => {
    const v = buildTenChiJinVerdict(
      input({
        overallScore: 70,
        spaceScore: 60,
        timeScore: 84,
        humanScore: 80,
      }),
    );
    expect(v.problem).toContain("地（方位）");
    expect(v.problem).toContain("60%");
  });

  it("代替日があれば、注意帯では日付変更を提案する", () => {
    const v = buildTenChiJinVerdict(
      input({ overallScore: 70, bestAlternativeDate: "2026-09-03" }),
    );
    expect(v.actionType).toBe("DATE");
    expect(v.actionLabel).toContain("2026-09-03");
  });

  it("良好でも、さらに良い日があれば添える（隠さない）", () => {
    const v = buildTenChiJinVerdict(
      input({ bestAlternativeDate: "2026-09-03" }),
    );
    expect(v.band).toBe("good");
    expect(v.solution).toContain("2026-09-03");
  });

  it("完全にシンクロ、のような言い切りはどの帯でも出ない", () => {
    for (let overall = 0; overall <= 100; overall += 10) {
      const v = buildTenChiJinVerdict(input({ overallScore: overall }));
      expect(v.solution).not.toContain("完全に");
      expect(v.problem).not.toContain("エネルギー");
    }
  });
});
