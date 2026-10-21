import { paidApisDisabled } from "./paidApis";

/** Google remains the default. xAI requires an explicit model and key. */
export const DEFAULT_AGENT_MODEL = "gemini-3.5-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export function chainLlmState(
  env: Record<string, string | undefined> = process.env,
) {
  const provider = env.MCP_AGENT_PROVIDER?.trim() || "google";
  const supported = provider === "google" || provider === "xai";
  const mock = env.NODE_ENV === "development" && env.MCP_AGENT_MOCK === "true";
  const apiKey =
    provider === "xai"
      ? env.XAI_API_KEY?.trim()
      : env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  const model =
    provider === "xai"
      ? env.XAI_AGENT_MODEL?.trim() || ""
      : env.MCP_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;
  const fallback =
    provider === "xai"
      ? env.XAI_AGENT_FALLBACK_MODEL?.trim() || ""
      : (env.MCP_AGENT_FALLBACK_MODEL?.trim() ?? DEFAULT_FALLBACK_MODEL);
  const configured =
    supported &&
    env.MCP_AGENT_ENABLED === "true" &&
    Boolean(apiKey) &&
    Boolean(model);
  const enabled =
    !paidApisDisabled(env) &&
    supported &&
    env.MCP_AGENT_ENABLED === "true" &&
    (configured || mock);
  return {
    provider,
    fallbackModel: fallback === model ? "" : fallback,
    configured,
    enabled,
    mock,
    model,
  };
}
