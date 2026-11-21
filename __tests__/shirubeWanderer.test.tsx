import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
import {
  createInitialWanderState,
  getWanderBounds,
  getWanderConfig,
  stepWanderState,
} from "@/components/guide/shirubeWanderLogic";
import { NON_CORE_DISALLOW } from "@/lib/siteStructure";
import { metadata as demoMetadata } from "@/app/demo/shirube/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("reduce"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("ShirubeWanderer", () => {
  it("公式 pointing イラストを GuideAvatar 経由で表示し、float やちび版を使わない", () => {
    stubMatchMedia(true);
    const { container } = render(<ShirubeWanderer />);

    const picture = container.querySelector("picture")!;
    expect(picture).toBeTruthy();
    expect(picture.className).not.toContain("motion-float");

    const sources = [...container.querySelectorAll("source")];
    expect(sources.map((s) => s.getAttribute("type"))).toEqual([
      "image/avif",
      "image/webp",
    ]);
    expect(sources[0].getAttribute("srcset")).toContain(
      "/guide/shirube-pointing-96.avif 96w",
    );

    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/guide/shirube-pointing-240.webp");
    expect(img.getAttribute("src")).not.toContain("chibi");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("240");
    expect(img.getAttribute("height")).toBe("296");
  });

  it("prefers-reduced-motion: reduce のときは rAF を回さず transform 移動しない", () => {
    stubMatchMedia(true);
    const rafSpy = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", rafSpy);

    render(<ShirubeWanderer />);

    const stage = screen.getByTestId("shirube-wanderer");
    const actor = screen.getByTestId("shirube-wanderer-actor");
    expect(stage.getAttribute("data-motion")).toBe("reduced");
    expect(stage.getAttribute("data-state")).toBe("idle");
    expect(actor.style.transform).toBe("");
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("forceReducedMotion=true なら OS が通常でも静止する", () => {
    stubMatchMedia(false);
    const rafSpy = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", rafSpy);

    render(<ShirubeWanderer forceReducedMotion />);

    const stage = screen.getByTestId("shirube-wanderer");
    const actor = screen.getByTestId("shirube-wanderer-actor");
    expect(stage.getAttribute("data-motion")).toBe("reduced");
    expect(stage.getAttribute("data-state")).toBe("idle");
    expect(actor.style.transform).toBe("");
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("no-preference のときは画面下端を translate3d でゆっくり移動する", () => {
    stubMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });

    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0.2);

    render(<ShirubeWanderer />);

    const stage = screen.getByTestId("shirube-wanderer");
    const actor = screen.getByTestId("shirube-wanderer-actor");
    expect(stage.getAttribute("data-motion")).toBe("active");
    const initialTransform = actor.style.transform;
    expect(initialTransform).toMatch(/^translate3d\([\d.]+px, 0, 0\)$/);

    act(() => {
      now = 80;
      frames.shift()?.(now);
      now = 160;
      frames.shift()?.(now);
    });

    expect(actor.style.transform).not.toBe(initialTransform);
  });

  it("ラッパーと既定のキャラはポインタを塞がず、onInteract 指定時だけ小さなボタンになる", () => {
    stubMatchMedia(true);
    const { rerender } = render(<ShirubeWanderer />);

    const stage = screen.getByTestId("shirube-wanderer");
    expect(stage.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();

    const onInteract = vi.fn();
    rerender(<ShirubeWanderer onInteract={onInteract} />);
    const btn = screen.getByRole("button", { name: /しるべ/ });
    fireEvent.click(btn);
    expect(onInteract).toHaveBeenCalledTimes(1);
  });
});

describe("shirubeWanderLogic", () => {
  it("画面幅に収まる範囲を歩き、目標に着くと立ち止まり、その後向きを変えて再び歩く", () => {
    const bounds = getWanderBounds(1000, 80, 16);
    const config = getWanderConfig(1000);
    let state = createInitialWanderState(bounds, config, () => 0.1);

    expect(state.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(state.x).toBeLessThanOrEqual(bounds.maxX);
    expect(state.phase).toBe("walking");

    // 目標まで進める
    for (let i = 0; i < 400 && state.phase === "walking"; i += 1) {
      state = stepWanderState(state, 50, bounds, config, () => 0.5);
    }
    expect(state.phase).toBe("paused");
    expect(state.x).toBe(state.targetX);

    // 立ち止まりが終わるまで進めると turning または walking へ移る
    for (let i = 0; i < 200 && state.phase === "paused"; i += 1) {
      state = stepWanderState(state, 50, bounds, config, () => 0.9);
    }
    expect(["turning", "walking"]).toContain(state.phase);
  });
});

describe("CSS と SEO 方針", () => {
  it("アニメーションは no-preference の中だけ、keyframes は transform / opacity のみ", () => {
    const css = readFileSync(
      "src/components/guide/ShirubeWanderer.css",
      "utf8",
    );
    const noPref = css.indexOf(
      "@media (prefers-reduced-motion: no-preference)",
    );
    expect(noPref).toBeGreaterThan(-1);
    const before = css.slice(0, noPref);
    expect(before).not.toMatch(/animation\s*:/);
    expect(before).toMatch(
      /\.shirube-wander-stage\s*{[^}]*pointer-events:\s*none/,
    );

    const frames = [...css.matchAll(/@keyframes [\w-]+\s*{([\s\S]*?)\n  }/g)];
    expect(frames.length).toBeGreaterThanOrEqual(2);
    for (const [, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
  });

  it("デモページは noindex かつ NON_CORE_DISALLOW に /demo が含まれる", () => {
    expect(NON_CORE_DISALLOW).toContain("/demo");
    expect(demoMetadata.robots).toMatchObject({ index: false });
  });
});
