import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaphysicalConfigBar } from "@/components/layout/MetaphysicalConfigBar";
import {
  ACTION_INTENTS,
  ACTION_INTENT_EFFECTS,
  ACTION_INTENT_LABELS,
} from "@/utils/directionFilterMode";

/**
 * 移動の目的の呼び名と説明は directionFilterMode の表 1 つ。
 *
 * 以前は設定バー・ダッシュボードの本命星タブ・目的地タブがそれぞれ別の
 * 名前（「標準 (Default)」「日常の行動・短期旅行」「通常の外出」）を
 * 持っていた。設定バーの説明には、判定に入っていない「バイオリズム」と
 * #712 で廃止した「方位価値（Q値）」が残っていた。
 */
describe("移動の目的の呼び名", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function openBar(intent: string) {
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({ action_intent: intent }),
    );
    await act(async () => {
      root.render(<MetaphysicalConfigBar />);
      await Promise.resolve();
    });
    const header = container.querySelector<HTMLElement>(".cursor-pointer");
    await act(async () => header!.click());
  }

  it("表は 4 つの目的すべてに名前と説明を持つ", () => {
    expect(ACTION_INTENTS).toEqual([
      "DEFAULT",
      "REST",
      "BUSINESS",
      "MIGRATION",
    ]);
    for (const intent of ACTION_INTENTS) {
      expect(ACTION_INTENT_LABELS[intent]).toBeTruthy();
      expect(ACTION_INTENT_EFFECTS[intent]).toBeTruthy();
    }
  });

  it.each(["DEFAULT", "REST", "BUSINESS", "MIGRATION"] as const)(
    "設定バーは表の名前と説明を出す（%s）",
    async (intent) => {
      await openBar(intent);
      const text = container.textContent ?? "";
      for (const i of ACTION_INTENTS) {
        expect(text).toContain(ACTION_INTENT_LABELS[i]);
      }
      expect(text).toContain(ACTION_INTENT_EFFECTS[intent]);
    },
  );

  it("判定に入っていない言葉と英語の併記を出さない", async () => {
    for (const intent of ACTION_INTENTS) {
      await openBar(intent);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/バイオリズム|Q値|\(Default\)|\(Rest\)/);
      expect(text).not.toContain("アクション目的");
    }
  });
});
