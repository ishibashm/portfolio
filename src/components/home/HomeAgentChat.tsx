"use client";
import { useEffect, useState } from "react";
import { McpExplorer } from "@/app/houi/mcp-explorer/McpExplorer";
export default function HomeAgentChat({
  initialQuestion,
}: {
  initialQuestion: string;
}) {
  const [state, setState] = useState<{
    enabled: boolean;
    mock: boolean;
    voiceEnabled?: boolean;
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
    />
  ) : (
    <p role="status">利用できる方式を確認しています…</p>
  );
}
