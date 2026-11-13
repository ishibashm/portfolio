import { shouldAutoWarmMcpRateDb, warmMcpRateDb } from "./lib/mcpPublicLimit";

/** Node ランタイムでだけ読み込む。公開 MCP の上限用 DB 接続を先に張っておく。 */
export function warmOnStartup(): void {
  if (shouldAutoWarmMcpRateDb()) void warmMcpRateDb();
}
