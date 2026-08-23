import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @ts-expect-error -- vite と vitest で plugin の型が食い違う
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    // 暦・天体計算のテストは、実際に年単位で日を回すため 1 本で数秒かかる。
    // 既定の 5 秒だと、並列実行や他の処理と重なったときに毎回違うテストが
    // タイムアウトで落ちる（アサーション失敗ではない）。揺らぐテストは
    // 退行を隠すので、計算量に見合う値にする。
    testTimeout: 30000,
    hookTimeout: 30000,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
