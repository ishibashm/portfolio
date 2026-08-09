import { chromium, Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { TARGET_PREFECTURE_SLUGS } from "../src/lib/scrapeTargets";

const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Please ensure your .env file exists and contains DATABASE_URL.",
  );
}

const BROWSER_OPTIONS = {
  headless: true,
};

// CI（GitHub Actions）では 1 ジョブの上限時間があるため、全件走り切るまで回すと
// 途中で強制終了され、再開用のステートも保存されないまま終わってしまう。
// SCRAPER_TIME_BUDGET_MIN を与えると、その時間を超えた時点でページ境界で
// 自発的に停止し、scraper_state.json を残したまま正常終了する。
// 未設定（または 0）ならこれまで通り最後まで走る。
const TIME_BUDGET_MS =
  (parseInt(process.env.SCRAPER_TIME_BUDGET_MIN || "0", 10) || 0) * 60_000;
const STARTED_AT = Date.now();
let budgetExhausted = false;

// 新着スイープモード。
// 全件を舐めると 12 県で数十時間かかるが、実測では刈谷市 1,278 件のうち新着は 64 件（約5%）。
// 「新着のみ(ex13=1) + 新着物件順(sort=regDate-desc)」に絞れば桁違いに軽く、
// 数時間おきに回して新着だけをほぼ即時に取り込める。
// 全件スイープ（夜間）は価格改定と掲載終了の追随用に別途残す。
const NEW_ONLY = process.env.SCRAPER_NEW_ONLY === "true";
const NEW_ARRIVAL_QUERY = "?ex13=1&sort=regDate-desc";
// 新着は 1 市区町村あたり数十件しかないので、取りこぼしを防ぎつつ暴走も防ぐ上限。
const MAX_PAGES =
  parseInt(process.env.SCRAPER_MAX_PAGES || "", 10) || (NEW_ONLY ? 3 : 0);

function checkTimeBudget(): boolean {
  if (TIME_BUDGET_MS <= 0) return false;
  if (Date.now() - STARTED_AT >= TIME_BUDGET_MS) {
    budgetExhausted = true;
    return true;
  }
  return false;
}

const CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
};

// Map Nifty rent string (e.g. "12.5") to integer JPY (e.g. 125000)
function parseRent(rentStr: string): number {
  if (!rentStr || rentStr === "-") return 0;
  const num = parseFloat(rentStr);
  return isNaN(num) ? 0 : Math.round(num * 10000);
}

// Map Nifty floor area string (e.g. "33.4") to decimal
function parseSize(sizeStr: string): number {
  if (!sizeStr || sizeStr === "-") return 0;
  const num = parseFloat(sizeStr);
  return isNaN(num) ? 0 : num;
}

// Map Nifty age string (e.g. "新築", "築10年", "18年11ヶ月") to integer years.
// 取得できなかった場合に 0 を返すと「新築」と区別が付かず、築0年の物件が
// 水増しされてしまうため null を返す。
function parseAge(ageStr: string): number | null {
  if (!ageStr || ageStr === "-") return null;
  if (ageStr === "新築") return 0;
  // 「11ヶ月」のように 1 年未満は年の表記が無い
  if (/^\s*\d+\s*ヶ月/.test(ageStr)) return 0;
  // 「築」があってもなくても、数字の後に「年」が続くパターンにマッチさせます
  const match = ageStr.match(/(?:築)?(\d+)年/);
  return match ? parseInt(match[1], 10) : null;
}

// Nifty の管理費は "9,800円" のように円単位・カンマ区切りで来る（賃料だけが万円単位）。
// これまで保存していなかったため management_fee が全件 NULL になっており、
// 利回り偏差値の元になる総賃料が管理費のぶん過小に出ていた。
function parseManagementFee(costStr: string): number {
  if (!costStr) return 0;
  if (/無料|なし|不要/.test(costStr)) return 0;
  const digits = costStr.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return isNaN(n) ? 0 : n;
}

