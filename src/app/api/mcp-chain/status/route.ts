import { chainLlmState } from "@/lib/mcpAgentConfig";
export const dynamic = "force-dynamic";
export function GET() {
  const { enabled, mock } = chainLlmState();
  return Response.json(
    { enabled, mock },
    { headers: { "Cache-Control": "no-store" } },
  );
}
