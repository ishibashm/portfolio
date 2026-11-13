export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  void import("./lib/mcpPublicLimit")
    .then((m) => {
      if (m.shouldAutoWarmMcpRateDb()) void m.warmMcpRateDb();
    })
    .catch(() => {});
}
