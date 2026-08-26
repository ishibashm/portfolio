/**
 * いい部屋ネット（大東建託）から賃貸物件を取り込む。
 *
 * Nifty 経由でも いい部屋ネット の物件は入ってくるが、実測では
 * 愛知県だけで本家 34,009 件に対して Nifty 経由は全県合計で 11,350 件しかなかった。
 * DK SELECT・シャーメゾンのような管理会社ブランドを厚く拾うには直接見に行く必要がある。
 *
 * 一覧は Next.js なので __NEXT_DATA__ に構造化データがそのまま載っている。
 * HTML の見た目に依存しないぶん、Nifty のスクレイパーと同じく壊れにくい。
 *
 * robots.txt で禁止されているのは /mypage/ /detail/*\/env/ /detail/form/ /map/ /ssgtm/ で、
 * ここで見る /{県}/area/{市区町村コード}/search/ は対象外。
 */
import { Browser, chromium, Page } from "playwright";
import { toLogMessage } from "../src/lib/errorMessage";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
};

const DEFAULT_PREFECTURES = [
  "aichi",
  "shizuoka",
  "mie",
  "fukui",
  "shiga",
  "kyoto",
  "osaka",
  "nara",
  "hyogo",
  "tottori",
  "shimane",
  "hiroshima",
];

const TIME_BUDGET_MS =
  (parseInt(process.env.EHEYA_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();
let budgetExhausted = false;

const STATE_FILE =
  process.env.EHEYA_STATE_FILE ||
  path.join(process.cwd(), "scripts", "eheya_state.json");

// 1 市区町村あたりの上限。1 ページ 20 棟なので、既定は十分大きく取る。
const MAX_PAGES = parseInt(process.env.EHEYA_MAX_PAGES || "200", 10);

function checkTimeBudget(): boolean {
  if (TIME_BUDGET_MS <= 0) return false;
  if (Date.now() - STARTED_AT >= TIME_BUDGET_MS) {
    budgetExhausted = true;
    return true;
  }
  return false;
}

/**
 * "築17年" / "新築" / "築1年" → 年数。判別できなければ null（新築の 0 と混同しない）
 *
 * 引数が undefined になり得るのは、元データに築年の欄が無い建物があるため。
 * 先頭の `if (!ageStr)` が元からその場合を返しており、`string` を名乗って
 * いたのが型の嘘だった（呼び出し側が any だったので通っていた）。
 */
function parseAge(ageStr: string | undefined): number | null {
  if (!ageStr) return null;
  if (ageStr.includes("新築")) return 0;
  const m = ageStr.match(/(\d+)\s*年/);
  return m ? parseInt(m[1], 10) : null;
}

/** "名鉄名古屋本線 富士松駅 徒歩8分" → 8。無い建物があるので undefined も取る */
function parseWalkMinutes(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/徒歩\s*(\d+)\s*分/);
  return m ? parseInt(m[1], 10) : null;
}

interface StateShape {
  pref: string | null;
  cityIndex: number;
  page: number;
}

function loadState(): StateShape {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      console.log(`Loaded state: ${JSON.stringify(parsed)}`);
      return {
        pref: parsed.pref || null,
        cityIndex: parsed.cityIndex || 0,
        page: parsed.page || 1,
      };
    }
  } catch {
    console.warn("Failed to load state, starting from the beginning.");
  }
  return { pref: null, cityIndex: 0, page: 1 };
}

function saveState(pref: string, cityIndex: number, page: number) {
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ pref, cityIndex, page }, null, 2),
    );
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

type City = { code: string; name: string; count: number };

/** 素の JSON。__NEXT_DATA__ を辿る途中の節点。 */
type JsonObject = { [key: string]: unknown };

interface CityEntry {
  code: string | number;
  name: string;
  propertyCount?: { count?: number } | null;
}

interface CityGroup {
  cities?: CityEntry[];
}

/**
 * 市区町村一覧ページの `__NEXT_DATA__` のうち、ここで読む枝だけ。
 * ページ全体を型にする意味はない。この形が変わったら取り込みが壊れる、
 * という一覧を兼ねている。
 */
