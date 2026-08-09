import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ArbitrageSidebarSection } from "@/components/relocation/ArbitrageSidebarSection";

describe("ArbitrageSidebarSection", () => {
  it("keeps a compact summary visible and toggles the section content", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <ArbitrageSidebarSection title="絞り込みフィルター" summary="2条件">
            <label htmlFor="max-age">築年数上限</label>
            <input id="max-age" />
          </ArbitrageSidebarSection>,
        );
      });

      const section = container.querySelector(
        '[data-testid="arbitrage-sidebar-section"]',
      );
      const heading = section?.querySelector("h3");
      const toggle = heading?.querySelector("button");

      expect(heading).toHaveTextContent("絞り込みフィルター");
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle?.textContent).toContain("2条件");
      expect(container.querySelector('label[for="max-age"]')).toBeNull();

      await act(async () => toggle?.click());

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(container.querySelector('label[for="max-age"]')).toHaveTextContent(
        "築年数上限",
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
