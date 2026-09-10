import { chromium, type Browser, type Page } from "playwright";
import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { toLogMessage } from "../src/lib/errorMessage";
import {
  absoluteNiftyUrl,
  buildLandUpsert,
  municipalityKeyFromAddress,
  parseLandArea,
  parseLandPrice,
  pricePerSqm,
  type LandUpsertRow,
} from "../src/lib/landUpsert";
import {
  hydrateStateFromDb,
  persistStateToDb,
  resumeCityMissing,
  resumeStateKey,
  writeSweptState,
} from "./scraperResume";
import {
  cityAliasesFromHrefs,
  NIFTY_CONTEXT_OPTIONS,
  parseExpireDate,
  waitForMinimumPageInterval,
} from "./niftyPolite";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

/**
 * nifty の**売地**一覧（/tochi/{pref}/{city}_ct/{page}/）を巡回して
 * land_listings に積む。
 *
 * 賃貸の抽出器（nifty_extractor.ts）と同じホストを読むので、相手に対する
 * 振る舞い（1 ページ 20 秒・名乗り・索引の読み方）は niftyPolite.ts の
 * 同じものを使う。**この取り込みだけ速くしない。**
 *
 * 賃貸との違いは 3 つだけ。
 *
 *   - URL が /rent/ でなく /tochi/
 *   - 埋め込みの欄が rent / floorArea でなく price / landArea / groupId
 *     （2026-09-10 の下見。docs/improvement-backlog.md 25 節）
 *   - 保存先が land_listings（rentalUpsert でなく landUpsert）
 *
 * 環境変数（賃貸の SCRAPER_* と名前を分けてある。同じ名前だと同じ
 * ワークフローに同居させたとき互いの再開位置を壊す）:
 *
 *   LAND_PREFECTURES      "tokyo,kanagawa"。空なら何もしない（全国を
 *                         既定にしない。系統が増えるぶん相手への総量が
 *                         増えるので、範囲は必ず指示で決める）
 *   LAND_TIME_BUDGET_MIN  分。超えたらページ境界で止めて再開位置を残す
 *   LAND_STATE_FILE       再開位置のファイル
 *   LAND_MAX_PAGES        1 市区町村あたりの上限ページ。0 で無制限
 */

const PREFECTURES = (process.env.LAND_PREFECTURES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const TIME_BUDGET_MS =
  (parseInt(process.env.LAND_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();
let budgetExhausted = false;

const MAX_PAGES = parseInt(process.env.LAND_MAX_PAGES || "", 10) || 0;

const STATE_FILE =
  process.env.LAND_STATE_FILE ||
  path.join(process.cwd(), "scripts", "land_scraper_state.json");
const RESUME_KEY = resumeStateKey("nifty_land", STATE_FILE);

const SOURCE = "nifty_land";
const UPSERT_CHUNK = 25;
const CITY_LIST_ATTEMPTS = 3;

/**
 * 一覧ページの `window.Nifty.Data.Bukken` のうち、ここで読む枝だけ。
 * 全部文字列で来る。欄ごと無い物件があるので id 以外は任意。
 */
interface NiftyLandBukken {
  id: string;
  url?: string;
  groupId?: string;
  title?: string;
  address?: string;
  price?: string;
  landArea?: string;
  plotRatio?: string;
  access?: string;
  expireDate?: string;
  typeName?: string;
}

type NiftyWindow = Window & {
  Nifty?: { Data?: { Bukken?: Record<string, NiftyLandBukken> } };
};

function checkTimeBudget(): boolean {
  if (TIME_BUDGET_MS <= 0) return false;
  if (Date.now() - STARTED_AT >= TIME_BUDGET_MS) {
    budgetExhausted = true;
    return true;
  }
  return false;
}

function loadState(): {
  pref: string | null;
  city: string | null;
  page: number;
} {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return {
        pref: parsed.pref || null,
        city: parsed.city || null,
        page: parsed.page || 1,
      };
    }
  } catch {
    console.warn("再開位置が読めなかった。先頭から回す。");
  }
  return { pref: null, city: null, page: 1 };
}

function saveState(pref: string, city: string, page = 1) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pref, city, page }, null, 2));
  } catch (e) {
    console.error("再開位置を書けなかった:", toLogMessage(e));
  }
}

