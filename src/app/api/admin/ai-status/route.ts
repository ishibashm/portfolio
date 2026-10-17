import { denyUnlessAdmin } from "@/lib/adminApi";
import { agentBillingState } from "@/lib/agentBillingState";
export const dynamic = "force-dynamic";
export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { paused, lastBillingAt } = agentBillingState();
  return Response.json(
    { paused, lastBillingAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
