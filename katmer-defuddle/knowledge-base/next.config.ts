import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  basePath: "/kb",
  async rewrites() {
    return [
      {
        // NextAuth v4 が basePath 環境下で /api/auth を落としてしまうバグの対策
        // Googleから戻ってきたコールバックを正しいAPIルートに内部転送する
        source: "/callback/:provider",
        destination: "/api/auth/callback/:provider",
      },
    ];
  },
};

export default nextConfig;
