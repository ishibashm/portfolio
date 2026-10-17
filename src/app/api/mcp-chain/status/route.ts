import { agentBillingState } from "@/lib/agentBillingState";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
import { canUseAgent } from "@/lib/agentEntitlement";
import { clientKey } from "@/lib/apiGuard";
import { agentSessionUser } from "@/lib/agentSession";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { enabled, mock } = chainLlmState();
  const session = enabled
    ? await agentSessionUser(request)
    : { signedIn: false };
  return Response.json(
    {
      paused: agentBillingState().paused,
      enabled,
      mock,
      voiceEnabled: voiceState().enabled,
      voiceMock: voiceState().mock,
      remaining: canUseAgent({
        ...("userId" in session && session.userId
          ? { userId: session.userId }
          : {}),
        ip: clientKey(request.headers),
        mode: "llm",
        inspect: true,
      }).remaining,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
