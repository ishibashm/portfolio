import { personalMcpUnavailableResponse } from "@/lib/mcpDiscovery";

export const dynamic = "force-dynamic";

// Keep discovery closed until login → consent → execute → revoke → reject has
// passed locally AND in the target clients, with the actual AS deployment.
// AS discovery itself belongs to oidc-provider, not a second Next route.
export function GET() {
  return personalMcpUnavailableResponse();
}
