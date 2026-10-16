import { afterEach, expect, it, vi } from "vitest";
import { VoiceClient } from "@/lib/voiceClient";
class Socket {
  static OPEN = 1;
  static last: Socket;
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: () => void;
  sent: Record<string, unknown>[] = [];
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    Socket.last = this;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close = vi.fn();
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
class Capture {
  static last: Capture;
  port: { onmessage?: (event: { data: Float32Array }) => void } = {};
  constructor() {
    Capture.last = this;
  }
  connect() {
    return { connect() {} };
  }
  disconnect = vi.fn();
}
const stopTrack = vi.fn();
const closeAudio = vi.fn(async () => {});
const audioStart = vi.fn();
const audioStop = vi.fn();
class Audio {
  sampleRate = 24000;
  currentTime = 0;
  destination = {};
  audioWorklet = { addModule: async () => {} };
  resume = async () => {};
  close = closeAudio;
  createMediaStreamSource() {
    return { connect() {} };
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  createBuffer(_channels: number, size: number) {
    return {
      duration: size / 24000,
      getChannelData: () => new Float32Array(size),
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      disconnect() {},
      start: audioStart,
      stop: audioStop,
      onended: null,
    };
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("authenticates with a short-lived token, captures PCM, batches parallel tools, displays transcripts and cleans up", async () => {
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("AudioContext", Audio);
  vi.stubGlobal("AudioWorkletNode", Capture);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    }),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }),
    },
  });
  const pending: (() => void)[] = [];
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("tool"))
      await new Promise<void>((resolve) => pending.push(resolve));
    return {
      ok: true,
      json: async () =>
        url.endsWith("status")
          ? { voiceMock: false }
          : url.endsWith("session")
            ? {
                token: "ephemeral",
                sessionId: "signed",
                model: "grok-voice-3.0",
                instructions: "safe",
                tools: [],
                seconds: 180,
                expires_at: Date.now() / 1000 + 180,
              }
            : { output: "UNTRUSTED_TOOL_DATA", durationMs: 2, summary: "done" },
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const transcript = vi.fn();
  const client = new VoiceClient({
    transcript,
    event: vi.fn(),
    remaining: vi.fn(),
    status: vi.fn(),
    ended: vi.fn(),
  });
  await client.start();
  const ws = Socket.last;
  expect(ws.url).toContain("model=grok-voice-3.0");
  expect(ws.protocols).toEqual(["xai-client-secret.ephemeral"]);
  ws.onopen?.();
  expect(ws.sent[0]).toMatchObject({
    type: "session.update",
    session: {
      turn_detection: null,
      voice: "eve",
      audio: { input: { transcription: { language_hint: "ja" } } },
    },
  });
  ws.emit({ type: "session.updated" });
  client.press();
  Capture.last.port.onmessage?.({ data: new Float32Array([0, 0.5, -0.5]) });
  client.release();
  expect(ws.sent.slice(-3).map((e) => e.type)).toEqual([
    "input_audio_buffer.append",
    "input_audio_buffer.commit",
    "response.create",
  ]);
  ws.emit({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "質問",
  });
  ws.emit({
    type: "response.output_audio_transcript.done",
    transcript: "回答",
  });
  expect(transcript.mock.calls).toEqual([
    ["user", "質問"],
    ["assistant", "回答"],
  ]);
  ws.emit({ type: "response.output_audio.delta", delta: btoa("\0\0\0\0") });
  expect(audioStart).toHaveBeenCalledOnce();
  for (const id of ["a", "b"])
    ws.emit({
      type: "response.function_call_arguments.done",
      name: "get_kanshi",
      call_id: id,
      arguments: "{}",
    });
  expect(pending).toHaveLength(0);
  ws.emit({ type: "response.done" });
  expect(pending).toHaveLength(2);
  pending[1]();
  await vi.waitFor(() =>
    expect(
      ws.sent.filter((e) => e.type === "conversation.item.create"),
    ).toHaveLength(1),
  );
  expect(ws.sent.filter((e) => e.type === "response.create")).toHaveLength(1);
  pending[0]();
  await vi.waitFor(() =>
    expect(ws.sent.filter((e) => e.type === "response.create")).toHaveLength(2),
  );
  expect(ws.sent.slice(-3).map((e) => e.type)).toEqual([
    "conversation.item.create",
    "conversation.item.create",
    "response.create",
  ]);
  client.stop();
  client.stop();
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(closeAudio).toHaveBeenCalledOnce();
  expect(audioStop).toHaveBeenCalledOnce();
  expect(
    fetcher.mock.calls.filter(([url]) => url.endsWith("end")),
  ).toHaveLength(1);
});
