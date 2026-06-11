import { chromium, Page } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PREFECTURES = [
  "hokkaido",
  "aomori",
  "iwate",
  "miyagi",
  "akita",
  "yamagata",
  "fukushima",
  "ibaraki",
  "tochigi",
  "gunma",
  "saitama",
  "chiba",
  "tokyo",
  "kanagawa",
  "niigata",
  "toyama",
  "ishikawa",
  "fukui",
  "yamanashi",
  "nagano",
  "gifu",
  "shizuoka",
  "aichi",
  "mie",
  "shiga",
  "kyoto",
  "osaka",
  "hyogo",
  "nara",
  "wakayama",
  "tottori",
  "shimane",
  "okayama",
  "hiroshima",
  "yamaguchi",
  "tokushima",
  "kagawa",
  "ehime",
  "kochi",
  "fukuoka",
  "saga",
  "nagasaki",
  "kumamoto",
  "oita",
  "miyazaki",
  "kagoshima",
  "okinawa",
];

async function scrapePrefecture(page: Page, pref: string) {
  const url = `https://myhome.nifty.com/rent/${pref}/`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // TODO: Add logic to extract listings and paginate
  console.log(`Navigated to ${pref}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const pref of PREFECTURES) {
    try {
      await scrapePrefecture(page, pref);
    } catch (error) {
      console.error(`Error scraping ${pref}:`, error);
    }
    // Add sleep to avoid rate limiting
    await new Promise((res) => setTimeout(res, 2000));
  }

  await browser.close();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
