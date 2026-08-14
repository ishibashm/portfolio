/**
 * 主要ページが「開いて、描画されるか」を実ブラウザで一巡する煙試験。
 *
 * 2026-08-14 に本番で、地図が廃止済みの項目（yieldScore）を読んでいて
 * 画面が真っ白になる事故を出した。tsc も vitest も通っていた。型定義に
 * 項目が残っていたので型検査は素通りし、単体テストは描画を見ないため
 * 気付けなかった。**描画まで見る手段が無かった**のが根本の穴。
 *
 * ここは DB を必要としない。API はすべて差し替え、外部（地図タイル・
 * 広告）も差し替える。見るのは 2 つだけ。
 *
 *   1. ページの本文が空でないこと（真っ白＝React が落ちた印）
 *   2. ページエラー（未捕捉の例外）が出ていないこと
 *
 * 使い方:
 *   npm run dev            # 別の端末で。.env.local が要る
 *   node scripts/smoke_pages.mjs
 *
 * 環境変数
 *   SMOKE_BASE_URL      既定 http://localhost:3000
 *   SMOKE_CHROMIUM      Chromium の実行ファイル。playwright の同梱版と
 *                       ずれる環境（Claude Code のサンドボックス等）で使う
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";

/** 開いて確かめるページ。判定の入口になるものを優先して並べる。 */
const PAGES = [
  { path: "/", name: "ホーム" },
  { path: "/relocation/arbitrage", name: "物件を方位で探す" },
  { path: "/relocation/timing", name: "引越しの時期" },
  { path: "/relocation/simulator", name: "移転シミュレータ" },
  { path: "/relocation/market", name: "市場分析" },
  { path: "/relocation/wealth", name: "資産マップ" },
  { path: "/houi", name: "方位の記事" },
  { path: "/calendar", name: "カレンダー" },
  { path: "/blog", name: "ブログ一覧" },
  { path: "/about", name: "このサイトについて" },
];

/** 走査 API の応答。**今 API が実際に返す形**に合わせる。 */
const property = (id, lat, lon, name, rent) => ({
  id,
  property_name: name,
  address: "兵庫県神戸市中央区1-1",
  lat,
  lon,
  rent,
  management_fee: 3000,
  size_sqm: 45,
  building_age: 8,
  minutes_to_station: 6,
  floor: "3階",
  layout: "2LDK",
  url: "https://example.com/a",
  totalRent: rent + 3000,
  propSqmRent: (rent + 3000) / 45,
  distanceKm: 4.2,
  direction: "南東",
  magneticDirection: "南東",
  astrologyStatus: "OPTIMAL",
  astrologyScore: 82,
  astroFlags: [],
  isTendo: false,
  maxAstroFactor: "大吉方位",
  dateScores: [],
  party: null,
  timing: null,
  axisInputs: { listingCount: 2, listedDays: 12 },
  first_seen_at: "2026-08-01T00:00:00.000Z",
  last_seen_at: "2026-08-14T00:00:00.000Z",
  is_new_build: false,
});

const arbitrageBody = {
  properties: [
    property("p1", 34.69, 135.19, "煙試験レジデンス A", 78000),
    property("p2", 34.7, 135.2, "煙試験レジデンス B", 92000),
  ],
  stats: {},
  metadata: {
    baseLat: 34.6913,
    baseLon: 135.183,
    radiusKm: "30",
    prefecture: "all",
    layerMode: "year",
    useClassical: true,
    useTrueNorth: true,
    targetDate: "2026-08-14",
    candidateStrategy: "value",
    tenchusatsuMode: "strict",
    involuntaryMove: false,
    party: { policy: "all", horizonDays: 0, members: [] },
    totalAnalyzed: 2,
    totalCount: 2,
    uniqueCount: 2,
    limit: 500,
    dataUpdatedAt: "2026-08-14T10:27:00.291Z",
    staleHidden: 0,
    maxSeenDays: 30,
    timing: { dbMs: 820, computeMs: 140 },
    duplicatesHidden: 0,
    dedupe: true,
    upcomingDoyou: null,
    lunarPhase: {
      label: "上弦",
      scoreModifier: 0,
      adviceText: "",
      lunarPhaseModifier: 1,
    },
  },
};

