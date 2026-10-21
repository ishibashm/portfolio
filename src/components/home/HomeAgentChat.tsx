"use client";
import { useEffect, useState } from "react";
import { McpExplorer } from "@/app/ask/McpExplorer";
import { GuideAvatar } from "@/components/guide/GuideCharacter";
export default function HomeAgentChat({
  initialQuestion,
}: {
  initialQuestion: string;
}) {
  const [state, setState] = useState<{
    enabled: boolean;
    mock: boolean;
    voiceEnabled?: boolean;
    paused?: unknown;
    reason?: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/mcp-chain/status", { signal: abort.signal })
      .then((r) => r.json())
      .then(setState)
      .catch(() => {
        if (!abort.signal.aborted) setState({ enabled: false, mock: false });
      });
    return () => abort.abort();
  }, []);
  return state ? (
    <McpExplorer
      voiceEnabled={state.voiceEnabled}
      agentEnabled={state.enabled}
      mock={state.mock}
      initialQuestion={initialQuestion}
      paidApisPaused={
        state.paused === true || state.reason === "paidApisDisabled"
      }
    />
  ) : (
    <div className="mt-4 flex items-center gap-3">
      <GuideAvatar pose="compass" size="sm" decorative />
      <p role="status">利用できる方式を確認しています…</p>
    </div>
  );
}
