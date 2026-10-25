"use client";

import { useEffect, useRef, useState } from "react";

export function fortuneMessageHeight(
  event: MessageEvent,
  source: Window | null,
): number | null {
  if (!source || event.source !== source || event.origin !== "null")
    return null;
  const data: unknown = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const message = data as Record<string, unknown>;
  if (
    Object.keys(message).length !== 2 ||
    message.type !== "ai-fortune-height" ||
    typeof message.height !== "number" ||
    !Number.isFinite(message.height)
  )
    return null;
  return Math.min(4000, Math.max(120, Math.ceil(message.height)));
}

export function FortuneFrame({ srcdoc }: { srcdoc: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const next = fortuneMessageHeight(
        event,
        iframe.current?.contentWindow ?? null,
      );
      if (next !== null) setHeight(next);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return (
    <iframe
      ref={iframe}
      title="AI装飾の運勢レポート"
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={{ width: "100%", height, border: 0 }}
    />
  );
}