/** API の差し替え。知らない口は空の成功で返す。 */
function apiStub(url) {
  if (url.includes("/api/rentals/arbitrage/prefecture-counts")) {
    return {
      success: true,
      data: { counts: {}, appliedFilters: [], unsupportedFilters: [] },
    };
  }
  if (url.includes("/api/rentals/arbitrage/viewport-count")) {
    return {
      success: true,
      data: { count: 1234, appliedFilters: [], unsupportedFilters: [] },
    };
  }
  if (url.includes("/api/rentals/arbitrage")) return arbitrageBody;
  if (url.includes("/api/rentals/map")) return [];
  // 一覧を返す口は data が配列。既定を {} にすると画面側の
  // data.filter / forEach が落ち、煙試験が誤検知する。
  return { success: true, count: 0, data: [] };
}

/** 外部の通信。サンドボックスでは繋がらないので空で返す。 */
const EXTERNAL =
  /basemaps\.cartocdn\.com|tile\.openstreetmap|googletagmanager|googlesyndication|doubleclick|google-analytics/;

const browser = await chromium.launch(
  process.env.SMOKE_CHROMIUM
    ? { executablePath: process.env.SMOKE_CHROMIUM }
    : {},
);

const results = [];

for (const target of PAGES) {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // 外部が落ちたぶんは対象外。見たいのは画面側の例外。
    if (text.includes("ERR_TUNNEL") || text.includes("Failed to load resource"))
      return;
    if (text.includes("active agent theme")) return;
    errors.push("console: " + text.slice(0, 160));
  });

  await page.route(EXTERNAL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(""),
    }),
  );
  await page.route("**/api/**", (route) =>
    route.fulfill({ json: apiStub(route.request().url()) }),
  );

  // 出発地と生年月日を入れた状態で開く。未設定だと判定を止める画面がある。
  await page.addInitScript(() => {
    localStorage.setItem("arb_baseLat", "34.6913");
    localStorage.setItem("arb_baseLon", "135.183");
    localStorage.setItem("arb_birthDate", "1957-09-22");
    localStorage.setItem(
      "tactical_config_v1",
      JSON.stringify({
        base_lat: 34.6913,
        base_lon: 135.183,
        birth_date: "1957-09-22",
      }),
    );
  });

  let text = "";
  let failure = null;
  try {
    await page.goto(BASE + target.path, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // 描画が落ち着くまで少し待つ。走査結果の差し込みを拾いたい。
    await page.waitForTimeout(4000);
    text = (await page.locator("body").innerText()).trim();
  } catch (e) {
    failure = String(e).slice(0, 200);
  }

  results.push({
    ...target,
    chars: text.length,
    blank: text.length < 40,
    errors,
    failure,
  });
  await page.close();
}

await browser.close();

let bad = 0;
console.log("ページ                     本文  例外  判定");
console.log("------------------------------------------------");
for (const r of results) {
  const ng = r.blank || r.errors.length > 0 || r.failure;
  if (ng) bad++;
  console.log(
    `${r.name.padEnd(24)} ${String(r.chars).padStart(5)}  ${String(
      r.errors.length,
    ).padStart(4)}  ${ng ? "NG" : "OK"}`,
  );
  if (r.failure) console.log(`    読み込み失敗: ${r.failure}`);
  for (const e of r.errors.slice(0, 3)) console.log(`    ${e}`);
}
console.log("------------------------------------------------");
console.log(bad === 0 ? "すべて描画できた" : `${bad} ページに問題`);
process.exit(bad === 0 ? 0 : 1);
