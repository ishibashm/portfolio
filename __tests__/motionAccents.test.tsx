import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CompassDial } from "@/components/motion/CompassDial";
import { CountUp } from "@/components/motion/CountUp";
import { TwinkleStars } from "@/components/motion/TwinkleStars";
import { Burst } from "@/components/motion/Burst";
import { InViewOnce } from "@/components/motion/InViewOnce";
import GuideCharacter from "@/components/guide/GuideCharacter";

/**
 * 動きの飾り（docs/motion-accents.md）。
 * - 動かない経路（prefers-reduced-motion・JS の機能なし）で最終の絵・最終の値が出る
 * - 飾りは aria-hidden
 * - 動きは transform / opacity だけ、no-preference の中だけ
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const css = readFileSync("src/app/globals.css", "utf8");
const motionCss = css.slice(css.indexOf("動きの飾り"));

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: reduce && q.includes("reduce"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
}

describe("CSS の決まり", () => {
  it("アニメーションは no-preference の中にだけある（reduce では最終の絵）", () => {
    const noPref = motionCss.indexOf(
      "@media (prefers-reduced-motion: no-preference)",
    );
    expect(noPref).toBeGreaterThan(-1);
    const before = motionCss.slice(0, noPref);
    expect(before).not.toMatch(/animation\s*:/);
    // 針の最終の向きは既定で効いている
    expect(before).toMatch(
      /\.motion-needle\s*{[^}]*rotate\(var\(--needle-angle/,
    );
    // reduce ではバーストを出さない
    expect(before).toMatch(
      /prefers-reduced-motion: reduce\)\s*{\s*\.motion-burst\s*{\s*display:\s*none/,
    );
  });

  it("keyframes で動かすのは transform と opacity だけ（CLS を起こさない）", () => {
    const frames = [
      ...motionCss.matchAll(/@keyframes [\w-]+\s*{([\s\S]*?)\n  }/g),
    ];
    expect(frames.length).toBeGreaterThanOrEqual(8);
    for (const [, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
  });

  it("スクロールのフェードインは JS を使わず、未対応ブラウザでは見えたまま", () => {
    expect(motionCss).toMatch(
      /@supports \(animation-timeline: view\(\)\)\s*{\s*\.motion-reveal/,
    );
  });
});

describe("羅盤の針と線画", () => {
  it("針は吉方位の角度を持ち、絵全体は aria-hidden", () => {
    const { container } = render(
      <CompassDial needle="SE" marks={["SE", "W"]} labels />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const needle = container.querySelector(".motion-needle") as SVGGElement;
    expect(needle.style.getPropertyValue("--needle-angle")).toBe("135deg");
    expect(container.querySelectorAll(".motion-ray")).toHaveLength(8);
  });

  it("針を渡さなければ線画だけ", () => {
    const { container } = render(<CompassDial />);
    expect(container.querySelector(".motion-needle")).toBeNull();
  });

  it("年・星の頁で 1 つめの吉方位を指し、意味は文でも書く", () => {
    const src = readFileSync("src/app/houi/[year]/[star]/page.tsx", "utf8");
    expect(src).toContain("needle={good[0].direction}");
    expect(src).toContain("金の針は{good[0].jp}を指しています");
  });

  it("h1 には動きを付けない（線画は h1 の外の飾り）", () => {
    for (const f of ["src/app/page.tsx", "src/app/houi/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/<h1[^>]*motion-/);
      expect(src).toMatch(/<CompassDial[\s\S]*?pointer-events-none absolute/);
    }
  });
});

describe("カウントアップ", () => {
  it("動きを減らす設定では最初から最終値", () => {
    stubMatchMedia(true);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(<CountUp value={37} />);
    expect(screen.getByText("37")).toBeTruthy();
  });

  it("IntersectionObserver が無い環境でも最終値", () => {
    stubMatchMedia(false);
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<CountUp value={12} />);
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("動かすときは 0 から始めて最終値で止まり、桁の幅を先に取る", async () => {
    stubMatchMedia(false);
    let fire: (() => void) | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        cb: IntersectionObserverCallback;
        constructor(cb: IntersectionObserverCallback) {
          this.cb = cb;
        }
        observe() {
          fire = () =>
            this.cb(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as never,
            );
        }
        disconnect() {}
      },
    );
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) =>
      frames.push(f),
    );
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { container } = render(<CountUp value={250} durationMs={1000} />);
    const span = container.querySelector("span")!;
    expect(span.textContent).toBe("0");
    expect(span.style.minWidth).toBe("3ch");
    act(() => fire!());
    now = 2000;
    act(() => {
      while (frames.length) frames.shift()!(now);
    });
    expect(span.textContent).toBe("250");
  });
});

describe("星・バースト・名札の光・浮遊", () => {
  it("星は aria-hidden の飾り", () => {
    render(<TwinkleStars />);
    const el = screen.getByTestId("twinkle-stars");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelectorAll(".motion-twinkle")).toHaveLength(12);
  });

  it("バーストは aria-hidden", () => {
    render(<Burst />);
    expect(screen.getByTestId("motion-burst").getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("三盤吉の日を ☆ に残したときだけ鳴らす", () => {
    const src = readFileSync(
      "src/components/relocation/AuspiciousDayFinder.tsx",
      "utf8",
    );
    expect(src).toMatch(/if \(!on && \(d\.tier \?\? "S"\) === "S"\)/);
    expect(src).toContain("<CountUp value={s.tripleAuspiciousDays} />");
  });

  it("IntersectionObserver が無ければ名札は光らせない（data-inview なし）", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<InViewOnce className="motion-sweep">初代 案内役</InViewOnce>);
    expect(
      screen.getByText("初代 案内役").getAttribute("data-inview"),
    ).toBeNull();
  });

  it("名札は motion-sweep、float を渡すとイラストが motion-float", () => {
    const { container } = render(
      <GuideCharacter pose="magnifier" float>
        こんにちは
      </GuideCharacter>,
    );
    expect(screen.getByText("初代 案内役").className).toContain("motion-sweep");
    expect(container.querySelector("picture")!.className).toContain(
      "motion-float",
    );
  });

  it("404 とトップの案内役は浮く", () => {
    expect(readFileSync("src/app/not-found.tsx", "utf8")).toMatch(
      /<GuideCharacter[^>]*\bfloat\b/,
    );
    expect(readFileSync("src/components/home/AgentEntry.tsx", "utf8")).toMatch(
      /pose="pointing"[\s\S]{0,40}\bfloat\b/,
    );
  });
});
