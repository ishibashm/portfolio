import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  basePath: "/kb",
  // メタタグは HTML にしか付かない。API の応答や添付ファイルまで含めて
  // 索引から外すため、ヘッダでも同じことを言う（layout.tsx の説明を参照）。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
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