function toRow(prop: NiftyLandBukken): LandUpsertRow | null {
  if (!prop.url) return null;
  /* 売地以外（建物付きなど）が混ざったら弾く。欄が無ければ通す */
  if (prop.typeName && !prop.typeName.includes("土地")) return null;
  const price = parseLandPrice(prop.price);
  const area = parseLandArea(prop.landArea);
  const address = prop.address || prop.title || null;
  return {
    url: absoluteNiftyUrl(prop.url),
    group_id: prop.groupId || null,
    address,
    price,
    land_area_sqm: area,
    price_per_sqm: pricePerSqm(price, area),
    plot_ratio_text:
      prop.plotRatio && prop.plotRatio !== "-" ? prop.plotRatio : null,
    access: prop.access && prop.access !== "-" ? prop.access : null,
    municipality_key: municipalityKeyFromAddress(address),
    source_scraper: SOURCE,
    expire_date: parseExpireDate(prop.expireDate),
  };
}

async function saveToDatabase(pool: Pool, props: NiftyLandBukken[]) {
  const rows = props.map(toRow).filter((r): r is LandUpsertRow => r !== null);
  let saved = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const st = buildLandUpsert(chunk, new Date());
    if (!st) continue;
    try {
      await pool.query(st.sql, st.params);
      saved += chunk.length;
    } catch (e) {
      console.error(`❌ ${chunk.length} 行の保存に失敗: ${toLogMessage(e)}`);
    }
  }
  console.log(`Upserted ${saved} land listings.`);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext(NIFTY_CONTEXT_OPTIONS);
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return { context, page };
}

async function fetchCities(page: Page, pref: string): Promise<string[]> {
  const url = `https://myhome.nifty.com/tochi/${pref}/`;
  for (let attempt = 1; attempt <= CITY_LIST_ATTEMPTS; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const hrefs = await page.$$eval("a", (as) => as.map((a) => a.href));
      const cities = cityAliasesFromHrefs(hrefs, "tochi");
      if (cities.length > 0) return cities;
    } catch (e) {
      console.error(`索引の取得に失敗 (${pref}): ${toLogMessage(e)}`);
    }
    if (attempt < CITY_LIST_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  /* 0 件を「その県に売地が無い」と読まない。取り込み 0 件を正常終了に
     しないため、ここで失敗させる（賃貸と同じ理由） */
  throw new Error(
    `${pref} の市区町村一覧が ${CITY_LIST_ATTEMPTS} 回とも 0 件だった（${url}）。`,
  );
}

/** 1 市区町村を回す。取れた件数を返す。 */
async function scrapeArea(
  browser: Browser,
  pool: Pool,
  pref: string,
  city: string,
  startPage: number,
): Promise<number> {
  let currentPage = startPage;
  const seen = new Set<string>();
  let total = 0;
  let { context, page } = await newPage(browser);

  try {
    while (true) {
      if (checkTimeBudget()) {
        console.log(
          `⏱️ 予算に達した。${pref}/${city} の ${currentPage} 頁で止める。`,
        );
        saveState(pref, city, currentPage);
        break;
      }
      if (currentPage > startPage && currentPage % 10 === 0) {
        await page.close();
        await context.close();
        ({ context, page } = await newPage(browser));
      }
      if (MAX_PAGES > 0 && currentPage > MAX_PAGES) break;

      const url =
        currentPage === 1
          ? `https://myhome.nifty.com/tochi/${pref}/${city}_ct/`
          : `https://myhome.nifty.com/tochi/${pref}/${city}_ct/${currentPage}/`;
      console.log(`Fetching ${url}`);
      saveState(pref, city, currentPage);

      const pageStartedAt = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const conditionPage = await page.$(".btn-search-submit");
      if (conditionPage) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          page.click(".btn-search-submit"),
        ]);
      }
      await new Promise((r) => setTimeout(r, 1000));

      let props: NiftyLandBukken[] = [];
      try {
        const data = await page.evaluate(
          () => (window as NiftyWindow).Nifty?.Data?.Bukken || {},
        );
        props = Object.values(data);
      } catch {
        props = [];
      }
      console.log(`Found ${props.length} listings on page ${currentPage}.`);

      const fresh = props.filter((p) => !seen.has(p.id));
      for (const p of fresh) seen.add(p.id);

      /* 0 件でも、同じ頁の繰り返しでも、**待ってから抜ける**。空振りこそ
         次の市へすぐ移るので、ここが最も速く連打される経路になる
         （CLAUDE.md 3 節） */
      if (props.length === 0 || fresh.length === 0) {
        await waitForMinimumPageInterval(pageStartedAt);
        break;
      }

      await saveToDatabase(pool, fresh);
      total += fresh.length;
      await waitForMinimumPageInterval(pageStartedAt);
      currentPage++;
    }
  } finally {
    try {
      await page.close();
      await context.close();
    } catch {}
  }
  return total;
}

