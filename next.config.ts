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
      /*
        Search Console の 404 一覧（2026-08-16 の書き出し・19 件）にあった
        もののうち、**後継がはっきりしている 1 つ**だけ受ける。

        内訳は 15 件が /_next/static/media/*.woff2（ビルドごとにハッシュが
        変わるフォント。古い版の残骸で、放っておけば消える）、
        /about と /blog は**いま実在する**（クロールが 2026-02 で古いだけ）、
        /portfolio は旧サイトの頁で後継が無い。

        後継が無いものを送らないのは、送り先の中身が元の頁と無関係だと
        Google が soft 404 として扱うため。**404 のままが正しい。**
      */
      {
        // 問い合わせ。日本語の URL から英語の経路へ移した。
        source: "/お問い合わせ",
        destination: "/contact",
        permanent: true,
      },
      {
        // 上と同じ宛先。符号化された形で来たときも受ける。
        source: "/%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B",
        destination: "/contact",
        permanent: true,
      },
      {
        /*
          購読の口。RSS は /blog/feed.xml にある。

          Search Console が `/feed/` を「noindex タグによって除外」として
          挙げていた。実在しないので 404 ページが返り、その 404 ページに
          noindex が付いているだけ、という読み方になる。

          `/feed` は旧サイト（WordPress 系）の慣習的な経路で、**後継が
          はっきりしている**ので送る。ここは soft 404 の心配が無い
          （送り先が元の URL の目的とまったく同じ）。
        */
        source: "/feed",
        destination: "/blog/feed.xml",
        permanent: true,
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
