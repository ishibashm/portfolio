import { agentBillingState } from "@/lib/agentBillingState";
import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
import { canUseAgent } from "@/lib/agentEntitlement";
import { agentReservation } from "@/lib/agentPricing";
import { clientKey } from "@/lib/apiGuard";
import { agentSessionUser } from "@/lib/agentSession";
import { voiceStore } from "@/lib/mcpVoiceStore";
import { remindersConfig } from "@/lib/reminders";
import { PAID_APIS_DISABLED_REASON, paidApisDisabled } from "@/lib/paidApis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const paidDisabled = paidApisDisabled();
  const { enabled, mock, provider } = chainLlmState();
  const voice = voiceState();
  const session =
    enabled || voice.enabled
      ? await agentSessionUser(request)
      : { signedIn: false };
  let voiceAvailable = voice.enabled;
  if (voice.enabled) {
    try {
      await voiceStore.sweepExpired();
    } catch {
      voiceAvailable = false;
    }
  }
  return Response.json(
    {
      paused: paidDisabled ? true : agentBillingState().paused,
      ...(paidDisabled ? { reason: PAID_APIS_DISABLED_REASON } : {}),
      enabled,
      provider,
      // AI回答の単価がそろっているか（false ならAI回答は呼び出し前に止まる）。
      aiPriced: enabled ? agentReservation(1) !== null : null,
      mock,
      voiceEnabled: voice.enabled,
      voiceMock: voice.mock,
      voiceAvailable,
      voiceRequiresLogin: true,
      voiceSignedIn: session.signedIn,
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
