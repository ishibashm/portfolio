export async function register() {
  // Next.js の推奨形。edge 側のビルドでは NEXT_RUNTIME が置き換わり、
  // この分岐ごと消えるので pg などの Node 専用モジュールを束ねない。
  if (process.env.NEXT_RUNTIME === "nodejs") {
    void import("./instrumentation-node")
      .then((m) => m.warmOnStartup())
      .catch(() => {});
  }
}
