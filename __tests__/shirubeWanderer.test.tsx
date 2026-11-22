import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ShirubeWanderer } from "@/components/guide/ShirubeWanderer";
import { ShirubeShuffle } from "@/components/guide/ShirubeShuffle";
import { SHIRUBE_HIDDEN_STORAGE_KEY } from "@/components/guide/ShirubeBubble";
import {
  computeBottomLift,
  createInitialWanderState,
  getWanderBounds,
  getWanderConfig,
  stepWanderState,
  type WanderState,
} from "@/components/guide/shirubeWanderLogic";
import { NON_CORE_DISALLOW } from "@/lib/siteStructure";
import { isShirubeExcluded } from "@/components/guide/SiteShirube";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.removeItem(SHIRUBE_HIDDEN_STORAGE_KEY);
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

const menuTrigger = () =>
  screen.getByRole("button", { name: /しるべ。メニューを開く/ });

const wandererCss = readFileSync(
  "src/components/guide/ShirubeWanderer.css",
  "utf8",
);

function expectFrontPose(visible: boolean) {
  const style = document.createElement("style");
  style.textContent = wandererCss;
  document.head.append(style);
  try {
    expect(
      getComputedStyle(screen.getByTestId("shirube-rig-front")).opacity,
    ).toBe(visible ? "1" : "0");
    expect(
      getComputedStyle(screen.getByTestId("shirube-rig-side")).opacity || "1",
    ).toBe(visible ? "0" : "1");
  } finally {
    style.remove();
  }
}

function chooseTip() {
  fireEvent.click(menuTrigger());
  fireEvent.click(screen.getByRole("menuitem", { name: "ひとこと案内" }));
}