// Nifty の掲載期限は "20260810000000" (YYYYMMDDHHMMSS) 形式。
// 掲載が終わった物件の詳細ページは 404 になるため、これを保存して
// 期限切れをスキャナーから外す。実測では 7 日以上再確認できていない行の
// 半数が既に 404 だった。
function parseExpireDate(raw: string): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T23:59:59+09:00`);
  return isNaN(date.getTime()) ? null : date;
}

// "ＪＲ東海道本線/東刈谷駅 徒歩6分" や "バス15分 徒歩5分" から徒歩の分数を取る。
// minutes_to_station カラムは以前から存在するのに一度も埋めていなかったため、
// 画面の駅徒歩が常に「不明」になっていた。
function parseWalkMinutes(accessStr: string): number | null {
  if (!accessStr) return null;
  const match = accessStr.match(/徒歩\s*(\d+)\s*分/);
  return match ? parseInt(match[1], 10) : null;
}

async function saveToDatabase(prisma: PrismaClient, properties: any[]) {
  let savedCount = 0;
  for (const prop of properties) {
    if (!prop.url) continue;

    // Nifty URLs might be relative, ensure absolute
    const absoluteUrl = prop.url.startsWith("http")
      ? prop.url
      : `https://myhome.nifty.com${prop.url}`;

    let retries = 3;
    let success = false;
    let lastError: any = null;

    while (!success && retries > 0) {
      try {
        // update は last_seen_at と rent しか触っていなかったため、初回取得時の
        // 築年数・面積・間取りが未来永劫そのまま残っていた（年が変わっても築年数が増えない）。
        // 再取得したなら全項目を今の値に合わせる。
        const attributes = {
          property_name: prop.title || "Unknown",
          address: prop.address || "",
          rent: parseRent(prop.rent),
          management_fee: parseManagementFee(prop.manageCost),
          layout: prop.layout || "",
          size_sqm: parseSize(prop.floorArea),
          building_age: parseAge(prop.buildAge),
          minutes_to_station: parseWalkMinutes(prop.access),
          floor: prop.floor || "",
          is_new_build: prop.buildAge === "新築",
          expire_date: parseExpireDate(prop.expireDate),
        };

        await prisma.rental_properties.upsert({
          where: { url: absoluteUrl },
          update: {
            ...attributes,
            last_seen_at: new Date(),
          },
          create: {
            ...attributes,
            url: absoluteUrl,
            source_scraper: "nifty_playwright",
            first_seen_at: new Date(),
            last_seen_at: new Date(),
          },
        });
        savedCount++;
        success = true;
      } catch (e: any) {
        lastError = e;
        if (
          e.code === "P2037" ||
          (e.message && e.message.includes("too many clients"))
        ) {
          console.warn(
            `⏳ Connection limit reached for ${absoluteUrl}. Retrying in 3s... (${retries} attempts left)`,
          );
          await new Promise((res) => setTimeout(res, 3000));
          retries--;
        } else {
          console.error(`Failed to save ${absoluteUrl}:`, e.message || e);
          break;
        }
      }
    }

    if (
      !success &&
      lastError &&
      (lastError.code === "P2037" ||
        (lastError.message && lastError.message.includes("too many clients")))
    ) {
      console.error(
        `❌ Failed to save ${absoluteUrl} after all retries due to connection limits.`,
      );
    }

    // Add a slight delay to yield the database connection back to the pool
    await new Promise((res) => setTimeout(res, 50));
  }
  console.log(`Upserted ${savedCount} records to database.`);
}

async function extractPropertiesFromPage(page: Page) {
  try {
    const data = await page.evaluate(() => {
      // @ts-ignore
      return window.Nifty?.Data?.Bukken || {};
    });
    return Object.values(data);
  } catch (e) {
    return [];
  }
}

