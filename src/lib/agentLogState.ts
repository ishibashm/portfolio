export type AgentLogFeedState = "ready" | "empty" | "unavailable";

export function getAgentLogFeedState(
  hasDatabaseError: boolean,
  logCount: number,
): AgentLogFeedState {
  if (hasDatabaseError) return "unavailable";
  return logCount === 0 ? "empty" : "ready";
}
