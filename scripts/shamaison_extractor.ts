/**
 * シャーメゾン（積水ハウス）の公式サイトから賃貸物件を取り込む。
 *
 * 以前 /aichi/ や /search.html を見て「ナビゲーションしか返らない」と判断したが、
 * それらは入口ページで、物件一覧は /{県}/area/{JISコード}/ にサーバーレンダリングされている。
 * 検索条件は クエリ で渡す形式:
 *
 *   /{県}/area/{CTY}/?selectedPage=N&image=01&view=2&PRF={県コード}&MOV=0&childSort=0&CTY={CTY}&sort=14&AJX=0
 *
 * CTY は JIS 市区町村コードで、県トップには一部の市区町村しか出ないため
 * scripts/jis_city_codes.json に持たせてある。
 *
 * 打ち切り条件に注意: 最終ページを超えた selectedPage を渡しても 404 にならず
 * 1 ページ目の内容が返る。ページャの is-active が要求したページ番号と
 * 一致しなくなった時点で終了する。
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

/** スラッグ → JIS 都道府県コード（CTY の先頭 2 桁と一致する） */
const PREF_CODES: Record<string, string> = {
  aichi: "23",
  shizuoka: "22",
  mie: "24",
  fukui: "18",
  shiga: "25",
  kyoto: "26",
  osaka: "27",
  nara: "29",
  hyogo: "28",
  tottori: "31",
  shimane: "32",
  hiroshima: "34",
};

const DEFAULT_PREFECTURES = Object.keys(PREF_CODES);

