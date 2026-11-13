import {
  chainLlmState,
  DEFAULT_AGENT_MODEL,
  DEFAULT_FALLBACK_MODEL,
} from "./mcpAgentConfig";
export type AgentPrice = { input: number; output: number };
/** Unknown prices stay null. No guessed xAI tariff. Units: USD / million tokens. */
export const AGENT_PRICING: Record<string, AgentPrice | null> = {
  [`google:${DEFAULT_AGENT_MODEL}`]: { input: 1.5, output: 7.5 },
  [`google:${DEFAULT_FALLBACK_MODEL}`]: { input: 0.3, output: 2.5 },
};
export function agentPrice(
  model: string,
  env: Record<string, string | undefined> = process.env,
): AgentPrice | null {
  if (
    env.MCP_AGENT_GOOGLE_FREE_TIER === "true" &&
    (model === `google:${DEFAULT_AGENT_MODEL}` ||
      model === `google:${DEFAULT_FALLBACK_MODEL}`)
  )
    return { input: 0, output: 0 };
  const builtin = AGENT_PRICING[model] ?? null;
  try {
    const value = JSON.parse(env.MCP_AGENT_PRICING_JSON || "{}")[model];
    if (
      value &&
      typeof value.input === "number" &&
      typeof value.output === "number" &&
      Number.isFinite(value.input) &&
      Number.isFinite(value.output) &&
      value.input >= 0 &&
      value.output >= 0
    ) {
      if (builtin) {
        return {
          input: Math.max(builtin.input, value.input),
          output: Math.max(builtin.output, value.output),
        };
      }
      if (value.input > 0 && value.output > 0) {
        return { input: value.input, output: value.output };
      }
    }
  } catch {
    /* Missing or malformed prices fail closed. */
  }
  return builtin;
}
export function agentCost(model: string, input: number, output: number) {
  const price = agentPrice(model);
  if (
    !price ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    return null;
  const cost = (input * price.input + output * price.output) / 1e6;
  return Number.isFinite(cost) ? cost : null;
}
/**
 * Fallback model to use only when its price is known. An unpriced fallback is
 * skipped (no call) instead of blocking the priced primary model.
 */
export function pricedFallbackModel(): string {
  const state = chainLlmState();
  if (!state.fallbackModel) return "";
  if (state.mock) return state.fallbackModel;
  return agentPrice(`${state.provider}:${state.fallbackModel}`)
    ? state.fallbackModel
    : "";
}
export function agentReservation(tokens: number): number | null {
  const state = chainLlmState();
  if (state.mock) return 0;
  if (!state.model) return null;
  const primary = agentPrice(`${state.provider}:${state.model}`);
  if (!primary) return null;
  const fallback = pricedFallbackModel();
  const prices = [
    primary,
    ...(fallback ? [agentPrice(`${state.provider}:${fallback}`)!] : []),
  ];
  return (
    (tokens *
      Math.max(...prices.flatMap((price) => [price.input, price.output]))) /
    1e6
  );
}
export function agentDailyBudget() {
  const raw = process.env.MCP_AGENT_DAILY_BUDGET_USD;
  if (raw === undefined) return 0.2;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0; // invalid configuration stops paid calls
}
