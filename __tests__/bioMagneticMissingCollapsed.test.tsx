import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BioMagneticDashboard } from "@/components/BioMagneticDashboard";

/**
 * 取れていない実測値は、空の計器を並べない。
 *
 * Kp・太陽 X 線・気圧はどれも外部の配信で、届かないことが珍しくない。
 * 以前は届かないときも枠・円グラフ・目盛りをそのまま描いて中身だけ
 * 「-」「--」にしていた。400px で実測すると、**何も分からない計器が
 * 439px ぶん**並んでいた（#1327 で順序は直したが、空の計器は残っていた）。
 *
 * 直したあとは 228px。ただし「取れていない」ことは消さない — 消すと
 * 「その日は静かだった」と読めてしまうので、末尾に 1 行でまとめる。
 *
 * 数を数えるのではなく、**計器そのものが描かれているか**で見る
 * （目盛りの `A B C M X` と円グラフの `<circle>`、気圧の 3 つの欄）。
 */

const ALL_MISSING = {
  kpIndex: null,
  xrayFlux: null,
  magneticF: 46890,
  magneticD: -7.94,
  magneticI: 49.56,
  eot: 0,
  pressure: null,
};

describe("BioMagneticDashboard: 取れていない実測値", () => {
  it("全部取れていないときは計器を描かず、1 行にまとめる", () => {
    const { container } = render(<BioMagneticDashboard {...ALL_MISSING} />);

    // Kp の円グラフ・X 線の目盛り・気圧の 3 欄が、どれも出ていない
    // lucide の飾りにも <circle> があるので、Kp の円グラフ（r=24）で見る
    expect(container.querySelectorAll('circle[r="24"]').length).toBe(0);
    expect(screen.queryByText("Kp 指数（0〜9）")).toBeNull();
    expect(screen.queryByText("太陽 X 線")).toBeNull();
    expect(screen.queryByText("地上気圧（3 時間の変化）")).toBeNull();
    expect(screen.queryByText("自律神経負荷")).toBeNull();

    // 代わりに 1 行でまとめる。何が欠けているかは名指しする
    const line = screen.getByText(/取得できていません/);
    expect(line.textContent).toContain("地磁気 Kp");
    expect(line.textContent).toContain("太陽 X 線");
    expect(line.textContent).toContain("地上気圧");

    // 外部の配信が 1 つも無いのに「実測」とは名乗らない
    expect(screen.queryByText("実測")).toBeNull();
    expect(screen.getByText("計算値のみ")).toBeTruthy();

    // 計算で出るもの（WMM）は残る
    expect(screen.getByText("全磁力 F")).toBeTruthy();
  });

  it("届いているものは今までどおり計器で描く", () => {
    const { container } = render(
      <BioMagneticDashboard
        {...ALL_MISSING}
        kpIndex={3.7}
        xrayFlux="C2.1"
        pressure={{ current: 1008.3, drop: -4.2 }}
      />,
    );

    expect(container.querySelectorAll('circle[r="24"]').length).toBe(2);
    expect(screen.getByText("Kp 指数（0〜9）")).toBeTruthy();
    expect(screen.getByText("C2.1")).toBeTruthy();
    expect(screen.getByText("地上気圧（3 時間の変化）")).toBeTruthy();
    expect(screen.getByText("実測")).toBeTruthy();

    // 欠けが無いので、まとめの 1 行は出さない
    expect(screen.queryByText(/取得できていません/)).toBeNull();
  });

  it("一部だけ届いているときは、欠けたものだけを 1 行に挙げる", () => {
    render(<BioMagneticDashboard {...ALL_MISSING} kpIndex={2.3} />);

    expect(screen.getByText("Kp 指数（0〜9）")).toBeTruthy();
    const line = screen.getByText(/取得できていません/);
    expect(line.textContent).not.toContain("地磁気 Kp");
    expect(line.textContent).toContain("太陽 X 線");
    expect(line.textContent).toContain("地上気圧");

    // 1 つでも届いていれば「実測」のまま
    expect(screen.getByText("実測")).toBeTruthy();
  });

  it("偏角 0 度を「取れていない」と読まない", () => {
    // `magneticD ? …` は 0 を falsy として弾いていた。日本では 0 度に
    // ならないが、**値の有無を truthy で見るのが誤り**なので直した。
    render(<BioMagneticDashboard {...ALL_MISSING} magneticD={0} />);
    expect(screen.getByText(/^0\.00$/)).toBeTruthy();
  });
});
