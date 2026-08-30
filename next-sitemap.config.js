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
// next-sitemap がこの設定を CommonJS として読む（上の説明）ので、ここだけは
// require 以外に書きようがない。import に書き換えると sitemap 生成が落ちる。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nonCoreRoutes = require("./src/lib/nonCoreRoutes.json");
const { routes: NON_CORE, offTheme: OFF_THEME } = nonCoreRoutes;

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

/**
 * 市区町村ページのうち、**固有の文章を書いて索引に戻した**もの
 * （src/lib/areaEditorial.ts の AREA_EDITORIAL）。
 *
 * 上の THIN_GENERATED が /houi/area/* を丸ごと外すので、書いた頁だけ
 * additionalPaths で戻す。**index にした頁とサイトマップに載せる頁が
 * 食い違うと指示が矛盾する**（noindex なのに載っている、の逆）。
 *
 * ここに書き写しているのは、この設定が JS で TS の表を読めないから。
 * ずれると意味が無いので、__tests__/sitemapThinPages.test.ts が
 * AREA_EDITORIAL の鍵と 1 件ずつ突き合わせて落とす。
 */
const AREA_EDITORIAL_PATHS = [
  "/houi/area/01101",
  "/houi/area/01202",
  "/houi/area/01204",
  "/houi/area/01206",
  "/houi/area/01207",
  "/houi/area/01208",
  "/houi/area/01213",
  "/houi/area/02201",
  "/houi/area/02202",
  "/houi/area/02203",
  "/houi/area/03201",
  "/houi/area/04101",
  "/houi/area/05201",
  "/houi/area/06201",
  "/houi/area/07201",
  "/houi/area/07202",
  "/houi/area/07204",
  "/houi/area/08201",
  "/houi/area/08202",
  "/houi/area/08220",
  "/houi/area/09201",
  "/houi/area/10201",
  "/houi/area/10202",
  "/houi/area/10205",
  "/houi/area/11103",
  "/houi/area/12101",
  "/houi/area/13103",
  "/houi/area/13104",
  "/houi/area/13111",
  "/houi/area/13112",
  "/houi/area/13121",
  "/houi/area/14104",
  "/houi/area/15103",
  "/houi/area/15202",
  "/houi/area/15222",
  "/houi/area/16201",
  "/houi/area/16202",
  "/houi/area/17201",
  "/houi/area/18201",
  "/houi/area/19201",
  "/houi/area/20201",
  "/houi/area/20202",
  "/houi/area/21201",
  "/houi/area/22101",
  "/houi/area/22138",
  "/houi/area/22203",
  "/houi/area/23106",
  "/houi/area/23201",
  "/houi/area/24201",
  "/houi/area/24202",
  "/houi/area/25201",
  "/houi/area/26106",
  "/houi/area/27123",
  "/houi/area/27127",
  "/houi/area/27227",
  "/houi/area/28110",
  "/houi/area/28201",
  "/houi/area/28202",
  "/houi/area/28204",
  "/houi/area/29201",
  "/houi/area/30201",
  "/houi/area/31201",
  "/houi/area/31202",
  "/houi/area/32201",
  "/houi/area/32203",
  "/houi/area/33101",
  "/houi/area/34101",
  "/houi/area/34105",
  "/houi/area/34202",
  "/houi/area/34207",
  "/houi/area/34212",
  "/houi/area/35201",
  "/houi/area/35203",
  "/houi/area/35215",
  "/houi/area/36201",
  "/houi/area/37201",
  "/houi/area/38201",
  "/houi/area/38202",
  "/houi/area/38203",
  "/houi/area/39201",
  "/houi/area/40106",
  "/houi/area/40132",
  "/houi/area/40202",
  "/houi/area/40203",
  "/houi/area/41201",
  "/houi/area/42201",
  "/houi/area/42202",
  "/houi/area/43101",
  "/houi/area/44201",
  "/houi/area/45201",
  "/houi/area/45202",
  "/houi/area/46201",
  "/houi/area/46225",
  "/houi/area/47201",
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
    ...OFF_THEME,
    ...OFF_THEME.map((p) => `${p}/*`),
    ...NOT_A_PAGE,
    ...THIN_GENERATED,
  ],
  /* 戻す一覧そのもの。検査（sitemapThinPages）が AREA_EDITORIAL と
     突き合わせるために読む。next-sitemap は知らない鍵を無視する */
  additionalPathsSource: AREA_EDITORIAL_PATHS,
  /* exclude で外した市区町村ページのうち、文章を書いた頁だけ戻す。
     additionalPaths は exclude の後に足されるので、除外を緩めずに
     数頁だけ載せられる */
  additionalPaths: async (config) =>
    Promise.all(
      AREA_EDITORIAL_PATHS.map((loc) => config.transform(config, loc)),
    ),
};
