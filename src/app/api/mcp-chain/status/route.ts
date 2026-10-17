import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
import { canUseAgent } from "@/lib/agentEntitlement";
import { clientKey } from "@/lib/apiGuard";
import { agentSessionUser } from "@/lib/agentSession";
import { remindersConfig } from "@/lib/reminders";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { enabled, mock } = chainLlmState();
  const session = enabled
    ? await agentSessionUser(request)
    : { signedIn: false };
  return Response.json(
    {
      enabled,
      mock,
      voiceEnabled: voiceState().enabled,
      voiceMock: voiceState().mock,
      // お知らせメールの鍵がそろっているか（中身は返さない）。
      remindersEnabled: remindersConfig().enabled,
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
