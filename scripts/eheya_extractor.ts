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
import { chromium, Page } from "playwright";
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

/** "築17年" / "新築" / "築1年" → 年数。判別できなければ null（新築の 0 と混同しない） */
function parseAge(ageStr: string): number | null {
  if (!ageStr) return null;
  if (ageStr.includes("新築")) return 0;
  const m = ageStr.match(/(\d+)\s*年/);
  return m ? parseInt(m[1], 10) : null;
}

/** "名鉄名古屋本線 富士松駅 徒歩8分" → 8 */
function parseWalkMinutes(text: string): number | null {
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

async function fetchCities(page: Page, pref: string): Promise<City[]> {
  await page.goto(`https://www.eheya.net/${pref}/area/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const groups =
      (window as any).__NEXT_DATA__?.props?.pageProps?.prefecture
        ?.cityGroups || [];
    return groups
      .flatMap((g: any) => g.cities || [])
      .map((c: any) => ({
        code: String(c.code),
        name: c.name,
        count: c.propertyCount?.count ?? 0,
      }))
      // 政令市の親エントリは件数 0 で、区が別に並ぶので取り込まない
      .filter((c: any) => c.count > 0);
  });
}

/** 検索結果 1 ページぶんの建物→部屋をフラットにして返す */
async function extractPage(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const pp = (window as any).__NEXT_DATA__?.props?.pageProps || {};
    // 名前付き関数を evaluate に持ち込むと、tsx(esbuild) が付ける __name ヘルパーが
    // ブラウザ側に存在せず ReferenceError になる。再帰は使わず幅優先で辿る。
    let buildings: any[] = [];
    const queue: Array<{ node: any; depth: number }> = [{ node: pp, depth: 0 }];
    while (queue.length) {
      const { node, depth } = queue.shift()!;
      if (!node || typeof node !== "object" || depth > 5) continue;
      for (const [k, v] of Object.entries(node)) {
        if (k === "buildings" && Array.isArray(v) && v.length) {
          buildings = v as any[];
          queue.length = 0;
          break;
        }
        if (v && typeof v === "object") queue.push({ node: v, depth: depth + 1 });
      }
    }
    const rows: any[] = [];
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

async function saveToDatabase(prisma: PrismaClient, rows: any[]) {
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
    } catch (e: any) {
      console.error(`Failed to save ${url}:`, e.message || e);
    }
    await new Promise((res) => setTimeout(res, 40));
  }
  console.log(`Upserted ${saved} records.`);
}

async function scrapeCity(
  browser: any,
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
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
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
        } catch (e: any) {
          console.error(`Error on ${city.name}:`, e.message);
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
