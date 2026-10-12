import type { McpProfileReader } from "@/lib/mcpProfiles";
import type { McpAuthContext } from "@/lib/mcpAuth";
import { createMcpBaseServer } from "@/lib/mcpServer";
import { registerPersonalProfileTools } from "@/lib/mcpPersonalTools";
import { registerPersonalCalculationTools } from "@/lib/mcpPersonalCalculationTools";

/** Dormant factory. The HTTP boundary must authenticate every request before
 * calling this; never cache a server or reuse it for another request/user.
 * The six common tools keep their existing explicit-input calculations. Only
 * the personal time variant is registered, so there is no name collision.
 */
export function createMcpPersonalServer(
  auth: McpAuthContext,
  requestedAt = new Date(),
  read?: McpProfileReader,
) {
  const server = createMcpBaseServer();
  registerPersonalProfileTools(server, auth, read);
  registerPersonalCalculationTools(server, auth, requestedAt, read);
  return server;
}
