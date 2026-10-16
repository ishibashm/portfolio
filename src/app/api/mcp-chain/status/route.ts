import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
import { canUseAgent } from "@/lib/agentEntitlement";
import { clientKey } from "@/lib/apiGuard";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const { enabled, mock } = chainLlmState();
  return Response.json(
    {
      enabled,
      mock,
      voiceEnabled: voiceState().enabled,
      voiceMock: voiceState().mock,
      remaining: canUseAgent({
        ip: clientKey(request.headers),
        mode: "llm",
        inspect: true,
      }).remaining,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