async function main() {
  if (PREFECTURES.length === 0) {
    console.log("LAND_PREFECTURES が空。何もしない。");
    return;
  }
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL が無い。");
  const pool = new Pool({ connectionString, max: 1 });
  const db = {
    $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]) =>
      (await pool.query(sql, params)).rows as T,
    $executeRawUnsafe: async (sql: string, ...params: unknown[]) =>
      (await pool.query(sql, params)).rowCount ?? 0,
  };

  const browser = await chromium.launch({ headless: true });
  let areasCrawled = 0;
  let emptyAreas = 0;
  try {
    await hydrateStateFromDb(db, RESUME_KEY, STATE_FILE);
    const state = loadState();
    let skipPref = !!state.pref;
    let skipCity = !!state.city;
    if (state.pref) {
      console.log(
        `🔄 再開: ${state.pref} - ${state.city} (page ${state.page})`,
      );
    }

    for (const pref of PREFECTURES) {
      if (budgetExhausted) break;
      if (skipPref && pref !== state.pref) continue;
      skipPref = false;

      const { context, page } = await newPage(browser);
      const cities = await fetchCities(page, pref);
      await page.close();
      await context.close();
      console.log(`${pref}: ${cities.length} 市区町村`);
      if (skipCity && resumeCityMissing(state.city, cities)) {
        console.warn(
          `⚠️ 再開位置の ${state.city} が一覧に無い。先頭から回す。`,
        );
        skipCity = false;
      }
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));

      for (const city of cities) {
        if (budgetExhausted) break;
        if (skipCity && city !== state.city) continue;
        const startPage = skipCity ? state.page : 1;
        skipCity = false;
        const n = await scrapeArea(browser, pool, pref, city, startPage);
        areasCrawled++;
        if (n === 0) emptyAreas++;
      }
    }

    if (!budgetExhausted) {
      writeSweptState(STATE_FILE);
      console.log("✅ 一巡した。次回は先頭から。");
    }
  } finally {
    await persistStateToDb(db, RESUME_KEY, STATE_FILE);
    await browser.close();
    await pool.end();
  }

  console.log(`areas=${areasCrawled} empty=${emptyAreas}`);
  /* 半分を超えて 0 件なら、弾かれている疑い。緑のまま通さず Summary に出す */
  if (areasCrawled > 0 && emptyAreas / areasCrawled > 0.5) {
    console.log(
      `::warning::${areasCrawled} 市区町村のうち ${emptyAreas} が 0 件。` +
        `取得間隔と、相手に弾かれていないかを疑うこと。`,
    );
  }
}

main().catch((e) => {
  console.error("落ちた:", toLogMessage(e));
  process.exit(1);
});
