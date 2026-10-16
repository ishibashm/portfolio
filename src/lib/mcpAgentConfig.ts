/** 既定モデルは利用者が確認した Google Models（2026-10-13更新）に基づく。
 * https://ai.google.dev/gemini-api/docs/models （この作業ではネットワーク再確認なし）
 */
export const DEFAULT_AGENT_MODEL = "gemini-4-argon";
export function chainLlmState(
  env: Record<string, string | undefined> = process.env,
) {
  const mock = env.NODE_ENV === "development" && env.MCP_AGENT_MOCK === "true";
  const apiKey =
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  const configured = env.MCP_AGENT_ENABLED === "true" && Boolean(apiKey);
  return {
    configured,
    enabled: env.MCP_AGENT_ENABLED === "true" && (Boolean(apiKey) || mock),
    mock,
    model: env.MCP_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL,
  };
}
