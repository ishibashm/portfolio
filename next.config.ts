import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
  // www is mapped to this same Cloud Run service, so the canonical-host
  // redirect is issued here rather than at the edge.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.cloud-palette.com" }],
        destination: "https://cloud-palette.com/:path*",
        statusCode: 301,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}/:path*`
          : "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
