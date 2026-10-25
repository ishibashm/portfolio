import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FortuneFrame } from "@/components/fortune/FortuneFrame";
import { buildFortuneSrcdoc } from "@/lib/fortuneHtml";

it("renders a script-free srcdoc with an exactly empty sandbox and responsive height", () => {
  const listener = vi.spyOn(window, "addEventListener");
  try {
    render(
      <FortuneFrame
        srcdoc={buildFortuneSrcdoc("<p>AI</p><script>evil()</script>")}
      />,
    );
    const frame = screen.getByTitle(
      "AI装飾の運勢レポート",
    ) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.srcdoc).toContain("Content-Security-Policy");
    expect(frame.srcdoc).toContain("overflow:auto");
    expect(frame.srcdoc).not.toContain("<script");
    expect(frame.style.height).toBe("70vh");
    expect(frame.style.minHeight).toBe("480px");
    expect(listener.mock.calls.some(([event]) => event === "message")).toBe(
      false,
    );
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: frame.contentWindow,
          origin: "null",
          data: { type: "ai-fortune-height", height: 650 },
        }),
      ),
    );
    expect(frame.style.height).toBe("70vh");
  } finally {
    listener.mockRestore();
  }
});