async function scrapeArea(
  browser: any,
  prisma: PrismaClient,
  prefAlpha: string,
  cityAlpha: string,
  startPage: number = 1,
) {
  let currentPage = startPage;
  const allProperties: any[] = [];
  const seenIds = new Set<string>();

  let context = await browser.newContext(CONTEXT_OPTIONS);
  let page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  try {
    while (true) {
      if (checkTimeBudget()) {
        console.log(
          `⏱️ Time budget reached. Stopping at ${prefAlpha}/${cityAlpha} page ${currentPage}; state is saved for the next run.`,
        );
        saveState(prefAlpha, cityAlpha, currentPage);
        break;
      }

      // メモリ対策: 10ページ進むごとにタブを作り直してメモリを解放（Page crashed対策）
      if (currentPage > startPage && currentPage % 10 === 0) {
        console.log("🔄 Recreating browser page to prevent memory leak...");
        await page.close();
        await context.close();
        context = await browser.newContext(CONTEXT_OPTIONS);
        page = await context.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });
        });
      }

      if (MAX_PAGES > 0 && currentPage > MAX_PAGES) {
        console.log(`Reached the page cap (${MAX_PAGES}). Moving on.`);
        break;
      }

      const basePath =
        currentPage === 1
          ? `https://myhome.nifty.com/rent/${prefAlpha}/${cityAlpha}_ct/`
          : `https://myhome.nifty.com/rent/${prefAlpha}/${cityAlpha}_ct/${currentPage}/`;
      const url = NEW_ONLY ? `${basePath}${NEW_ARRIVAL_QUERY}` : basePath;
      console.log(`Navigating to ${url}`);

      // ここでステートを保存（途中で落ちてもこのページから再開できるようにする）。
      // 新着スイープは 1 回で全市区町村を回り切る前提なので、再開位置は持たない。
      // ここで保存すると全件スイープ側の再開位置を壊してしまう。
      if (!NEW_ONLY) {
        saveState(prefAlpha, cityAlpha, currentPage);
      }

      await page.goto(url, { waitUntil: "domcontentloaded" });

      const isConditionPage = await page.$(".btn-search-submit");
      if (isConditionPage) {
        console.log("Condition page detected, clicking search...");
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded" }),
          page.click(".btn-search-submit"),
        ]);
      }

      // Wait a little bit for the JS object to be populated
      await new Promise((res) => setTimeout(res, 1000));

      const props = await extractPropertiesFromPage(page);
      console.log(`Found ${props.length} properties on page ${currentPage}.`);

      if (props.length === 0) {
        console.log("No more properties found. Pagination complete.");
        break;
      }

      let newPropsCount = 0;
      for (const prop of props) {
        if (!seenIds.has(prop.id)) {
          seenIds.add(prop.id);
          allProperties.push(prop);
          newPropsCount++;
        }
      }

      if (newPropsCount === 0) {
        console.log(
          "No new properties found on this page. Stopping to prevent infinite loop.",
        );
        break;
      }

      // ==========================================
      // Save to database
      // ==========================================
      await saveToDatabase(prisma, props);

      // [重要: サーバーに負荷をかけないためのマナー（Polite Scraping）]
      // 相手サーバーへの負荷を考慮しつつ、待機時間を少し短縮（2〜4秒）
      const delayMs = 2000 + Math.floor(Math.random() * 2000);
      console.log(
        `Polite delay: Waiting for ${Math.round(delayMs / 1000)} seconds...`,
      );
      await new Promise((res) => setTimeout(res, delayMs));

      currentPage++;
    }
  } finally {
    try {
      await page.close();
      await context.close();
    } catch (_) {}
  }

  return allProperties;
}

/**
 * 県の市区町村一覧を取る。
 *
 * ここが 0 件で返ると、呼び出し側の for ループが 1 度も回らないまま
 * 「完了」に到達する。実際 2026-08-08 の大阪がそれで、8 秒で
 * 「✅ Scraping completed successfully!」を出して緑になり、再開位置まで
 * 消していた。取り込み 0 件と正常終了が区別できないのは、新しい県を
 * 足した初回ほど困る（色が付かない理由が分からない）。
 *
 * 空は「その県に物件が無い」ではなく「取得に失敗した」とみなす。
 * 一度の読み込み失敗で県ごと落とすのは惜しいので数回試し、それでも
 * 空なら投げる。投げれば再開位置は消えず、次の実行が続きから走る。
 */
const CITY_LIST_ATTEMPTS = 3;

