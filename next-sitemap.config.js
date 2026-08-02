/**
 * サイトマップの除外は src/lib/siteStructure.ts の NON_CORE_ROUTES に合わせる。
 * next-sitemap は CommonJS の設定ファイルで TypeScript を読めないため、
 * ここだけは同じ一覧を手で持つ。片方を変えたらもう片方も直すこと。
 */
const NON_CORE = [
  "/dashboard",
  "/metaphysical",
  "/trends",
  "/rentals",
  "/relocation/history",
  "/visualizer",
  "/x-viewer",
  "/research",
  "/extract",
  "/agent-log",
  "/ceremonial-sample",
];

// ルートハンドラ（robots.txt / ads.txt / llms.txt など）まで
// サイトマップに載ってしまうため除外する。ログイン画面も索引する意味がない。
const NOT_A_PAGE = [
  "/robots.txt",
  "/ads.txt",
  "/llms.txt",
  "/llms-full.txt",
  "/login",
];

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://cloud-palette.com",
  generateRobotsTxt: false, // src/app/robots.ts を使用するため
  sitemapSize: 7000,
  exclude: [
    "/admin/*",
    "/api/*",
    ...NON_CORE,
    ...NON_CORE.map((p) => `${p}/*`),
    ...NOT_A_PAGE,
  ],
};
