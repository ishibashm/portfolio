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
    // モバイルは 50svh、sm 以上で 70svh（固定 70vh だと 1 画面を占有した）
    expect(frame.className).toContain("h-[50svh]");
    expect(frame.className).toContain("sm:h-[70svh]");
    expect(frame.style.height).toBe("");
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
    expect(frame.style.height).toBe("");
  } finally {
    listener.mockRestore();
  }
});