function beginPointerDrag() {
  const button = menuTrigger();
  const start = {
    pointerId: 1,
    pointerType: "touch",
    button: 0,
    clientX: 100,
    clientY: 100,
  };
  const end = { ...start, clientX: 220, clientY: 180 };
  fireEvent.pointerDown(button, start);
  fireEvent.pointerMove(button, end);
  return { button, end };
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
    expectFrontPose(true);
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

  it("no-preference のときはその場の足踏みから始め、translate3d(x, y, 0) で向いている側へ少しずつ動く", () => {
    stubMatchMedia(false);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    render(<ShirubeWanderer />);

    const stage = screen.getByTestId("shirube-wanderer");
    const actor = screen.getByTestId("shirube-wanderer-actor");
    expect(stage.getAttribute("data-motion")).toBe("active");
    expect(stage.getAttribute("data-state")).toBe("stepping");
    expectFrontPose(true);
    const initialTransform = actor.style.transform;
    expect(initialTransform).toMatch(
      /^translate3d\([\d.-]+px, [\d.-]+px, 0\)$/,
    );

    act(() => {
      now = 80;
      frames.shift()?.(now);
      now = 160;
      frames.shift()?.(now);
    });

    expect(actor.style.transform).not.toBe(initialTransform);
  });

  it("メニューのひとこと案内で吹き出しを表示し、onInteract で開く動作を上書きできる", () => {
    stubMatchMedia(true);
    const { rerender } = render(
      <ShirubeWanderer pathnameOverride="/houi/today" />,
    );

    chooseTip();

    const bubble = screen.getByRole("status");
    expect(bubble.getAttribute("aria-live")).toBe("polite");
    expect(bubble.textContent).toContain("今日いちばん良い方位");

    // Esc で吹き出しを閉じる
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("shirube-bubble")).toBeNull();

    // onInteract で上書き可能
    const onInteract = vi.fn();
    rerender(<ShirubeWanderer onInteract={onInteract} />);
    fireEvent.click(screen.getByRole("button", { name: "しるべに話しかける" }));
    expect(onInteract).toHaveBeenCalledTimes(1);
  });

  it("メニューには指定された 6 項目があり、Esc と外側クリックでフォーカスを戻す", () => {
    render(<ShirubeWanderer forceReducedMotion />);
    const trigger = menuTrigger();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(
      items.map((item) => [item.textContent, item.getAttribute("href")]),
    ).toEqual([
      ["今日の方位", "/houi/today"],
      ["方位で街を探す", "/relocation/arbitrage"],
      ["ブログ", "/blog"],
      ["しるべに案内してもらう", "/annai"],
      ["ひとこと案内", null],
      ["定位置に戻る", null],
    ]);
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "End" });
    expect(items[5]).toHaveFocus();
    fireEvent.keyDown(items[5], { key: "Tab" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it.each([
    ["/houi", "今日の方位", "/houi/today"],
    ["/houi", "方位で街を探す", "/relocation/arbitrage"],
    ["/houi", "ブログ", "/blog"],
    ["/houi", "しるべに案内してもらう", "/annai"],
    ["/blog", "ブログ", "/blog"],
  ])(
    "定位置のメニューで %s から「%s」を選ぶと %s へ遷移し、メニューが閉じる",
    (pathname, name, href) => {
      vi.useFakeTimers();
      const push = vi.fn(() => {
        expect(screen.getByRole("menuitem", { name })).toHaveFocus();
      });
      const router = {
        pathname,
        asPath: pathname,
        beforePopState: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
        push,
      } as unknown as NonNullable<React.ContextType<typeof RouterContext>>;
      render(
        <RouterContext.Provider value={router}>
          <ShirubeWanderer forceReducedMotion pathnameOverride={pathname} />
        </RouterContext.Provider>,
      );
      const trigger = menuTrigger();
      fireEvent.click(trigger);
      const item = screen.getByRole("menuitem", { name });
      item.focus();
      fireEvent.click(item);
      expect(push).toHaveBeenCalledExactlyOnceWith(
        href,
        href,
        expect.objectContaining({ scroll: true }),
      );
      expect(item).toHaveFocus();
      act(() => vi.advanceTimersByTime(0));
      expect(screen.queryByRole("menu")).toBeNull();
      expect(trigger).toHaveFocus();
    },
  );

  it.each([
    { width: 1280, height: 800, gap: 4, actorWidth: 82, actorHeight: 168 },
    { width: 390, height: 844, gap: 2, actorWidth: 41, actorHeight: 84 },
  ])(
    "右端の定位置でメニューを画面内に置く ($width × $height)",
    ({ width, height, gap, actorWidth, actorHeight }) => {
      vi.stubGlobal("innerWidth", width);
      vi.stubGlobal("innerHeight", height);
      const actor = new DOMRect(
        width - gap - actorWidth,
        height - actorHeight,
        actorWidth,
        actorHeight,
      );
      const menuWidth = 216;
      const menuHeight = 216;
      const measure = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(
        HTMLElement.prototype,
        "getBoundingClientRect",
      ).mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("shirube-wander-hit")) return actor;
        if (this.classList.contains("shirube-menu")) {
          return new DOMRect(0, 0, menuWidth, menuHeight);
        }
        return measure.call(this);
      });
      render(<ShirubeWanderer forceReducedMotion />);
      fireEvent.click(menuTrigger());
      const { left, top } = screen.getByRole("menu").style;
      expect(parseFloat(left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(left) + menuWidth).toBeLessThanOrEqual(width);
      expect(parseFloat(top)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(top) + menuHeight).toBeLessThan(actor.top);
    },
  );

  it.each(["menu", "drag"] as const)(
    "%s 中は徘徊と自動案内を止める",
    (interaction) => {
      vi.useFakeTimers();
      const raf = vi.fn(() => 1);
      const cancel = vi.fn();
      vi.stubGlobal("requestAnimationFrame", raf);
      vi.stubGlobal("cancelAnimationFrame", cancel);
      render(
        <ShirubeWanderer
          forceReducedMotion={false}
          pathnameOverride="/houi/today"
          enterTipDelayMs={500}
        />,
      );
      expect(raf).toHaveBeenCalled();
      if (interaction === "menu") fireEvent.click(menuTrigger());
      else beginPointerDrag();
      expect(cancel).toHaveBeenCalledWith(1);
      expect(screen.getByTestId("shirube-wanderer")).toHaveAttribute(
        "data-state",
        "paused",
      );
      expectFrontPose(true);
      const actor = screen.getByTestId("shirube-wanderer-actor");
      const position = actor.style.transform;
      raf.mockClear();
      act(() => vi.advanceTimersByTime(1000));
      expect(actor.style.transform).toBe(position);
      expect(raf).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it("しきい値未満のタッチ移動はクリックとしてメニューを開く", () => {
    render(<ShirubeWanderer forceReducedMotion />);
    const button = menuTrigger();
    const start = {
      pointerId: 1,
      pointerType: "touch",
      button: 0,
      clientX: 100,
      clientY: 100,
    };
    const end = { ...start, clientX: 103, clientY: 104 };
    fireEvent.pointerDown(button, start);
    fireEvent.pointerMove(button, end);
    fireEvent.pointerUp(button, end);
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByTestId("shirube-wanderer")).not.toHaveAttribute(
      "data-positioned",
    );
  });

  it("しきい値を超えた操作はクリックにならず、仮置きから既存の時間で帰り始める", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(
      <ShirubeWanderer forceReducedMotion={false} enterTipDelayMs={60_000} />,
    );
    const stage = screen.getByTestId("shirube-wanderer");
    const actor = screen.getByTestId("shirube-wanderer-actor");
    const { button, end } = beginPointerDrag();
    expect(stage).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerUp(button, end);
    fireEvent.click(button, { detail: 1 });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(stage).toHaveAttribute("data-positioned", "true");
    expect(stage).toHaveAttribute("data-state", "paused");
    expectFrontPose(true);
    expect(actor.style.transform).toBe("translate3d(120.00px, 80.00px, 0)");
    act(() => vi.advanceTimersByTime(14_999));
    expect(stage).toHaveAttribute("data-positioned", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(stage).not.toHaveAttribute("data-positioned");
    expect(stage).toHaveAttribute("data-state", "hopping");
    expect(stage).toHaveAttribute("data-facing", "right");
  });

  it("定位置に戻るを選ぶと仮置きからすぐ帰り始める", () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<ShirubeWanderer forceReducedMotion={false} />);
    const { button, end } = beginPointerDrag();
    fireEvent.pointerUp(button, end);
    fireEvent.click(button); // Enter / Space による click
    fireEvent.click(screen.getByRole("menuitem", { name: "定位置に戻る" }));
    const stage = screen.getByTestId("shirube-wanderer");
    expect(stage).not.toHaveAttribute("data-positioned");
    expect(stage).toHaveAttribute("data-state", "hopping");
    expect(button).toHaveFocus();
  });

  it("吹き出しの × で隠れて localStorage に保存され、端タブで呼び戻せる", () => {
    stubMatchMedia(true);
    render(<ShirubeWanderer pathnameOverride="/" />);

    chooseTip();
    expect(screen.getByTestId("shirube-bubble")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "しるべを休ませる" }));
    expect(window.localStorage.getItem(SHIRUBE_HIDDEN_STORAGE_KEY)).toBe("1");
    expect(
      screen.queryByRole("button", { name: /しるべ。メニューを開く/ }),
    ).toBeNull();

    const restoreTab = screen.getByRole("button", { name: "しるべを呼ぶ" });
    fireEvent.click(restoreTab);
    expect(window.localStorage.getItem(SHIRUBE_HIDDEN_STORAGE_KEY)).toBeNull();
    expect(menuTrigger()).toBeInTheDocument();
  });

  it("reduced-motion でもタップ・自動案内で吹き出しと対象の金枠強調が動き、rAF は回さない", () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    const rafSpy = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", rafSpy);

    const heading = document.createElement("h2");
    heading.textContent = "先に結論：南東が吉";
    heading.getBoundingClientRect = () =>
      ({
        top: 200,
        bottom: 240,
        left: 40,
        right: 400,
        width: 360,
        height: 40,
      }) as DOMRect;
    document.body.appendChild(heading);

    render(
      <ShirubeWanderer
        pathnameOverride="/blog/test-article"
        enterTipDelayMs={1000}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId("shirube-bubble").textContent).toContain(
      "先に結論",
    );
    expect(heading.classList.contains("shirube-tip-target-highlight")).toBe(
      true,
    );
    expect(rafSpy).not.toHaveBeenCalled();

    heading.remove();
    vi.useRealTimers();
  });
});

