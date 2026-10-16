import { chainLlmState } from "@/lib/mcpAgentConfig";
import { voiceState } from "@/lib/mcpVoiceConfig";
export const dynamic = "force-dynamic";
export function GET() {
  const { enabled, mock } = chainLlmState();
  return Response.json(
    {
      enabled,
      mock,
      voiceEnabled: voiceState().enabled,
      voiceMock: voiceState().mock,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
