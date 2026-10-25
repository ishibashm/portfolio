import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  FortuneFrame,
  fortuneMessageHeight,
} from "@/components/fortune/FortuneFrame";

it("accepts only the opaque iframe window and exact finite height messages", () => {
  const source = window;
  const message = (
    data: unknown,
    origin = "null",
    sender: Window | null = source,
  ) => new MessageEvent("message", { data, origin, source: sender });
  const valid = { type: "ai-fortune-height", height: 320.2 };
  expect(fortuneMessageHeight(message(valid), source)).toBe(321);
  expect(
    fortuneMessageHeight(message({ ...valid, height: -100 }), source),
  ).toBe(120);
  expect(
    fortuneMessageHeight(message({ ...valid, height: 999999 }), source),
  ).toBe(4000);
  expect(
    fortuneMessageHeight(message(valid, "https://example.com"), source),
  ).toBeNull();
  expect(fortuneMessageHeight(message(valid, "null", null), source)).toBeNull();
  expect(fortuneMessageHeight(message(valid), null)).toBeNull();
  for (const data of [
    null,
    [],
    "bad",
    { ...valid, extra: true },
    { type: "other", height: 300 },
    { type: valid.type },
    ...[NaN, Infinity, -Infinity, "300", null].map((height) => ({
      ...valid,
      height,
    })),
  ]) {
    expect(fortuneMessageHeight(message(data), source)).toBeNull();
  }
});

it("updates height only for its own iframe and removes its listener on unmount", () => {
  const { unmount } = render(<FortuneFrame srcdoc="<p>AI</p>" />);
  const frame = screen.getByTitle("AI装飾の運勢レポート") as HTMLIFrameElement;
  expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
  const send = (source: Window | null) =>
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          origin: "null",
          data: { type: "ai-fortune-height", height: 650 },
        }),
      ),
    );
  send(window);
  expect(frame.style.height).toBe("480px");
  send(frame.contentWindow);
  expect(frame.style.height).toBe("650px");
  unmount();
  send(window);
});