describe("shirubeWanderLogic", () => {
  it("画面幅に収まる範囲を歩き、目標に着くと立ち止まり、その後向きを変えて再び歩く", () => {
    const bounds = getWanderBounds(1000, 80, 16);
    const config = getWanderConfig(1000);
    const initial = createInitialWanderState(bounds, config, () => 0.1);
    // 初期位置は定位置（右端）で、ページの方（左）を向いて立っている
    expect(initial.x).toBe(bounds.maxX);
    expect(initial.facing).toBe("left");
    expect(initial.phase).toBe("paused");
    let state: WanderState = {
      ...initial,
      phase: "walking",
      targetX: bounds.maxX - 200,
    };

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

  it("gait=shuffle でも定位置での足踏み中とメニュー表示中は正面を向く", () => {
    stubMatchMedia(false);
    render(<ShirubeWanderer gait="shuffle" />);
    const stage = screen.getByTestId("shirube-wanderer");
    expect(stage.getAttribute("data-gait")).toBe("shuffle");
    expect(stage).toHaveAttribute("data-state", "stepping");
    expect(screen.queryByTestId("shirube-shuffle-sprite")).toBeNull();
    expectFrontPose(true);

    fireEvent.click(menuTrigger());
    expect(stage).toHaveAttribute("data-state", "paused");
    expect(screen.queryByTestId("shirube-shuffle-sprite")).toBeNull();
    expectFrontPose(true);
  });

  it("単体の ShirubeShuffle は既定で飾り扱い、label があれば img として読み上げる", () => {
    const { rerender } = render(<ShirubeShuffle />);
    const sprite = screen.getByTestId("shirube-shuffle-sprite");
    const pic = sprite.querySelector("picture")!;
    expect(pic).not.toBeNull();
    const source = pic.querySelector('source[type="image/webp"]')!;
    expect(source.getAttribute("srcset")).toContain(
      "/guide/walk/shirube-shuffle-128.webp 268w",
    );
    const img = pic.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/guide/walk/shirube-shuffle-240.png");
    expect(img.getAttribute("srcset")).toContain(
      "/guide/walk/shirube-shuffle-128.png 268w",
    );
    expect(img.getAttribute("srcset")).toContain(
      "/guide/walk/shirube-shuffle-240.png 500w",
    );
    expect(existsSync("public/guide/walk/shirube-shuffle-128.webp")).toBe(true);
    expect(existsSync("public/guide/walk/shirube-shuffle-240.webp")).toBe(true);

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
    let state: WanderState = {
      ...createInitialWanderState(bounds, config, () => 0.1),
      phase: "walking",
      targetX: bounds.maxX - 200,
    };
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

  it("CSS: 待機とあいさつは正面、歩行中は横向きにし、手は手首を軸に振る", () => {
    render(<ShirubeWanderer forceReducedMotion={false} />);
    const stage = screen.getByTestId("shirube-wanderer");
    for (const state of [
      "idle",
      "paused",
      "stepping",
      "greeting",
      "sitting",
      "pointing",
    ]) {
      stage.setAttribute("data-state", state);
      expectFrontPose(true);
    }
    for (const state of ["walking", "hopping", "turning"]) {
      stage.setAttribute("data-state", state);
      expectFrontPose(false);
    }
    expect(wandererCss).toMatch(
      /\[data-motion="reduced"\] \.shirube-rig-front\s*{\s*opacity:\s*1/,
    );
    expect(wandererCss).toMatch(
      /\.shirube-rig-front-hand\s*{\s*transform-origin:/,
    );
    expect(wandererCss).toContain("@keyframes shirube-front-wave");
    expect(wandererCss).toContain("@keyframes shirube-shuffle-steps");
    expect(wandererCss).toMatch(/steps\(4\)/);
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
        "shirube-hop-takeoff",
        "shirube-hop-land",
        "shirube-turn-back-bounce",
      ]),
    );
    for (const [, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
  });

  it("試作デモページは本番に残さない（/demo/shirube を消した）", () => {
    expect(existsSync(`${process.cwd()}/src/app/demo/shirube`)).toBe(false);
    expect(NON_CORE_DISALLOW).not.toContain("/demo");
  });

  it("サイト全体のレイアウトに歩き回るしるべを 1 回だけ置き、管理画面などには出さない", () => {
    const layout = readFileSync(`${process.cwd()}/src/app/layout.tsx`, "utf8");
    expect(layout.match(/<SiteShirube \/>/g)?.length).toBe(1);
    expect(isShirubeExcluded("/admin/blog")).toBe(true);
    expect(isShirubeExcluded("/auth/callback")).toBe(true);
    expect(isShirubeExcluded("/houi/today")).toBe(false);
    expect(isShirubeExcluded("/")).toBe(false);
  });
});
