import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import GrokVoice from "@/components/home/GrokVoice";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("explains denied microphone permission and never creates a paid session", async () => {
  const fetcher = vi.fn(async () => ({
    json: async () => ({ voiceMock: false }),
  }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("AudioContext", class {});
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(new DOMException("denied", "NotAllowedError")),
    },
  });
  render(<GrokVoice onTranscript={vi.fn()} onEvent={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "押して話す" }), {
    code: "Space",
  });
  expect(
    await screen.findByText(/マイクの使用が許可されていません/),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("explains unsupported browsers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ voiceMock: false }) })),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });
  render(<GrokVoice onTranscript={vi.fn()} onEvent={vi.fn()} />);
  fireEvent.pointerDown(screen.getByRole("button", { name: "押して話す" }));
  expect(
    await screen.findByText(/このブラウザは音声入力に対応していません/),
  ).toBeTruthy();
});
it("mock uses real tool route on space release and settles on unmount", async () => {
  const transcript = vi.fn(),
    event = vi.fn();
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith("status")
        ? { voiceMock: true }
        : url.endsWith("session")
          ? {
              sessionId: "mock-id",
              mock: true,
              seconds: 180,
              expires_at: Date.now() / 1000 + 180,
            }
          : { output: "result", durationMs: 1, summary: "done" },
  }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<GrokVoice onTranscript={transcript} onEvent={event} />);
  const button = screen.getByRole("button", { name: "押して話す" });
  fireEvent.keyDown(button, { code: "Space" });
  await screen.findByText(/開発用モック：/);
  fireEvent.keyUp(button, { code: "Space" });
  await waitFor(() => expect(transcript).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls.some(([url]) => url === "/api/voice/tool")).toBe(
    true,
  );
  expect(event).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(fetcher.mock.calls.some(([url]) => url === "/api/voice/end")).toBe(
    true,
  );
});
