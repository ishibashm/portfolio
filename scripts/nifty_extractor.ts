import { Browser, chromium, Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import { TARGET_PREFECTURE_SLUGS } from "../src/lib/scrapeTargets";
import { errorCode, toLogMessage } from "../src/lib/errorMessage";
import {
  buildRentalUpsert,
  dedupeByUrl,
  type RentalUpsertRow,
} from "../src/lib/rentalUpsert";
import {
  cityListLooksPartial,
  readKnownCityCount,
  rememberCityCount,
  resumeCityMissing,
  writeSweptState,
  hydrateStateFromDb,
  persistStateToDb,
  resumeStateKey,
} from "./scraperResume";

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

/**
 * 一覧ページの `window.Nifty.Data.Bukken` のうち、ここで読む枝だけ。
 * 値は全部文字列で来る（賃料は万円、管理費は円、面積は m²）ので、
 * 下の parse* を通してから保存する。欄ごと無い物件があるので任意。
 *
 * id だけは必須にしてある。Bukken は id をキーにした連想配列で、値にも
 * 同じ id が入っており、ページを跨いだ重複除去がこれに依存している。
 */
interface NiftyBukken {
  id: string;
  url?: string;
  title?: string;
  address?: string;
  rent?: string;
  manageCost?: string;
  layout?: string;
  floorArea?: string;
  buildAge?: string;
  access?: string;
  floor?: string;
  expireDate?: string;
}

/** 一覧ページが window に置いていく物件データ。型定義は無いので自分で書く。 */
type NiftyWindow = Window & {
  Nifty?: { Data?: { Bukken?: Record<string, NiftyBukken> } };
};

// Map Nifty rent string (e.g. "12.5") to integer JPY (e.g. 125000)
// 以下の parse* が undefined も取るのは、その欄が無い物件があるため。
// どれも先頭の falsy 判定で元からその場合を返しており、`string` を
// 名乗っていたのが型の嘘だった（呼び出し側が any だったので通っていた）。
function parseRent(rentStr: string | undefined): number {
  if (!rentStr || rentStr === "-") return 0;
  const num = parseFloat(rentStr);
  return isNaN(num) ? 0 : Math.round(num * 10000);
}

// Map Nifty floor area string (e.g. "33.4") to decimal
function parseSize(sizeStr: string | undefined): number {
  if (!sizeStr || sizeStr === "-") return 0;
  const num = parseFloat(sizeStr);
  return isNaN(num) ? 0 : num;
}

// Map Nifty age string (e.g. "新築", "築10年", "18年11ヶ月") to integer years.
// 取得できなかった場合に 0 を返すと「新築」と区別が付かず、築0年の物件が
// 水増しされてしまうため null を返す。
function parseAge(ageStr: string | undefined): number | null {
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
function parseManagementFee(costStr: string | undefined): number {
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
function parseExpireDate(raw: string | undefined): Date | null {
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
function parseWalkMinutes(accessStr: string | undefined): number | null {
  if (!accessStr) return null;
  const match = accessStr.match(/徒歩\s*(\d+)\s*分/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 接続数の上限に当たったか。Prisma は code=P2037 で返すが、プールや
 * ドライバ側から文字列だけで来ることもあるのでメッセージも見る。
 *
 * 同じ条件をループの中と後の 2 か所に書いていた。片方だけ直すと、
 * 再試行はするのに最後の一行が出ない（またはその逆）という食い違いになる。
 */
function isConnectionLimitError(err: unknown): boolean {
  return (
    errorCode(err) === "P2037" || toLogMessage(err).includes("too many clients")
  );
}

/**
 * **1 ページあたりの最低間隔。**取得を始めてからここまでは、次のページへ
 * 行かない。
 *
 * ## なぜ「待つ」と書くようになったか（2026-08-30 の事故）
 *
 * 以前の待機は「polite delay 2〜4 秒」だけだった。ところが**保存が
 * 1 件ずつで 15〜30 秒かかっており、それが実質のスロットルとして
 * 働いていた。**#767 で保存をまとめたら 1 ページの間隔が 34.3 秒 →
 * 6.0 秒（中央値）になり、相手への要求レートが 3〜5 倍になった。
 * 8 ジョブ並列なので全体ではさらに効く。
 *
 * その晩の巡回は、再開した大都市を抜けた直後から**ほぼ全ての市区町村で
 * 「0 件」**を返すようになった（江東区・品川区が 0 件ということはない）。
 * 8/26 の富山（間隔 14.5 秒）は 14 市町村すべてで取れていたので、
 * レートを上げたことが原因とみている。
 *
 * **速さを保存待ちの副作用に頼らない。**必要な間隔はここに数字で書く。
 * 事故前の実測（14.5〜34.3 秒）の下寄りに置いた。**短くしないこと。**
 */
const MIN_PAGE_INTERVAL_MS = 20000;

/** 取得開始から MIN_PAGE_INTERVAL_MS 経つまで待つ。既に過ぎていれば待たない。 */
async function waitForMinimumPageInterval(startedAt: number): Promise<void> {
  /* 一定間隔だと相手から見て機械的すぎるので、以前と同じ幅で散らす */
  const jitter = Math.floor(Math.random() * 2000);
  const waitMs = MIN_PAGE_INTERVAL_MS + jitter - (Date.now() - startedAt);
  if (waitMs <= 0) return;
  console.log(
    `Polite delay: Waiting for ${Math.round(waitMs / 1000)} seconds...`,
  );
  await new Promise((res) => setTimeout(res, waitMs));
}

/**
 * 1 文にまとめる件数。
 *
 * 1 ページ 50 件を 2 文で書く。もっと大きくしてもよいが、
 * placeholder が増えるほど 1 文の失敗で巻き戻る量も増える。
 */
const UPSERT_CHUNK = 25;

async function saveToDatabase(prisma: PrismaClient, properties: NiftyBukken[]) {
  /*
    以前は 1 件ずつ upsert して、さらに 1 件ごとに 50ms 眠っていた。
    遠隔の Postgres への往復 50 回 + 2.5 秒の待機がページごとに乗り、
    1 ページに 20〜35 秒かかっていた。50 分の予算がそれで尽きて、
    岡山県は岡山市から一歩も出られていなかった（2026-08-30 の実測）。

    **取得の間隔も回数も変えずに、保存だけをまとめる。**相手サイトへの
    要求は 1 回も増えない。
  */
  const rows: RentalUpsertRow[] = [];
  for (const prop of properties) {
    if (!prop.url) continue;
    // Nifty URLs might be relative, ensure absolute
    const absoluteUrl = prop.url.startsWith("http")
      ? prop.url
      : `https://myhome.nifty.com${prop.url}`;
    // update は last_seen_at と rent しか触っていなかったため、初回取得時の
    // 築年数・面積・間取りが未来永劫そのまま残っていた（年が変わっても築年数が増えない）。
    // 再取得したなら全項目を今の値に合わせる。
    rows.push({
      url: absoluteUrl,
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
      source_scraper: "nifty_playwright",
    });
  }

  const unique = dedupeByUrl(rows);
  let savedCount = 0;

  for (let i = 0; i < unique.length; i += UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + UPSERT_CHUNK);
    const statement = buildRentalUpsert(chunk, new Date());
    if (!statement) continue;

    let retries = 3;
    let success = false;
    let lastError: unknown = null;

    while (!success && retries > 0) {
      try {
        await prisma.$executeRawUnsafe(statement.sql, ...statement.params);
        savedCount += chunk.length;
        success = true;
      } catch (e) {
        lastError = e;
        if (isConnectionLimitError(e)) {
          console.warn(
            `⏳ Connection limit reached. Retrying ${chunk.length} rows in 3s... (${retries} attempts left)`,
          );
          await new Promise((res) => setTimeout(res, 3000));
          retries--;
        } else {
          console.error(
            `Failed to save ${chunk.length} rows:`,
            toLogMessage(e) || e,
          );
          break;
        }
      }
    }

    if (!success && lastError && isConnectionLimitError(lastError)) {
      console.error(
        `❌ Failed to save ${chunk.length} rows after all retries due to connection limits.`,
      );
    }
  }
  console.log(`Upserted ${savedCount} records to database.`);
}

async function extractPropertiesFromPage(page: Page): Promise<NiftyBukken[]> {
  try {
    const data = await page.evaluate(
      () => (window as NiftyWindow).Nifty?.Data?.Bukken || {},
    );
    return Object.values(data);
  } catch {
    return [];
  }
}

async function scrapeArea(
  browser: Browser,
  prisma: PrismaClient,
  prefAlpha: string,
  cityAlpha: string,
  startPage: number = 1,
) {
  let currentPage = startPage;
  const allProperties: NiftyBukken[] = [];
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

      /* このページを取り始めた時刻。下の「1 ページの最低間隔」で使う */
      const pageStartedAt = Date.now();
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
        /* **待ってから抜ける。**以前は break で polite delay を通らず、
           掲載の無い市区町村を 1.7 秒間隔で連打していた（2026-08-30 の
           実測）。空振りこそ次の市へすぐ移るので、ここが最も速く連打
           される経路になる */
        await waitForMinimumPageInterval(pageStartedAt);
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
        await waitForMinimumPageInterval(pageStartedAt);
        break;
      }

      // ==========================================
      // Save to database
      // ==========================================
      await saveToDatabase(prisma, props);

      // [重要: サーバーに負荷をかけないためのマナー（Polite Scraping）]
      await waitForMinimumPageInterval(pageStartedAt);

      currentPage++;
    }
  } finally {
    try {
      await page.close();
      await context.close();
    } catch {}
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
  /* 前に見えた市区町村の数。0 なら比べる相手がいない（初回）。
     取得が部分的だったときに取り直すためだけに使う。 */
  knownCityCount: number = 0,
): Promise<string[]> {
  let best: string[] = [];
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
      if (cities.length > best.length) best = cities;

      /* 部分取得を「成功」として受け入れない。一覧は動的に描かれる部分が
         あり、domcontentloaded から 2 秒では取り切れないことがある。
         2026-08-25 の北海道は 10 件しか取れていなかったが、DB は同じ道で
         125 市区町村を知っている。既にある再試行の仕組みに乗せるだけで、
         リクエストの間隔も回数の上限（CITY_LIST_ATTEMPTS）も変えない。 */
      if (cities.length > 0) {
        if (!cityListLooksPartial(cities.length, knownCityCount)) return cities;
        console.warn(
          `⚠️ ${prefAlpha} の市区町村一覧が ${cities.length} 件しか取れていない` +
            `（前は ${knownCityCount} 件）。取り直す。`,
        );
      }
    } catch (error) {
      console.error(
        `City list fetch failed for ${prefAlpha}: ${toLogMessage(error)}`,
      );
    }

    if (attempt < CITY_LIST_ATTEMPTS) {
      const waitMs = 5000 * attempt;
      console.log(`Retrying the city list in ${waitMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }

  if (best.length > 0) {
    /* 取り直しても増えなかった。掲載が本当に減った可能性もあるので
       止めはしないが、その日の巡回はこの範囲しか回れないと分かる形で残す。 */
    console.warn(
      `⚠️ ${prefAlpha} の市区町村一覧は ${CITY_LIST_ATTEMPTS} 回とも ` +
        `${best.length} 件どまりだった（前は ${knownCityCount} 件）。` +
        `この範囲だけを回る。`,
    );
    return best;
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

/** DB 側の鍵。県ごとに別のファイルを使っているので、その名前で分ける。 */
const RESUME_KEY = resumeStateKey("nifty", STATE_FILE);

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
  } catch {
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
    } catch {
      dbHost = "configured-host";
    }
  }
  console.log(`Connecting to database at ${dbHost}...`);
  const pool = new Pool({ connectionString, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

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
    /* cache が復元できなかった回は、DB に置いた再開位置で受ける
       （2026-08-24 の okayama が実際にこれで先頭へ戻っていた）。
       ファイルがあればそちらが勝つ。 */
    if (!NEW_ONLY) {
      await hydrateStateFromDb(prisma, RESUME_KEY, STATE_FILE);
    }
    const state = NEW_ONLY
      ? { pref: null, city: null, page: 1 }
      : loadState();
    let skipPref = !!state.pref;
    let skipCity = !!state.city;
    /** 実際に走査した市区町村の数。0 のまま終わったら再開位置を疑う。 */
    let areasCrawled = 0;
    /** そのうち 1 件も取れなかった数。多すぎたら弾かれている疑い（下の註）。 */
    let emptyAreas = 0;

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
      const context = await browser.newContext(CONTEXT_OPTIONS);
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      const cities = await fetchCitiesForPrefecture(
        page,
        pref,
        readKnownCityCount(STATE_FILE, pref),
      );
      rememberCityCount(STATE_FILE, pref, cities.length);

      /* 再開位置の市区町村が一覧から消えていることがある。待ち続けると
         どれにも一致しないまま全部をスキップし、1 ページも取らずに
         「成功」する（scraperResume の註）。消えていたら先頭から回す。 */
      if (skipCity && resumeCityMissing(state.city, cities)) {
        console.warn(
          `⚠️ 再開位置の市区町村 (${state.city}) が ${pref} の一覧` +
            `（${cities.length} 件）に無い。先頭から回す。`,
        );
        skipCity = false;
      }

      // 用が済んだら一度閉じてメモリを解放する
      await page.close();
      await context.close();

      // ランダムに待機して負荷分散
      await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1500));

      /* 再開位置から末尾まで回ったあと、**先頭に戻って続ける。**

         以前は末尾で終わっていた。再開位置が一覧の後ろのほうにあると、
         残りが数件しか無いのに予算を丸ごと残して「成功」で終わる。
         実測（2026-08-28 の長崎）で、予算 50 分に対し **1.3 分・1 件**で
         終わっていた。次の晩は再開位置が先頭に戻るので回復はするが、
         その晩ぶんの巡回は丸ごと無駄になる。

         一巡させれば予算を使い切れる。**1 回の実行で同じ市区町村を
         2 度は回らない**（順番を並べ替えるだけで、request の数も間隔も
         変わらない）。相手側への 1 分あたりの負荷は同じ。 */
      const startAt = skipCity && state.city ? cities.indexOf(state.city) : 0;
      const ordered =
        startAt > 0
          ? [...cities.slice(startAt), ...cities.slice(0, startAt)]
          : cities;
      if (startAt > 0) {
        skipCity = false; // 並べ替えで先頭に持ってきたので、読み飛ばしは不要
        console.log(
          `Reached resume target city: ${state.city}（ここから一巡する。` +
            `末尾まで行ったら先頭 ${cities[0]} に戻って続ける）`,
        );
      }

      for (const city of ordered) {
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
          const found = await scrapeArea(browser, prisma, pref, city, startPage);
          areasCrawled++;
          if (found.length === 0) emptyAreas++;
        } catch (error) {
          console.error(
            `Error during extraction for ${city}:`,
            toLogMessage(error),
          );
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
      if (areasCrawled === 0) {
        /* 1 つも回らずに「完了」するのは、ほぼ再開位置の壊れ。緑のまま
           0 件が続くと気付けないので、はっきり警告として残す。 */
        console.warn(
          "⚠️ 1 つも市区町村を回らずに終了した。再開位置か市区町村一覧を疑うこと。",
        );
      } else {
        console.log(
          `✅ Scraping completed successfully! (${areasCrawled} areas, ${emptyAreas} empty)`,
        );
        /*
          「回ったが取れなかった」市区町村が多すぎるときの網。

          2026-08-30 の巡回は、要求レートを上げすぎたせいで大都市を
          抜けた直後からほぼ全部が 0 件になったのに、**緑で完了して
          再開位置まで消していた。**既存の網は areasCrawled === 0 しか
          見ておらず、「67 areas 回った」形は素通りする。

          掲載の無い町村は現実にあるので、割合で見る。半分を超えたら
          相手に弾かれている疑いのほうが強い。
        */
        if (areasCrawled >= 4 && emptyAreas > areasCrawled / 2) {
          console.warn(
            `⚠️ ${areasCrawled} 件中 ${emptyAreas} 件で 1 件も取れていない。` +
              `取得間隔（MIN_PAGE_INTERVAL_MS）と、相手に弾かれていないかを疑うこと。`,
          );
        }
      }
      // 完了したら再開位置を空にして、次回は先頭から走る（＝全件リフレッシュ）。
      // **消すのではなく空を書く**（scraperResume の註。消すと CI が
      // キャッシュを保存せず、古い再開位置が翌日も復元される）。
      // 新着スイープは全件スイープの再開位置を持っていないので触らない。
      if (!NEW_ONLY) {
        writeSweptState(STATE_FILE);
      }
    }

    /* 予算切れで止まった場合も、一巡が終わった場合も、いまのファイルを
       DB に写す。cache が引けなかった次回はここから復元する。
       失敗しても巡回の成否には影響させない（警告だけ）。 */
    if (!NEW_ONLY) {
      await persistStateToDb(prisma, RESUME_KEY, STATE_FILE);
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
