import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { AiConsultationLoginNotice } from "@/components/ExpertCouncilPanel";

describe("AI consultation login guidance", () => {
  it("shows an actionable login path on the home consultation panel", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<AiConsultationLoginNotice />));

    expect(container.textContent).toContain(
      "AI相談を利用するにはログインが必要です。",
    );
    const link = container.querySelector("a");
    expect(link?.textContent).toBe("ログイン");
    expect(link?.getAttribute("href")).toBe("/login?next=/");

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});