const TIME_BUDGET_MS =
  (parseInt(process.env.SHAMAISON_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();
let budgetExhausted = false;

const STATE_FILE =
  process.env.SHAMAISON_STATE_FILE ||
  path.join(process.cwd(), "scripts", "shamaison_state.json");

const MAX_PAGES = parseInt(process.env.SHAMAISON_MAX_PAGES || "100", 10);

function checkTimeBudget(): boolean {
  if (TIME_BUDGET_MS <= 0) return false;
  if (Date.now() - STARTED_AT >= TIME_BUDGET_MS) {
    budgetExhausted = true;
    return true;
  }
  return false;
}

/** "7.9" → 79000 / "0.87" → 8700。万円表記をそのまま円に直す */
function manToYen(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 10000) : null;
}

/**
 * "2026年5月 / 4階建て" → 築年数。
 * 竣工が未来なら新築扱いの 0。判別できなければ null（0 と混同しない）。
 */
function parseBuiltAge(text: string): number | null {
  if (!text) return null;
  const m = text.match(/(\d{4})年(?:\s*(\d{1,2})月)?/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = m[2] ? parseInt(m[2], 10) : 1;
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month) age -= 1;
  return age < 0 ? 0 : age;
}

/**
 * "名古屋市営地下鉄東山線 本山駅 徒歩4分" → 4
 * "ＪＲ中央本線 春日井駅 バス9分、六軒屋口 バス停 徒歩2分" → 11（バス+徒歩）
 * 徒歩だけを見るとバス便の物件が駅近として扱われてしまう。
 */
function parseAccessMinutes(text: string): number | null {
  if (!text) return null;
  const walk = text.match(/徒歩\s*(\d+)\s*分/);
  const bus = text.match(/バス\s*(\d+)\s*分/);
  if (!walk && !bus) return null;
  return (walk ? parseInt(walk[1], 10) : 0) + (bus ? parseInt(bus[1], 10) : 0);
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

type City = { code: string; name: string };

function loadCities(pref: string): City[] {
  const file = path.join(process.cwd(), "scripts", "jis_city_codes.json");
  const all = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, City[]>;
  const cities = all[pref] || [];
  // 政令市の親エントリ（末尾 00）は区が別に並ぶので取り込まない
  return cities.filter((c) => !c.code.endsWith("00"));
}

function listUrl(pref: string, cty: string, page: number): string {
  const prf = PREF_CODES[pref];
  return (
    `https://www.shamaison.com/${pref}/area/${cty}/` +
    `?selectedPage=${page}&image=01&view=2&PRF=${prf}` +
    `&MOV=0&childSort=0&CTY=${cty}&sort=14&AJX=0`
  );
}

interface RoomRow {
  href: string;
  buildingName: string;
  address: string;
  transport: string;
  built: string;
  isNew: boolean;
  rentMan: string | null;
  feeText: string;
  layout: string;
  sizeFloor: string;
}

/** 一覧 1 ページぶんの建物→部屋をフラットにして返す。現在のページ番号も一緒に返す */
async function extractPage(
  page: Page,
): Promise<{ activePage: number | null; rows: RoomRow[] }> {
  return page.evaluate(() => {
    const B = "l2-searchBuilding__item";
    const activeText =
      document.querySelector(".l2-pager__link.is-active")?.textContent?.trim() ||
      "";
    const activePage = /^\d+$/.test(activeText) ? parseInt(activeText, 10) : null;

    const rows: any[] = [];
    for (const item of Array.from(document.querySelectorAll(`.${B}`))) {
      // 変数に代入した関数を evaluate に持ち込むと、tsx(esbuild) が付ける
      // __name ヘルパーがブラウザ側に無く ReferenceError になる。全て直書きする。
      const buildingName = (
        item.querySelector(`.${B}__header__info__name__inner`)?.textContent || ""
      ).replace(/\s+/g, " ").trim();
      const address = (
        item.querySelector(`.${B}__header__info__item.p2-i-bf-place`)
          ?.textContent || ""
      ).replace(/\s+/g, " ").trim();
      const transport = (
        item.querySelector(`.${B}__header__info__item.p2-i-bf-train`)
          ?.textContent || ""
      ).replace(/\s+/g, " ").trim();
      const built = (
        item.querySelector(`.${B}__header__info__item.p2-i-bf-time`)
          ?.textContent || ""
      ).replace(/\s+/g, " ").trim();
      const isNew = !!item.querySelector(`.${B}__header__info__name__tag.is-new`);

      for (const room of Array.from(item.querySelectorAll(`.${B}__room`))) {
        const href =
          room
            .querySelector(`.${B}__room__actions__link`)
            ?.getAttribute("href") || "";
        if (!href) continue;
        const rentMan =
          room
            .querySelector(`.${B}__room__info__price__maintext span`)
            ?.textContent?.trim() || null;
        const feeText = (
          room.querySelector(`.${B}__room__info__price__subtext`)?.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        const fp: string[] = [];
        for (const e of Array.from(
          room.querySelectorAll(`.${B}__room__info__floorplan__text`),
        )) {
          fp.push((e.textContent || "").replace(/\s+/g, " ").trim());
        }
        rows.push({
          href,
          buildingName,
          address,
          transport,
          built,
          isNew,
          rentMan,
          feeText,
          layout: fp[0] || "",
          sizeFloor: fp[1] || "",
        });
      }
    }
    return { activePage, rows };
  });
}

async function saveToDatabase(prisma: PrismaClient, rows: RoomRow[]) {
  let saved = 0;
  for (const r of rows) {
    const rent = manToYen(r.rentMan);
    const sizeMatch = r.sizeFloor.match(/([\d.]+)\s*㎡/);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : null;
    if (!r.address || rent == null || size == null) continue;

    const floorMatch = r.sizeFloor.match(/(\d+階)/);
    const feeMatch = r.feeText.match(/([\d.]+)\s*万円/);
    const url = `https://www.shamaison.com${r.href}`;
    const attributes = {
      property_name: r.buildingName || "Unknown",
      address: r.address,
      rent,
      management_fee: feeMatch ? manToYen(feeMatch[1]) ?? 0 : 0,
      layout: r.layout,
      size_sqm: size,
      building_age: r.isNew ? 0 : parseBuiltAge(r.built),
      minutes_to_station: parseAccessMinutes(r.transport),
      floor: floorMatch ? floorMatch[1] : "",
      is_new_build: r.isNew,
    };
    try {
      await prisma.rental_properties.upsert({
        where: { url },
        update: { ...attributes, last_seen_at: new Date() },
        create: {
          ...attributes,
          url,
          source_scraper: "shamaison_playwright",
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
        console.log(`⏱️ Time budget reached at ${pref}/${city.name} page ${current}.`);
        saveState(pref, cityIndex, current);
        break;
      }

      // メモリ対策: 一定ページごとにタブを作り直す
      if (current > startPage && (current - startPage) % 10 === 0) {
        await page.close();
        await context.close();
        context = await browser.newContext(CONTEXT_OPTIONS);
        page = await context.newPage();
      }

      const url = listUrl(pref, city.code, current);
      console.log(`Navigating to ${url}`);
      saveState(pref, cityIndex, current);

      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);

      const { activePage, rows } = await extractPage(page);
      // 存在しないページを要求すると 1 ページ目が返ってくるため、
      // ページャの現在位置がずれた時点で終了する。
      if (current > 1 && activePage !== current) {
        console.log(
          `Pager returned page ${activePage} for request ${current}. Done with ${city.name}.`,
        );
        break;
      }
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
    const prefectures = (process.env.SHAMAISON_PREFECTURES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (prefectures.length === 0) prefectures.push(...DEFAULT_PREFECTURES);
    console.log(`Target prefectures: ${prefectures.join(", ")}`);

    const state = loadState();
    let skipPref = !!state.pref;

    for (const pref of prefectures) {
      if (budgetExhausted) break;
      if (!PREF_CODES[pref]) {
        console.warn(`Unknown prefecture slug: ${pref}`);
        continue;
      }
      if (skipPref && pref !== state.pref) {
        console.log(`Skipping prefecture: ${pref}`);
        continue;
      }
      const resuming = skipPref;
      skipPref = false;

      const cities = loadCities(pref);
      console.log(`${pref}: ${cities.length} cities`);

      const startCity = resuming ? state.cityIndex : 0;
      for (let i = startCity; i < cities.length; i++) {
        if (budgetExhausted) break;
        const city = cities[i];
        console.log(`\n=== ${pref} / ${city.name} [${i + 1}/${cities.length}] ===`);
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
