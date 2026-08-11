/**
 * サイトマップの除外。
 *
 * 以前はここに同じ一覧を手で持ち「片方を変えたらもう片方も直すこと」と
 * 書いてあったが、実際には食い違っていた。すでに削除した 9 ページ
 * （/dashboard /metaphysical /trends /rentals /visualizer /x-viewer
 * /research /extract /agent-log /ceremonial-sample）を除外し続け、
 * siteStructure.ts の「1 か所に決める」という方針も崩れていた。
 *
 * next-sitemap は CommonJS で TypeScript を読めないので、実体を JSON に
 * 置いて両方から読む。__tests__/nonCoreRoutes.test.ts が一致を見張る。
 */
const NON_CORE = require("./src/lib/nonCoreRoutes.json").routes;

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
