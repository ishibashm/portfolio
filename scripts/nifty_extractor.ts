import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const envPath = fs.existsSync(path.resolve(process.cwd(), '.env'))
  ? path.resolve(process.cwd(), '.env')
  : path.resolve(process.cwd(), '../.env');
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Please ensure your .env file exists and contains DATABASE_URL.");
}

const BROWSER_OPTIONS = {
  headless: true,
};

const CONTEXT_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
};

// Map Nifty rent string (e.g. "12.5") to integer JPY (e.g. 125000)
function parseRent(rentStr: string): number {
  if (!rentStr || rentStr === '-') return 0;
  const num = parseFloat(rentStr);
  return isNaN(num) ? 0 : Math.round(num * 10000);
}

// Map Nifty floor area string (e.g. "33.4") to decimal
function parseSize(sizeStr: string): number {
  if (!sizeStr || sizeStr === '-') return 0;
  const num = parseFloat(sizeStr);
  return isNaN(num) ? 0 : num;
}

// Map Nifty age string (e.g. "新築", "築10年", "1年4ヶ月") to integer
function parseAge(ageStr: string): number {
  if (!ageStr || ageStr === '-' || ageStr === '新築') return 0;
  // 「築」があってもなくても、数字の後に「年」が続くパターンにマッチさせます
  const match = ageStr.match(/(?:築)?(\d+)年/);
  return match ? parseInt(match[1], 10) : 0;
}

