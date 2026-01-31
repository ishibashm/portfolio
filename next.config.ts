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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ymqiqscelqqkozqwoiko.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
