export function voiceState(
  env: Record<string, string | undefined> = process.env,
) {
  const mock = env.NODE_ENV === "development" && env.MCP_VOICE_MOCK === "true";
  return {
    enabled:
      env.MCP_VOICE_ENABLED === "true" &&
      (Boolean(env.XAI_API_KEY?.trim()) || mock),
    mock,
    model: env.XAI_VOICE_MODEL?.trim() || "grok-voice-3.0",
  };
}
export function voiceLimit(name: string, fallback: number) {
  const n = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}