async function fetchCitiesForPrefecture(
  page: Page,
  prefAlpha: string,
): Promise<string[]> {
  const url = `https://myhome.nifty.com/rent/${prefAlpha}/`;

  for (let attempt = 1; attempt <= CITY_LIST_ATTEMPTS; attempt++) {
    console.log(
      `Fetching city list for prefecture: ${prefAlpha}... (attempt ${attempt}/${CITY_LIST_ATTEMPTS})`,
    );
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Wait a moment for dynamic elements or additional links to be populated
      await page.waitForTimeout(2000);

      // Extract all links that end with _ct/
      const links = await page.$$eval("a", (anchors) =>
        anchors
          .map((a) => a.href)
          .filter((h) => h.includes("_ct/") && !h.includes("detail_")),
      );

      const uniqueUrls = Array.from(new Set(links));
      const cities = Array.from(
        new Set(
          uniqueUrls
            .map((u) => {
              const match = u.match(/\/rent\/[^\/]+\/([a-z0-9]+)_ct\//);
              return match ? match[1] : null;
            })
            .filter(Boolean) as string[],
        ),
      );

      console.log(`Found ${cities.length} cities in ${prefAlpha}.`);
      if (cities.length > 0) return cities;
    } catch (error: any) {
      console.error(
        `City list fetch failed for ${prefAlpha}: ${error?.message ?? error}`,
      );
    }

    if (attempt < CITY_LIST_ATTEMPTS) {
      const waitMs = 5000 * attempt;
      console.log(`Retrying the city list in ${waitMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }

  throw new Error(
    `${prefAlpha} の市区町村一覧が ${CITY_LIST_ATTEMPTS} 回とも 0 件だった。` +
      `取り込み 0 件を正常終了として扱わないため、ここで失敗させる。` +
      `一覧ページ (${url}) の構造変更かアクセス遮断を疑うこと。`,
  );
}

// CI では都道府県ごとに並列でジョブを回すため、再開位置のファイルも分ける必要がある。
// 1 本のファイルを共有すると、並列ジョブが互いの再開位置を上書きしてしまう。
const STATE_FILE =
  process.env.SCRAPER_STATE_FILE ||
  path.join(process.cwd(), "scripts", "scraper_state.json");

function loadState(): {
  pref: string | null;
  city: string | null;
  page: number;
} {
  console.log(`Checking state file at: ${STATE_FILE}`);
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      console.log(`Loaded state: ${JSON.stringify(parsed)}`);
      return {
        pref: parsed.pref || null,
        city: parsed.city || null,
        page: parsed.page || 1,
      };
    } else {
      console.log("State file does not exist.");
    }
  } catch (e) {
    console.warn("Failed to load state, starting from beginning.");
  }
  return { pref: null, city: null, page: 1 };
}

function saveState(pref: string, city: string, page: number = 1) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ pref, city, page }, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  let dbHost = "unknown";
  if (connectionString) {
    try {
      dbHost = new URL(connectionString.replace("postgresql://", "http://"))
        .host;
    } catch (_) {
      dbHost = "configured-host";
    }
  }
  console.log(`Connecting to database at ${dbHost}...`);
  const pool = new Pool({ connectionString, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const browser = await chromium.launch(BROWSER_OPTIONS);

  try {
    // ターゲット都道府県。CI からは SCRAPER_PREFECTURES で 1 県ずつ渡して並列実行する。
    // 既定値は src/lib/scrapeTargets.ts の全県。パージの許可リストと
    // 同じ情報源から引いているので、取った端から消される事故は起きない。
    const DEFAULT_TARGET_PREFECTURES = [...TARGET_PREFECTURE_SLUGS];
    const targetPrefectures = (process.env.SCRAPER_PREFECTURES || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (targetPrefectures.length === 0) {
      targetPrefectures.push(...DEFAULT_TARGET_PREFECTURES);
    }
    console.log(`Target prefectures: ${targetPrefectures.join(", ")}`);

    // 刈谷市への通勤圏となる市区町村（Nifty不動産のURLキー）
    const kariyaCommutingCities = new Set([
      // 愛知県（西三河・名古屋南部等）
      "kariyashi",
      "chiryushi",
      "anjoshi",
      "takahamashi",
      "hekinanshi",
      "toyotashi",
      "okazakishi",
      "nishioshi",
      "obushi",
      "tokaishi",
      "handashi",
      "miyoshishi",
      "aichiguntogocho",
      "nagoyashimidoriku",
      "nagoyashiminamiku",
      // 三重県（桑名・四日市・川越等）
      "kuwanashi",
      "yokkaichishi",
      "kuwanagunkisosakicho",
      "miegunkawagoecho",
      "miegunasahicho",
      // 岐阜県（JR・名鉄通勤圏）
      "gifushi",
      "kakamigaharashi",
      "ogakishi",
      "tajimishi",
    ]);

    // 刈谷通勤圏だけに絞るフラグ。対象が 12 県に広がったため既定では無効で、
    // SCRAPER_COMMUTING_FILTER=true を渡したときだけ上の市区町村リストで絞り込む。
    const useCommutingFilter = process.env.SCRAPER_COMMUTING_FILTER === "true";
    console.log(`Commuting-area filter: ${useCommutingFilter ? "on" : "off"}`);

    // 進行状況の読み込み。新着スイープは毎回すべての市区町村を頭から回るので再開しない。
    console.log(`Mode: ${NEW_ONLY ? "new arrivals only" : "full sweep"}`);
    const state = NEW_ONLY
      ? { pref: null, city: null, page: 1 }
      : loadState();
    let skipPref = !!state.pref;
    let skipCity = !!state.city;

    if (state.pref || state.city || state.page > 1) {
      console.log(`\n======================================================`);
      console.log(
        `🔄 RESUMING FROM SAVED STATE: ${state.pref} - ${state.city} (Page ${state.page})`,
      );
      console.log(`======================================================\n`);
    }

    for (const pref of targetPrefectures) {
      if (budgetExhausted) break;
      if (skipPref && pref !== state.pref) {
        console.log(`Skipping prefecture: ${pref}`);
        continue;
      }
      skipPref = false; // 目的の県に到達したので、これ以降の県はスキップしない

      // 都道府県の都市一覧を取得するためにページを作成
      let context = await browser.newContext(CONTEXT_OPTIONS);
      let page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      const cities = await fetchCitiesForPrefecture(page, pref);

      // 用が済んだら一度閉じてメモリを解放する
      await page.close();
      await context.close();

      // ランダムに待機して負荷分散
      await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1500));

      for (const city of cities) {
        if (budgetExhausted) break;
        if (skipCity) {
          if (city === state.city) {
            skipCity = false;
            console.log(`Reached resume target city: ${city}`);
          } else {
            console.log(`Skipping city for resume: ${city}`);
            continue;
          }
        }

        if (useCommutingFilter && !kariyaCommutingCities.has(city)) {
          // 刈谷通勤圏外の市区町村はスキップして高速化とDB肥大化を防止
          continue;
        }

        console.log(`\n======================================================`);
        console.log(` Starting extraction for ${pref} - ${city}`);
        console.log(`======================================================\n`);

        try {
          // 目的の市に到達したばかりなら保存されているページ数から、それ以降は1ページ目から開始
          const startPage =
            pref === state.pref && city === state.city ? state.page : 1;
          await scrapeArea(browser, prisma, pref, city, startPage);
        } catch (error: any) {
          console.error(`Error during extraction for ${city}:`, error.message);
          // 万が一クラッシュしてもスクリプト全体が止まらないようにし、少し待機して休ませる
          await new Promise((res) => setTimeout(res, 10000));
        }
      }
    }

    if (budgetExhausted) {
      // 未完了。ステートを残して次回の実行に続きを引き継ぐ。
      console.log(
        "⏸️ Stopped on the time budget. The remaining areas will be picked up by the next run.",
      );
    } else {
      console.log("✅ Scraping completed successfully!");
      // 完了したらステートファイルを削除して次回は最初から走る（＝全件リフレッシュ）。
      // 新着スイープは全件スイープの再開位置を持っていないので触らない。
      if (!NEW_ONLY && fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
      }
    }
  } catch (e) {
    // 握り潰して 0 で終わると、CI は緑のまま取り込み 0 件になる。
    // 何が起きたか気付けないので、後片付けだけしてから失敗として抜ける。
    // 県ごとに別ジョブ（fail-fast: false）なので、1 県落ちても他県は続く。
    console.error(e);
    process.exitCode = 1;
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
