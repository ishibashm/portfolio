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
// offTheme はテーマ外だが道具として残すルート（ログイン不要）。sitemap からは外す。
const {
  routes: NON_CORE,
  offTheme: OFF_THEME,
} = require("./src/lib/nonCoreRoutes.json");

// ルートハンドラ（robots.txt / ads.txt / llms.txt など）まで
// サイトマップに載ってしまうため除外する。ログイン画面も索引する意味がない。
const NOT_A_PAGE = [
  "/robots.txt",
  "/ads.txt",
  "/llms.txt",
  "/llms-full.txt",
  "/blog/feed.xml",
  "/login",
];

/**
 * 雛形を展開しただけのページ。**索引に載せない**ので、サイトマップからも
 * 外す。noindex とサイトマップの両方に載せると指示が食い違う。
 *
 * 対象は市区町村別（1,022 ページ。地の文はどの URL でも同一で、変わるのは
 * 地名と表の数字だけ）と、月別（2 年 × 9 星 × 12 か月 = 216 ページ。
 * 月盤の数値だけが違う）。**年別の 27 ページは残す**（本命星ごとに吉凶の
 * 並びがまるごと変わるため）。
 *
 * AdSense に「有用性の低いコンテンツ」でサイト全体の配信を止められた。
 * Search Console の実測でも、この 1,238 ページは事実上索引されていない
 * （878 URL のうち登録済み 78 / 検出only 811 / 表示回数ほぼ 0）ので、
 * 外して失う流入は無い。
 *
 * NON_CORE のように JSON へ出していないのは、**参照するのがここだけ**
 * だから。テストは exclude をこのファイルから読むので、実体が 2 か所に
 * なることはない。
 *
 * **照合は glob ではない。**next-sitemap は minimatch も fast-glob も
 * 使わず、パターンを `^...$` の正規表現に直して当てる。そのとき
 * アスタリスクは `[\s\S]*` になるので、**`/` を越える**（glob の常識と逆）。
 * ここのパターンは段数がぴったり合うかで判断できる形に選んであり、
 * 越えるかどうかに依らない。段数を変えるときは
 * __tests__/sitemapThinPages.test.ts を必ず見ること。
 */
const THIN_GENERATED = ["/houi/area/*", "/houi/*/*/*"];

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
    ...OFF_THEME,
    ...OFF_THEME.map((p) => `${p}/*`),
    ...NOT_A_PAGE,
    ...THIN_GENERATED,
  ],
};
