import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // コメントアウト: 通常モードでビルドする
  serverExternalPackages: ["prisma", "@prisma/client"],
  /* config options here */
};

export default nextConfig;
