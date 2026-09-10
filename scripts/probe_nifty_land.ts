import { chromium, type Page } from "playwright";

/**
 * nifty の**売地**一覧（`/tochi/`）が、賃貸（`/rent/`）と同じ形で
 * `window.Nifty.Data.Bukken` を埋め込んでいるかを**実物で確かめるだけ**。
 *
 * ## なぜ要るか（2026-09-10）
 *
 * 利用者の要望「土地の売り出しデータの取得表示もしたい」に対して、
 * 出どころの候補を調べた結果、**既存の賃貸巡回と同じホスト・同じ URL の
 * 形**で売地の一覧があることが分かった。
 *
 *     賃貸  https://myhome.nifty.com/rent/{pref}/{city}_ct/{page}/
 *     売地  https://myhome.nifty.com/tochi/{pref}/{city}_ct/{page}/
 *
 * 新しいホストに要求を出さずに済むなら、相手への負荷も規約の確認も
 * 1 か所で済む（`docs/improvement-backlog.md` 25 節）。ただし**一覧の
 * 埋め込みデータが同じ形かどうかは読んでみないと分からない。**賃貸は
 * `rent` / `manageCost` / `floorArea` を持つが、売地なら `price` /
 * `landArea` のような別の欄になっているはず。取り込みを書く前に、
 * **本当の欄の名前と値の例**を見る。
 *
 * ## 何をするか
 *
 * 1. `/tochi/{pref}/` を開いて、`_ct/` で終わるリンク（市区町村の一覧）を
 *    数える。賃貸の `fetchCityList` と同じ引き方
 * 2. **20 秒待ってから**先頭の 1 市区町村の一覧を 1 頁だけ開き、
 *    `Nifty.Data.Bukken` の欄の名前・出現数・値の例を出す
 *
 * 要求は合計 2 回。間隔は賃貸の `MIN_PAGE_INTERVAL_MS`（20 秒）と同じ。
 * **DB には一切書かない。**`.env` も要らない。
 *
 *   LAND_PROBE_PREF=tokyo npx tsx scripts/probe_nifty_land.ts
 *
 * ここでの「20 秒」は nifty_extractor.ts の値を写したもの。巡回本体の
 * 数字を変えるときはあちらが正で、ここは追随するだけ。
 */

const PREF = process.env.LAND_PROBE_PREF || "tokyo";
const CITY = process.env.LAND_PROBE_CITY || "";

/** 賃貸の巡回と同じ間隔。**短くしないこと**（CLAUDE.md 3 節）。 */
const MIN_PAGE_INTERVAL_MS = 20000;

const CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
};

/**
 * 一覧ページが window に置く物件データ。売地の欄は**まだ知らない**ので、
 * ここでは id をキーにした連想配列としか言わない。欄の名前を知るのが
 * この道具の目的で、取り込みを書くときに初めて枝を型にする（#149）。
 */
type NiftyWindow = Window & {
  Nifty?: { Data?: { Bukken?: Record<string, Record<string, unknown>> } };
};

async function waitForMinimumPageInterval(startedAt: number): Promise<void> {
  const waitMs = MIN_PAGE_INTERVAL_MS - (Date.now() - startedAt);
  if (waitMs <= 0) return;
  console.log(`次の要求まで ${Math.round(waitMs / 1000)} 秒待つ`);
  await new Promise((res) => setTimeout(res, waitMs));
}

async function cityListFromIndex(page: Page): Promise<string[]> {
  const url = `https://myhome.nifty.com/tochi/${PREF}/`;
  const startedAt = Date.now();
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log(`索引 ${url} → HTTP ${res?.status() ?? "?"}`);
  await page.waitForTimeout(2000);

  const links = await page.$$eval("a", (anchors) =>
    anchors
      .map((a) => a.href)
      .filter((h) => h.includes("_ct/") && !h.includes("detail_")),
  );
  const cities = Array.from(
    new Set(
      links
        .map((u) => u.match(/\/tochi\/[^/]+\/([a-z0-9]+)_ct\//))
        .flatMap((m) => (m ? [m[1]] : [])),
    ),
  );
  console.log(
    `市区町村のリンク ${cities.length} 件（先頭 10: ${cities.slice(0, 10).join(", ")}）`,
  );
  await waitForMinimumPageInterval(startedAt);
  return cities;
}

async function main() {
  console.log(`対象: /tochi/${PREF}/${CITY ? ` ${CITY}_ct/` : ""}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(CONTEXT_OPTIONS);
    const page = await context.newPage();

    const cities = await cityListFromIndex(page);
    const city = CITY || cities[0];
    if (!city) {
      console.log(
        "::warning::市区町村のリンクが 1 件も無い。URL の形が賃貸と違う可能性がある。",
      );
      return;
    }

    const url = `https://myhome.nifty.com/tochi/${PREF}/${city}_ct/`;
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log(`一覧 ${url} → HTTP ${res?.status() ?? "?"}`);

    /* 賃貸と同じ。条件ページに飛ばされたら検索ボタンを押す */
    const isConditionPage = await page.$(".btn-search-submit");
    if (isConditionPage) {
      console.log("条件ページに出た。検索ボタンを押す。");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.click(".btn-search-submit"),
      ]);
    }
    await page.waitForTimeout(1000);

    const data = await page.evaluate(
      () => (window as NiftyWindow).Nifty?.Data?.Bukken || {},
    );
    const rows = Object.values(data);
    console.log(`Nifty.Data.Bukken: ${rows.length} 件\n`);

    if (rows.length === 0) {
      /* 埋め込みが無いときは、頁の見出しと物件らしい要素の数だけ出す。
         次にどこを読めばよいかの手掛かりになる */
      const title = await page.title();
      const hasNifty = await page.evaluate(
        () => typeof (window as NiftyWindow).Nifty,
      );
      console.log(
        `::warning::埋め込みが空。title=${title} window.Nifty=${hasNifty}`,
      );
      const keys = await page.evaluate(() => {
        const n = (window as NiftyWindow).Nifty as
          | Record<string, unknown>
          | undefined;
        return n ? Object.keys(n) : [];
      });
      console.log(`window.Nifty の鍵: ${keys.join(", ")}`);
      return;
    }

    /** 欄の名前 → 出現数 / 値の例（先頭 3 つ）。 */
    const keyCount = new Map<string, number>();
    const keySamples = new Map<string, unknown[]>();
    for (const row of rows) {
      for (const [k, v] of Object.entries(row)) {
        keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
        const s = keySamples.get(k) ?? [];
        if (s.length < 3) {
          s.push(v);
          keySamples.set(k, s);
        }
      }
    }

    console.log("欄 / 出現数 / 値の例");
    for (const [k, n] of [...keyCount.entries()].sort((a, b) => b[1] - a[1])) {
      const samples = (keySamples.get(k) ?? [])
        .map((v) => JSON.stringify(v))
        .join(" , ");
      console.log(`  ${k}  (${n})  ${samples}`);
    }

    /* 賃貸の取り込みが読む欄が、売地にもあるか。無い欄が取り込みの
       書き換え対象 */
    console.log("\n※ 賃貸の取り込み（NiftyBukken）が読む欄:");
    for (const k of [
      "id",
      "url",
      "title",
      "address",
      "rent",
      "manageCost",
      "layout",
      "floorArea",
      "buildAge",
      "access",
      "floor",
      "expireDate",
    ]) {
      console.log(`  ${k}: ${keyCount.has(k) ? "ある" : "**無い**"}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("落ちた:", e);
  process.exit(1);
});
