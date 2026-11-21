import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
import { ShirubeShuffle } from "@/components/guide/ShirubeShuffle";
import {
  computeBottomLift,
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
  it("部品分けのちびしるべ（奥の足・手前の足・胴体）を重ね、ポインタは塞がない", () => {
    stubMatchMedia(true);
    const { container } = render(<ShirubeWanderer />);

    const rig = screen.getByTestId("shirube-rig-side");
    const parts = [...rig.querySelectorAll("picture")].map((p) =>
      p.getAttribute("data-part"),
    );
    // 描く順: 奥の足 → 手前の足 → 胴体（袴が足の付け根を隠す）
    expect(parts).toEqual(["leg-far", "leg-near", "body"]);

    for (const part of parts) {
      const pic = rig.querySelector(`picture[data-part="${part}"]`)!;
      const source = pic.querySelector("source")!;
      expect(source.getAttribute("type")).toBe("image/webp");
      expect(source.getAttribute("srcset")).toContain(
        `/guide/walk/shirube-walk-${part}-128.webp 62w`,
      );
      const img = pic.querySelector("img")!;
      expect(img.getAttribute("src")).toBe(
        `/guide/walk/shirube-walk-${part}-240.png`,
      );
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
    }

    // 素材ファイルが public に揃っている
    for (const part of parts) {
      for (const size of ["128", "240"]) {
        for (const ext of ["webp", "png"]) {
          expect(
            existsSync(`public/guide/walk/shirube-walk-${part}-${size}.${ext}`),
          ).toBe(true);
        }
      }
    }
    expect(container.querySelector(".motion-float")).toBeNull();
  });

  it("素材は右向きなので、左向きのときだけ scaleX(-1) で反転する", () => {
    stubMatchMedia(true);
    const { rerender } = render(<ShirubeWanderer restSide="right" />);
    // 右下で休む → ページの内側（左）を向く
    expect(
      screen.getByTestId("shirube-wanderer").getAttribute("data-facing"),
    ).toBe("left");
    expect(screen.getByTestId("shirube-wanderer-flip").style.transform).toBe(
      "scaleX(-1)",
    );
    rerender(<ShirubeWanderer restSide="left" />);
    expect(screen.getByTestId("shirube-wanderer-flip").style.transform).toBe(
      "scaleX(1)",
    );
  });

  it("data-shirube-avoid の固定ボタン帯があると、その上端より上へ持ち上がる", () => {
    stubMatchMedia(true);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    const bar = document.createElement("div");
    bar.setAttribute("data-shirube-avoid", "");
    bar.getBoundingClientRect = () =>
      ({
        top: 728,
        bottom: 800,
        left: 0,
        right: 375,
        width: 375,
        height: 72,
      }) as DOMRect;
    document.body.appendChild(bar);

    render(<ShirubeWanderer />);
    const stage = screen.getByTestId("shirube-wanderer");
    expect(stage.style.getPropertyValue("--shirube-lift")).toBe("76px");
    expect(stage.getAttribute("data-lifted")).toBe("true");
    bar.remove();

    cleanup();
    render(<ShirubeWanderer avoidBottomObstacles={false} />);
    expect(
      screen
        .getByTestId("shirube-wanderer")
        .style.getPropertyValue("--shirube-lift"),
    ).toBe("");
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

describe("正面のしるべとすり足", () => {
  it("正面の胴体と手（手を振る部品）を持ち、素材が public に揃っている", () => {
    stubMatchMedia(true);
    render(<ShirubeWanderer />);
    const front = screen.getByTestId("shirube-rig-front");
    const parts = [...front.querySelectorAll("picture")].map((p) =>
      p.getAttribute("data-part"),
    );
    expect(parts).toEqual(["front-body", "front-hand"]);
    for (const part of parts) {
      for (const size of ["128", "240"]) {
        for (const ext of ["webp", "png"]) {
          expect(
            existsSync(`public/guide/walk/shirube-walk-${part}-${size}.${ext}`),
          ).toBe(true);
        }
      }
    }
  });

  it("gait=shuffle では 4 コマのスプライトに切り替わり、部品分けの絵は出さない", () => {
    stubMatchMedia(true);
    render(<ShirubeWanderer gait="shuffle" />);
    const stage = screen.getByTestId("shirube-wanderer");
    expect(stage.getAttribute("data-gait")).toBe("shuffle");
    expect(screen.queryByTestId("shirube-walk-rig")).toBeNull();
    const img = screen
      .getByTestId("shirube-shuffle-sprite")
      .querySelector("img")!;
    expect(img.getAttribute("srcset")).toContain(
      "/guide/walk/shirube-shuffle-128.webp 268w",
    );
    expect(existsSync("public/guide/walk/shirube-shuffle-128.webp")).toBe(true);
    expect(existsSync("public/guide/walk/shirube-shuffle-240.webp")).toBe(true);
  });

  it("単体の ShirubeShuffle は既定で飾り扱い、label があれば img として読み上げる", () => {
    const { rerender } = render(<ShirubeShuffle />);
    let el = screen.getByTestId("shirube-shuffle");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("data-travel")).toBe("false");
    expect(el.style.getPropertyValue("--shuffle-h")).toBe("48px");

    rerender(<ShirubeShuffle size={40} travel label="読み込み中" />);
    el = screen.getByTestId("shirube-shuffle");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe("読み込み中");
    expect(el.getAttribute("aria-hidden")).toBeNull();
    expect(el.getAttribute("data-travel")).toBe("true");
    expect(el.style.getPropertyValue("--shuffle-h")).toBe("40px");
  });

  it("目的地に着くとときどき正面を向き（greeting）、終わると少し間を置いて歩き出す", () => {
    const bounds = getWanderBounds(1000, 60, 16);
    const config = getWanderConfig(1000);
    expect(config.greetChance).toBeGreaterThan(0);
    let state = createInitialWanderState(bounds, config, () => 0.1);
    for (let i = 0; i < 400 && state.phase === "walking"; i += 1) {
      state = stepWanderState(state, 50, bounds, config, () => 0.1);
    }
    expect(state.phase).toBe("greeting");
    expect(state.remainingMs).toBeGreaterThanOrEqual(config.minGreetMs);
    expect(state.remainingMs).toBeLessThanOrEqual(config.maxGreetMs);

    for (let i = 0; i < 200 && state.phase === "greeting"; i += 1) {
      state = stepWanderState(state, 50, bounds, config, () => 0.9);
    }
    expect(state.phase).toBe("paused");
    expect(state.remainingMs).toBe(config.afterGreetMs);
    expect(state.glancedDuringPause).toBe(true);

    for (let i = 0; i < 100 && state.phase === "paused"; i += 1) {
      state = stepWanderState(state, 50, bounds, config, () => 0.9);
    }
    expect(["turning", "walking"]).toContain(state.phase);
  });

  it("すり足は正面を向かず、歩く速さも遅い", () => {
    for (const vw of [375, 1280]) {
      const rig = getWanderConfig(vw);
      const shuffle = getWanderConfig(vw, { gait: "shuffle" });
      expect(shuffle.greetChance).toBe(0);
      expect(shuffle.speedPxPerSec).toBeLessThan(rig.speedPxPerSec);
    }
    expect(getWanderConfig(1280, { greet: false }).greetChance).toBe(0);
  });

  it("CSS: 動きを減らす設定と greeting のときに正面を見せ、手は手首を軸に振る", () => {
    const css = readFileSync(
      "src/components/guide/ShirubeWanderer.css",
      "utf8",
    );
    expect(css).toMatch(
      /\[data-motion="reduced"\] \.shirube-rig-front\s*{\s*opacity:\s*1/,
    );
    expect(css).toMatch(/\.shirube-rig-front-hand\s*{\s*transform-origin:/);
    expect(css).toContain("@keyframes shirube-front-wave");
    expect(css).toContain("@keyframes shirube-shuffle-steps");
    expect(css).toMatch(/steps\(4\)/);
  });
});

describe("computeBottomLift", () => {
  it("下端に接した帯の上端まで持ち上げ、遠い要素や大きなパネルは無視・上限あり", () => {
    const vh = 800;
    expect(computeBottomLift([], vh)).toBe(0);
    // 下端に接した 64px の帯 → 64 + 余白 4
    expect(
      computeBottomLift(
        [{ top: 736, bottom: 800, width: 375, height: 64 }],
        vh,
      ),
    ).toBe(68);
    // 下端から離れた要素は無視
    expect(
      computeBottomLift(
        [{ top: 600, bottom: 700, width: 375, height: 100 }],
        vh,
      ),
    ).toBe(0);
    // 画面の上半分から始まる大きなパネルは無視
    expect(
      computeBottomLift(
        [{ top: 100, bottom: 800, width: 375, height: 700 }],
        vh,
      ),
    ).toBe(0);
    // 上限は画面の高さの 35%
    expect(
      computeBottomLift(
        [{ top: 420, bottom: 800, width: 375, height: 380 }],
        vh,
      ),
    ).toBe(280);
    // 幅 0（非表示）は無視
    expect(
      computeBottomLift([{ top: 736, bottom: 800, width: 0, height: 64 }], vh),
    ).toBe(0);
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
    expect(frames.length).toBeGreaterThanOrEqual(6);
    const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
    expect(names).toEqual(
      expect.arrayContaining([
        "shirube-walk-leg-near",
        "shirube-walk-leg-far",
        "shirube-walk-bob",
        "shirube-idle-breath",
      ]),
    );
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
