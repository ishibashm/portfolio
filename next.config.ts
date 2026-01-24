import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // コメントアウト: 通常モードでビルドする
  serverExternalPackages: ["prisma", "@prisma/client"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("prisma", "@prisma/client");
    }
    return config;
  },
  /* config options here */
};

export default nextConfig;
