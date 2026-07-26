import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaphysicalConfigBar } from "@/components/layout/MetaphysicalConfigBar";

describe("MetaphysicalConfigBar legacy configuration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["optimal_only", "kigaku_env"])(
    "falls back safely from legacy direction mode %s",
    async (legacyMode) => {
      localStorage.setItem(
        "tactical_config_v1",
        JSON.stringify({
          direction_filter_mode: legacyMode,
          action_intent: "DEFAULT",
        }),
      );
      const onConfigChange = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<MetaphysicalConfigBar onConfigChange={onConfigChange} />);
        await Promise.resolve();
      });

      expect(onConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          directionFilterMode: "composite",
        }),
      );

      await act(async () => root.unmount());
      container.remove();
    },
  );
});