async function saveToDatabase(prisma: PrismaClient, properties: any[]) {
  let savedCount = 0;
  for (const prop of properties) {
    if (!prop.url) continue;

    // Nifty URLs might be relative, ensure absolute
    const absoluteUrl = prop.url.startsWith('http') ? prop.url : `https://myhome.nifty.com${prop.url}`;

    let retries = 3;
    let success = false;
    let lastError: any = null;

    while (!success && retries > 0) {
      try {
        await prisma.rental_properties.upsert({
          where: { url: absoluteUrl },
          update: {
            last_seen_at: new Date(),
            rent: parseRent(prop.rent),
          },
          create: {
            property_name: prop.title || 'Unknown',
            url: absoluteUrl,
            address: prop.address || '',
            rent: parseRent(prop.rent),
            layout: prop.layout || '',
            size_sqm: parseSize(prop.floorArea),
            building_age: parseAge(prop.buildAge),
            floor: prop.floor || '',
            is_new_build: prop.buildAge === '新築',
            source_scraper: 'nifty_playwright',
            first_seen_at: new Date(),
            last_seen_at: new Date(),
          }
        });
        savedCount++;
        success = true;
      } catch (e: any) {
        lastError = e;
        if (e.code === 'P2037' || (e.message && e.message.includes('too many clients'))) {
          console.warn(`⏳ Connection limit reached for ${absoluteUrl}. Retrying in 3s... (${retries} attempts left)`);
          await new Promise(res => setTimeout(res, 3000));
          retries--;
        } else {
          console.error(`Failed to save ${absoluteUrl}:`, e.message || e);
          break;
        }
      }
    }

    if (!success && lastError && (lastError.code === 'P2037' || (lastError.message && lastError.message.includes('too many clients')))) {
      console.error(`❌ Failed to save ${absoluteUrl} after all retries due to connection limits.`);
    }

    // Add a slight delay to yield the database connection back to the pool
    await new Promise(res => setTimeout(res, 50));
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

async function scrapeArea(browser: any, prisma: PrismaClient, prefAlpha: string, cityAlpha: string, startPage: number = 1) {
  let currentPage = startPage;
  const allProperties: any[] = [];
  const seenIds = new Set<string>();

  let context = await browser.newContext(CONTEXT_OPTIONS);
  let page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    while (true) {
      // メモリ対策: 10ページ進むごとにタブを作り直してメモリを解放（Page crashed対策）
      if (currentPage > startPage && currentPage % 10 === 0) {
        console.log('🔄 Recreating browser page to prevent memory leak...');
        await page.close();
        await context.close();
        context = await browser.newContext(CONTEXT_OPTIONS);
        page = await context.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
      }

    const url = currentPage === 1
      ? `https://myhome.nifty.com/rent/${prefAlpha}/${cityAlpha}_ct/`
      : `https://myhome.nifty.com/rent/${prefAlpha}/${cityAlpha}_ct/${currentPage}/`;
    console.log(`Navigating to ${url}`);

    // ここでステートを保存（途中で落ちてもこのページから再開できるようにする）
    saveState(prefAlpha, cityAlpha, currentPage);

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const isConditionPage = await page.$('.btn-search-submit');
    if (isConditionPage) {
      console.log('Condition page detected, clicking search...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        page.click('.btn-search-submit')
      ]);
    }

    // Wait a little bit for the JS object to be populated
    await new Promise(res => setTimeout(res, 1000));

    const props = await extractPropertiesFromPage(page);
    console.log(`Found ${props.length} properties on page ${currentPage}.`);

    if (props.length === 0) {
      console.log('No more properties found. Pagination complete.');
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
      console.log('No new properties found on this page. Stopping to prevent infinite loop.');
      break;
    }

    // ==========================================
    // Save to database
    // ==========================================
    await saveToDatabase(prisma, props);

    // [重要: サーバーに負荷をかけないためのマナー（Polite Scraping）]
    // 相手サーバーへの負荷を考慮しつつ、待機時間を少し短縮（2〜4秒）
    const delayMs = 2000 + Math.floor(Math.random() * 2000);
    console.log(`Polite delay: Waiting for ${Math.round(delayMs / 1000)} seconds...`);
    await new Promise(res => setTimeout(res, delayMs));

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

async function fetchCitiesForPrefecture(page: Page, prefAlpha: string): Promise<string[]> {
  const url = `https://myhome.nifty.com/rent/${prefAlpha}/`;
  console.log(`Fetching city list for prefecture: ${prefAlpha}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Extract all links that end with _ct/
  const links = await page.$$eval('a', anchors =>
    anchors.map(a => a.href)
      .filter(h => h.includes('_ct/') && !h.includes('detail_'))
  );

  const uniqueUrls = Array.from(new Set(links));
  const cities = uniqueUrls.map(u => {
    const match = u.match(/\/rent\/[^\/]+\/([a-z0-9]+)_ct\//);
    return match ? match[1] : null;
  }).filter(Boolean) as string[];

  console.log(`Found ${cities.length} cities in ${prefAlpha}.`);
  return Array.from(new Set(cities));
}

const PREFECTURES = [
  'hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima',
  'ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'tokyo', 'kanagawa',
  'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu',
  'shizuoka', 'aichi', 'mie', 'shiga', 'kyoto', 'osaka', 'hyogo', 'nara', 'wakayama',
  'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi',
  'tokushima', 'kagawa', 'ehime', 'kochi',
  'fukuoka', 'saga', 'nagasaki', 'kumamoto', 'oita', 'miyazaki', 'kagoshima', 'okinawa'
];

const STATE_FILE = path.join(__dirname, 'scraper_state.json');

function loadState(): { pref: string | null, city: string | null, page: number } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return { pref: parsed.pref || null, city: parsed.city || null, page: parsed.page || 1 };
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
  let dbHost = 'unknown';
  if (connectionString) {
    try {
      dbHost = new URL(connectionString.replace('postgresql://', 'http://')).host;
    } catch (_) {
      dbHost = 'configured-host';
    }
  }
  console.log(`Connecting to database at ${dbHost}...`);
  const pool = new Pool({ connectionString, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const browser = await chromium.launch(BROWSER_OPTIONS);

  try {
    // ターゲット都道府県（愛知のみ）
    const targetPrefectures = ['aichi'];

    // 進行状況の読み込み
    const state = loadState();
    let skipPref = !!state.pref;
    let skipCity = !!state.city;

    if (state.pref || state.city || state.page > 1) {
      console.log(`\n======================================================`);
      console.log(`🔄 RESUMING FROM SAVED STATE: ${state.pref} - ${state.city} (Page ${state.page})`);
      console.log(`======================================================\n`);
    }

    for (const pref of targetPrefectures) {
      if (skipPref && pref !== state.pref) {
        console.log(`Skipping prefecture: ${pref}`);
        continue;
      }
      skipPref = false; // 目的の県に到達したので、これ以降の県はスキップしない

      // 都道府県の都市一覧を取得するためにページを作成
      let context = await browser.newContext(CONTEXT_OPTIONS);
      let page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const cities = await fetchCitiesForPrefecture(page, pref);
      
      // 用が済んだら一度閉じてメモリを解放する
      await page.close();
      await context.close();

      // ランダムに待機して負荷分散
      await new Promise(res => setTimeout(res, 1500 + Math.random() * 1500));

      for (const city of cities) {
        if (skipCity && city !== state.city) {
          console.log(`Skipping city: ${city}`);
          continue;
        }
        skipCity = false; // 目的の市に到達したので、これ以降の市はスキップしない

        console.log(`\n======================================================`);
        console.log(` Starting extraction for ${pref} - ${city}`);
        console.log(`======================================================\n`);

        try {
          // 目的の市に到達したばかりなら保存されているページ数から、それ以降は1ページ目から開始
          const startPage = (pref === state.pref && city === state.city) ? state.page : 1;
          await scrapeArea(browser, prisma, pref, city, startPage);
        } catch (error: any) {
          console.error(`Error during extraction for ${city}:`, error.message);
          // 万が一クラッシュしてもスクリプト全体が止まらないようにし、少し待機して休ませる
          await new Promise(res => setTimeout(res, 10000));
        }
      }
    }

    console.log('✅ Nationwide scraping completed successfully!');
    // 完了したらステートファイルを削除して次回は最初から走るようにする
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
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