type CityListWindow = Window & {
  __NEXT_DATA__?: {
    props?: { pageProps?: { prefecture?: { cityGroups?: CityGroup[] } } };
  };
};

/**
 * 検索結果ページの `__NEXT_DATA__`。`buildings` がどの深さに入るかは
 * ページによって違うので、`pageProps` は素の JSON のまま幅優先で辿る。
 */
type SearchWindow = Window & {
  __NEXT_DATA__?: { props?: { pageProps?: JsonObject } };
};

/** 建物 1 棟。`__NEXT_DATA__` から読む枝だけ。 */
interface Building {
  name?: string;
  address?: string;
  age?: string;
  mainTransportationText?: string;
  isDKSelect?: boolean;
  properties?: RoomEntry[];
}

/** 建物に属する部屋 1 室。同上。 */
interface RoomEntry {
  propertyFullId?: string;
  price?: { number?: number | null } | null;
  manageCost?: { number?: number | null } | null;
  housePlan?: string;
  floor?: string;
  roomArea?: number | null;
}

/** 保存する 1 部屋ぶん。建物の情報を部屋へ写してフラットにしたもの。 */
interface ExtractedRoom {
  id: string;
  name?: string;
  address?: string;
  age?: string;
  transport?: string;
  isDKSelect: boolean;
  rent: number | null;
  manageCost: number;
  layout?: string;
  floor?: string;
  area: number | null;
}

async function fetchCities(page: Page, pref: string): Promise<City[]> {
  await page.goto(`https://www.eheya.net/${pref}/area/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const groups =
      (window as CityListWindow).__NEXT_DATA__?.props?.pageProps?.prefecture
        ?.cityGroups || [];
    return groups
      .flatMap((g) => g.cities || [])
      .map((c) => ({
        code: String(c.code),
        name: c.name,
        count: c.propertyCount?.count ?? 0,
      }))
      // 政令市の親エントリは件数 0 で、区が別に並ぶので取り込まない
      .filter((c) => c.count > 0);
  });
}

/** 検索結果 1 ページぶんの建物→部屋をフラットにして返す */
async function extractPage(page: Page): Promise<ExtractedRoom[]> {
  return page.evaluate(() => {
    const pp = (window as SearchWindow).__NEXT_DATA__?.props?.pageProps || {};
    // 名前付き関数を evaluate に持ち込むと、tsx(esbuild) が付ける __name ヘルパーが
    // ブラウザ側に存在せず ReferenceError になる。再帰は使わず幅優先で辿る。
    // 型ガードを const の関数にするのも同じ理由で避け、その場で書いている。
    let buildings: Building[] = [];
    const queue: Array<{ node: JsonObject; depth: number }> = [
      { node: pp, depth: 0 },
    ];
    while (queue.length) {
      const { node, depth } = queue.shift()!;
      if (!node || typeof node !== "object" || depth > 5) continue;
      for (const [k, v] of Object.entries(node)) {
        if (k === "buildings" && Array.isArray(v) && v.length) {
          // 素の JSON を型として読むのはここ 1 か所だけ。以降は Building。
          buildings = v as Building[];
          queue.length = 0;
          break;
        }
        if (v && typeof v === "object")
          queue.push({ node: v as JsonObject, depth: depth + 1 });
      }
    }
    const rows: ExtractedRoom[] = [];
    for (const b of buildings) {
      for (const p of b.properties || []) {
        if (!p.propertyFullId) continue;
        rows.push({
          id: p.propertyFullId,
          name: b.name,
          address: b.address,
          age: b.age,
          transport: b.mainTransportationText,
          isDKSelect: !!b.isDKSelect,
          rent: p.price?.number ?? null,
          manageCost: p.manageCost?.number ?? 0,
          layout: p.housePlan,
          floor: p.floor,
          area: p.roomArea ?? null,
        });
      }
    }
    return rows;
  });
}

async function saveToDatabase(prisma: PrismaClient, rows: ExtractedRoom[]) {
  let saved = 0;
  for (const r of rows) {
    if (!r.id || !r.address || r.rent == null || r.area == null) continue;
    const url = `https://www.eheya.net/detail/${r.id}/`;
    const attributes = {
      property_name: r.name || "Unknown",
      address: r.address,
      rent: Math.round(r.rent),
      management_fee: Math.round(r.manageCost || 0),
      layout: r.layout || "",
      size_sqm: r.area,
      building_age: parseAge(r.age),
      minutes_to_station: parseWalkMinutes(r.transport),
      floor: r.floor || "",
      is_new_build: (r.age || "").includes("新築"),
    };
    try {
      await prisma.rental_properties.upsert({
        where: { url },
        update: { ...attributes, last_seen_at: new Date() },
        create: {
          ...attributes,
          url,
          source_scraper: "eheya_playwright",
          first_seen_at: new Date(),
          last_seen_at: new Date(),
        },
      });
      saved++;
    } catch (e) {
      console.error(`Failed to save ${url}:`, toLogMessage(e));
    }
    await new Promise((res) => setTimeout(res, 40));
  }
  console.log(`Upserted ${saved} records.`);
}

