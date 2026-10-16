/** 既定モデルは利用者が確認した Google Models（2026-10-13更新）に基づく。
 * https://ai.google.dev/gemini-api/docs/models （この作業ではネットワーク再確認なし）
 */
export const DEFAULT_AGENT_MODEL = "gemini-4-argon";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export function chainLlmState(
  env: Record<string, string | undefined> = process.env,
) {
  const mock = env.NODE_ENV === "development" && env.MCP_AGENT_MOCK === "true";
  const apiKey =
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  const configured = env.MCP_AGENT_ENABLED === "true" && Boolean(apiKey);
  const model = env.MCP_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;
  // 主モデルが無料枠の gemini-3.5-flash でも切り替え先が残るよう、既定は無料枠で動く lite（2026-10-16 実鍵で確認）。
  const fallback =
    env.MCP_AGENT_FALLBACK_MODEL?.trim() ?? DEFAULT_FALLBACK_MODEL;
  return {
    fallbackModel: fallback === model ? "" : fallback,
    configured,
    enabled: env.MCP_AGENT_ENABLED === "true" && (Boolean(apiKey) || mock),
    mock,
    model,
  };
}
