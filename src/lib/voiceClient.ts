import type { AgentEvent } from "./mcpAgent";
export interface VoiceCallbacks {
  transcript: (role: "user" | "assistant", text: string) => void;
  event: (event: AgentEvent) => void;
  status: (text: string) => void;
  remaining: (seconds: number) => void;
  ended: () => void;
  loginRequired?: () => void;
}
interface Session {
  sessionId: string;
  token: string;
  expires_at: number;
  seconds: number;
  model: string;
  mock: boolean;
  instructions: string;
  tools: unknown[];
}
class VoiceClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function voicePost(path: string, body: unknown) {
  const response = await fetch(`/api/voice/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: path === "end",
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: unknown;
      code?: unknown;
    } | null;
    throw new VoiceClientError(
      error?.code === "login_required" && typeof error.error === "string"
        ? error.error
        : "音声を利用できませんでした。時間をおいてお試しください。",
      typeof error?.code === "string" ? error.code : undefined,
    );
  }
  return response.json();
}
export class VoiceClient {
  private stream?: MediaStream;
  private context?: AudioContext;
  private worklet?: AudioWorkletNode;
  private socket?: WebSocket;
  private session?: Session;
  private timer?: ReturnType<typeof setInterval>;
  private sources = new Set<AudioBufferSourceNode>();
  private nextAudio = 0;
  private playbackStopped = false;
  private started = 0;
  private holding = false;
  private ready = false;
  private sentAudio = false;
  private closed = false;
  private responding = false;
  private calls: { name: string; call_id: string; arguments: string }[] = [];
  private seen = new Set<string>();
  constructor(private cb: VoiceCallbacks) {}
  private send(value: unknown) {
    if (!this.closed && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }
  async start() {
    try {
      // Request permission before reserving a paid session. Mock deliberately works without a microphone.
      const status = await fetch("/api/mcp-chain/status").then((r) => r.json());
      if (status.voiceRequiresLogin === true && status.voiceSignedIn !== true)
        throw new VoiceClientError(
          "音声で話すにはログインが必要です。",
          "login_required",
        );
      if (status.voiceAvailable === false)
        throw new VoiceClientError(
          "音声を利用できませんでした。時間をおいてお試しください。",
        );
      const mock = status.voiceMock === true;
      if (!mock) {
        if (
          !navigator.mediaDevices?.getUserMedia ||
          typeof AudioContext === "undefined"
        )
          throw new VoiceClientError(
            "このブラウザは音声入力に対応していません。テキスト入力をご利用ください。",
          );
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        } catch {
          throw new VoiceClientError(
            "マイクの使用が許可されていません。ブラウザの設定で許可するか、テキスト入力をご利用ください。",
          );
        }
        if (this.closed) {
          this.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.context = new AudioContext({ sampleRate: 24000 });
        await this.context.resume();
        if (!this.context.audioWorklet)
          throw new VoiceClientError(
            "このブラウザは音声入力に対応していません。テキスト入力をご利用ください。",
          );
        const url = URL.createObjectURL(
          new Blob(
            [
              `
          class Capture extends AudioWorkletProcessor {
            process(inputs) { if (inputs[0]?.[0]) this.port.postMessage(inputs[0][0]); return true; }
          }
          registerProcessor('voice-capture', Capture);
        `,
            ],
            { type: "text/javascript" },
          ),
        );
        try {
          await this.context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        if (this.closed) return;
        this.worklet = new AudioWorkletNode(this.context, "voice-capture");
        this.context.createMediaStreamSource(this.stream).connect(this.worklet);
        const silent = this.context.createGain();
        silent.gain.value = 0;
        this.worklet.connect(silent).connect(this.context.destination);
        this.worklet.port.onmessage = ({
          data,
        }: MessageEvent<Float32Array>) => {
          if (!this.holding || !this.ready || this.closed || this.responding)
            return;
          const ratio = this.context!.sampleRate / 24000;
          const bytes = new Uint8Array(Math.floor(data.length / ratio) * 2);
          const view = new DataView(bytes.buffer);
          for (let i = 0; i < bytes.length / 2; i++) {
            const n = Math.max(-1, Math.min(1, data[Math.floor(i * ratio)]));
            view.setInt16(i * 2, n < 0 ? n * 32768 : n * 32767, true);
          }
          this.sentAudio = true;
          this.send({
            type: "input_audio_buffer.append",
            audio: btoa(String.fromCharCode(...bytes)),
          });
        };
      }
      if (this.closed) return;
      this.session = await voicePost("session", {});
      this.started = Date.now();
      if (this.closed) {
        this.reportEnd();
        return;
      }
      this.timer = setInterval(() => {
        const left = Math.max(
          0,
          Math.ceil((this.session!.expires_at * 1000 - Date.now()) / 1000),
        );
        this.cb.remaining(left);
        if (!left) this.stop();
      }, 250);
      this.cb.remaining(this.session!.seconds);
      if (this.session!.mock) {
        this.ready = true;
        this.cb.status("開発用モック：押して話すと固定例を実行します。");
        return;
      }
      this.socket = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(this.session!.model)}`,
        ["xai-client-secret." + this.session!.token],
      );
      this.socket.onopen = () => {
        const s = this.session!;
        this.send({
          type: "session.update",
          session: {
            instructions: s.instructions,
            voice: "eve",
            turn_detection: null,
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: { language_hint: "ja" },
              },
              output: { format: { type: "audio/pcm", rate: 24000 } },
            },
            tools: s.tools,
          },
        });
      };
      this.socket.onmessage = (e) => {
        void this.receive(e.data).catch(() => this.fail());
      };
      this.socket.onerror = () => this.fail();
      this.socket.onclose = () => this.stop();
    } catch (e) {
      if (e instanceof VoiceClientError && e.code === "login_required")
        this.cb.loginRequired?.();
      if (!this.closed)
        this.cb.status(
          e instanceof VoiceClientError
            ? e.message
            : "音声を開始できませんでした。",
        );
      this.stop();
    }
  }
  press() {
    if (this.closed || this.responding) return;
    this.holding = true;
    this.stopPlayback();
    if (this.ready) this.cb.status("聞いています。離すと送信します。");
  }
  release() {
    if (!this.holding) return;
    this.holding = false;
    if (!this.ready || this.closed || this.responding) return;
    if (this.session?.mock) {
      void this.mockTurn().catch(() => this.fail());
      return;
    }
    if (this.sentAudio) {
      this.sentAudio = false;
      this.playbackStopped = false;
      this.responding = true;
      this.send({ type: "input_audio_buffer.commit" });
      this.send({ type: "response.create" });
      this.cb.status("Grokが応答しています…");
    }
  }
  private async invoke(call: {
    name: string;
    call_id: string;
    arguments: string;
  }) {
    const input = JSON.parse(call.arguments) as Record<string, unknown>;
    this.cb.event({
      type: "tool-call",
      id: call.call_id,
      tool: call.name,
      input,
    });
    try {
      const result = await voicePost("tool", {
        sessionId: this.session!.sessionId,
        ...call,
        arguments: input,
      });
      if (this.closed) return;
      this.cb.event({
        type: "tool-result",
        id: call.call_id,
        tool: call.name,
        ...result,
      });
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: result.output,
        },
      });
    } catch {
      if (this.closed) return;
      this.cb.event({
        type: "tool-result",
        id: call.call_id,
        tool: call.name,
        summary: "道具を実行できませんでした。",
        durationMs: 0,
        error: true,
      });
      this.send({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: "道具を実行できませんでした。",
        },
      });
    }
  }
  private async receive(raw: string) {
    if (this.closed) return;
    const e = JSON.parse(raw);
    if (e.type === "session.updated") {
      this.ready = true;
      this.cb.status(
        "マイクを押して話してください（スペースキーも使えます）。",
      );
    } else if (
      e.type === "conversation.item.input_audio_transcription.completed"
    ) {
      this.cb.transcript("user", String(e.transcript ?? ""));
    } else if (e.type === "response.output_audio_transcript.done") {
      this.cb.transcript("assistant", String(e.transcript ?? ""));
    } else if (e.type === "response.output_audio.delta") {
      if (this.playbackStopped) return;
      const bytes = Uint8Array.from(atob(e.delta), (c) => c.charCodeAt(0));
      const context = this.context!;
      const buffer = context.createBuffer(
        1,
        Math.floor(bytes.length / 2),
        24000,
      );
      const floats = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < floats.length; i++)
        floats[i] = view.getInt16(i * 2, true) / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const start = Math.max(context.currentTime, this.nextAudio);
      source.start(start);
      this.nextAudio = start + buffer.duration;
      this.sources.add(source);
      source.onended = () => this.sources.delete(source);
    } else if (e.type === "response.function_call_arguments.done") {
      if (!this.seen.has(e.call_id)) {
        this.seen.add(e.call_id);
        this.calls.push(e);
      }
    } else if (e.type === "response.done") {
      const calls = this.calls.splice(0);
      if (calls.length) {
        // response.done closes the batch: all parallel outputs precede response.create.
        await Promise.all(calls.map((c) => this.invoke(c)));
        this.send({ type: "response.create" });
      } else {
        this.responding = false;
        this.cb.status("押して次の質問を話せます。");
      }
    } else if (e.type === "error") this.fail();
  }
  private async mockTurn() {
    this.responding = true;
    this.cb.transcript("user", "引越しの日取りの記事を教えてください。");
    await this.invoke({
      name: "search_articles",
      call_id: crypto.randomUUID(),
      arguments: JSON.stringify({ query: "引越し" }),
    });
    if (this.closed) return;
    const text =
      "公開記事を調べました。日取りは参考情報として、費用や通勤などの条件と合わせて検討してください。";
    this.cb.transcript("assistant", text);
    if (typeof speechSynthesis !== "undefined") {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      speechSynthesis.speak(utterance);
    }
    this.responding = false;
    this.cb.status("開発用モックの応答が完了しました。");
  }
  stopPlayback() {
    this.playbackStopped = true;
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    this.sources.clear();
    this.nextAudio = 0;
    if (this.session?.mock && typeof speechSynthesis !== "undefined")
      speechSynthesis.cancel();
  }
  private fail() {
    this.cb.status("音声の接続が終了しました。もう一度お試しください。");
    this.stop();
  }
  private reportEnd() {
    if (this.session)
      void voicePost("end", {
        sessionId: this.session.sessionId,
        seconds: Math.min(
          this.session.seconds,
          Math.max(0, (Date.now() - this.started) / 1000),
        ),
      }).catch(() => {});
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    this.holding = false;
    clearInterval(this.timer);
    this.socket?.close();
    this.worklet?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stopPlayback();
    void this.context?.close();
    this.reportEnd();
    this.cb.ended();
  }
}