async function scrapeCity(
  browser: Browser,
  prisma: PrismaClient,
  pref: string,
  city: City,
  cityIndex: number,
  startPage: number,
) {
  let context = await browser.newContext(CONTEXT_OPTIONS);
  let page = await context.newPage();

  try {
    let current = startPage;
    while (current <= MAX_PAGES) {
      if (checkTimeBudget()) {
        console.log(
          `⏱️ Time budget reached at ${pref}/${city.name} page ${current}.`,
        );
        saveState(pref, cityIndex, current);
        break;
      }

      // メモリ対策: Nifty 版と同じく一定ページごとにタブを作り直す
      if (current > startPage && (current - startPage) % 10 === 0) {
        await page.close();
        await context.close();
        context = await browser.newContext(CONTEXT_OPTIONS);
        page = await context.newPage();
      }

      const url = `https://www.eheya.net/${pref}/area/${city.code}/search/${current > 1 ? `?page=${current}` : ""}`;
      console.log(`Navigating to ${url}`);
      saveState(pref, cityIndex, current);

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);

      const rows = await extractPage(page);
      console.log(`Found ${rows.length} rooms on page ${current}.`);
      if (rows.length === 0) {
        console.log("No more rooms. Pagination complete.");
        break;
      }

      await saveToDatabase(prisma, rows);

      const delayMs = 2000 + Math.floor(Math.random() * 2000);
      console.log(`Polite delay: ${Math.round(delayMs / 1000)}s`);
      await new Promise((res) => setTimeout(res, delayMs));
      current++;
    }
  } finally {
    try {
      await page.close();
      await context.close();
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString, max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const browser = await chromium.launch({ headless: true });

  try {
    const prefectures = (process.env.EHEYA_PREFECTURES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (prefectures.length === 0) prefectures.push(...DEFAULT_PREFECTURES);
    console.log(`Target prefectures: ${prefectures.join(", ")}`);

    const state = loadState();
    let skipPref = !!state.pref;

    for (const pref of prefectures) {
      if (budgetExhausted) break;
      if (skipPref && pref !== state.pref) {
        console.log(`Skipping prefecture: ${pref}`);
        continue;
      }
      const resuming = skipPref;
      skipPref = false;

      const listCtx = await browser.newContext(CONTEXT_OPTIONS);
      const listPage = await listCtx.newPage();
      const cities = await fetchCities(listPage, pref);
      await listPage.close();
      await listCtx.close();
      console.log(`${pref}: ${cities.length} cities`);

      const startCity = resuming ? state.cityIndex : 0;
      for (let i = startCity; i < cities.length; i++) {
        if (budgetExhausted) break;
        const city = cities[i];
        console.log(
          `\n=== ${pref} / ${city.name} (${city.count} rooms) [${i + 1}/${cities.length}] ===`,
        );
        const startPage = resuming && i === state.cityIndex ? state.page : 1;
        try {
          await scrapeCity(browser, prisma, pref, city, i, startPage);
        } catch (e) {
          console.error(`Error on ${city.name}:`, toLogMessage(e));
          await new Promise((res) => setTimeout(res, 8000));
        }
      }
    }

    if (budgetExhausted) {
      console.log("⏸️ Stopped on the time budget; the next run resumes here.");
    } else {
      console.log("✅ Completed. Clearing resume state.");
      if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
