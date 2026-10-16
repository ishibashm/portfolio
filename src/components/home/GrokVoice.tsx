"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/mcpAgent";
import { VoiceClient } from "@/lib/voiceClient";
export default function GrokVoice({
  onTranscript,
  onEvent,
  disabled = false,
}: {
  onTranscript: (role: "user" | "assistant", text: string) => void;
  onEvent: (event: AgentEvent) => void;
  disabled?: boolean;
}) {
  const client = useRef<VoiceClient | null>(null);
  const callbacks = useRef({ onTranscript, onEvent });
  useEffect(() => {
    callbacks.current = { onTranscript, onEvent };
  }, [onTranscript, onEvent]);
  const [active, setActive] = useState(false);
  const [holding, setHolding] = useState(false);
  const [status, setStatus] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const stop = () => {
      client.current?.stop();
      client.current = null;
    };
    const blur = () => {
      client.current?.release();
      setHolding(false);
    };
    window.addEventListener("pagehide", stop);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("blur", blur);
      stop();
    };
  }, []);
  function press() {
    if (disabled) return;
    if (!client.current) {
      const instance = new VoiceClient({
        transcript: (role, text) => callbacks.current.onTranscript(role, text),
        event: (event) => callbacks.current.onEvent(event),
        status: setStatus,
        remaining: setRemaining,
        ended: () => {
          client.current = null;
          setActive(false);
          setHolding(false);
        },
      });
      client.current = instance;
      setActive(true);
      setStatus("音声を準備しています…");
      void instance.start();
    }
    setHolding(true);
    client.current.press();
  }
  function release() {
    setHolding(false);
    client.current?.release();
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <p className="text-sm">
        Grok
        音声モード：音声・文字起こし・道具の結果をxAIに送信します。このサイトには保存しません。氏名や詳しい住所は話さないでください。
      </p>
      <button
        type="button"
        disabled={disabled}
        aria-label="押して話す"
        aria-pressed={holding}
        className="touch-none rounded-xl bg-slate-800 px-5 py-3 text-white disabled:opacity-50"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onBlur={release}
        onKeyDown={(e) => {
          if (e.code === "Space") {
            e.preventDefault();
            if (!e.repeat) press();
          }
        }}
        onKeyUp={(e) => {
          if (e.code === "Space") {
            e.preventDefault();
            release();
          }
        }}
      >
        {holding ? "話しています…離して送信" : "🎙 押して話す（スペースキー）"}
      </button>
      {active && (
        <>
          <span className="ml-3 text-sm">残り{remaining}秒</span>
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => client.current?.stopPlayback()}
          >
            再生を停止
          </button>
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => {
              client.current?.stop();
              setStatus("音声を終了しました。");
            }}
          >
            音声を終了
          </button>
        </>
      )}
      <p role="status" className="text-sm">
        {status}
      </p>
    </div>
  );
}
