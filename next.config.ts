import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/kb',
        destination: 'https://knowledge-base-app-116694017128.us-central1.run.app',
      },
      {
        source: '/kb/:path*',
        destination: 'https://knowledge-base-app-116694017128.us-central1.run.app/:path*',
      },
    ];
  },
};

export default nextConfig;
