import { SCRAPE_TARGETS } from "./scrapeTargets";
import { NIFTY_CONTEXT_OPTIONS, MIN_PAGE_INTERVAL_MS } from "./niftyPolite";
import { rentalRows, type NiftyWindow } from "./niftyRentalData";
import { buildRentalUpsert } from "./rentalUpsert";
import { chromiumLaunchArgs } from "./chromiumLaunchArgs";
import {
  boundedSetting,
  fetchRentalPages,
  rentalsOnDemandEnabled,
  type RentalArea,
} from "./rentalsOnDemand";

/** 動的 import の先でだけブラウザーを起動。索引1ページ＋対象市区町村だけ。 */
export async function fetchNiftyRentalArea(area: RentalArea): Promise<void> {
  if (!rentalsOnDemandEnabled()) throw new Error("disabled");
  const pref = SCRAPE_TARGETS.find((p) => p.name === area.prefecture);
  if (!pref) throw new Error("unknown prefecture");
  const { default: puppeteer } = await import("puppeteer-core");
  const { default: chromium } = await import("@sparticuz/chromium");
  const browser = await puppeteer.launch({
    args: chromiumLaunchArgs(chromium.args),
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const delay = boundedSetting(
    process.env.RENTALS_ON_DEMAND_DELAY_MS,
    MIN_PAGE_INTERVAL_MS,
    MIN_PAGE_INTERVAL_MS,
    60000,
  );
  try {
    const page = await browser.newPage();
    await page.setUserAgent(NIFTY_CONTEXT_OPTIONS.userAgent);
    // インラインの Nifty.Data を読む。画像・広告・外部スクリプト・別地域への転送は取得しない。
    let allowedUrl = `https://myhome.nifty.com/rent/${pref.slug}/`;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame() &&
        request.url() === allowedUrl
      ) {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    async function navigate(url: string) {
      if (!rentalsOnDemandEnabled()) throw new Error("disabled");
      allowedUrl = url;
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      if (!response?.ok()) throw new Error("page unavailable");
    }
    let links: { href: string; text: string }[];
    try {
      await navigate(allowedUrl);
      links = await page.$$eval("a", (anchors) =>
        anchors.map((a) => ({
          href: a.href,
          text: a.textContent?.trim() ?? "",
        })),
      );
    } finally {
      await sleep(delay);
    }
    const cityUrls = [
      ...new Set(
        links
          .filter(
            (link) =>
              link.text.replace(/\s*[（(][\d,]+(?:件)?[）)]\s*$/, "") ===
              area.municipality,
          )
          .map((link) => link.href)
          .filter((href) =>
            new RegExp(
              `^https://myhome\\.nifty\\.com/rent/${pref.slug}/[a-z0-9]+_ct/$`,
            ).test(href),
          ),
      ),
    ];
    if (cityUrls.length !== 1) throw new Error("city link unavailable");
    const base = cityUrls[0];
    await fetchRentalPages(
      {
        async page(n) {
          await navigate(n === 1 ? base : `${base}${n}/`);
          const properties = await page.evaluate(() => {
            const data = (window as NiftyWindow).Nifty?.Data?.Bukken;
            if (!data || typeof data !== "object")
              throw new Error("listing data unavailable");
            return Object.values(data);
          });
          return rentalRows(properties).filter((row) =>
            row.address.startsWith(area.prefecture + area.municipality),
          );
        },
        async save(rows) {
          const { default: db } = await import("./prisma");
          for (let i = 0; i < rows.length; i += 25) {
            const statement = buildRentalUpsert(
              rows.slice(i, i + 25),
              new Date(),
            );
            if (statement)
              await db.$executeRawUnsafe(statement.sql, ...statement.params);
          }
        },
        sleep,
      },
      boundedSetting(process.env.RENTALS_ON_DEMAND_MAX_PAGES, 3, 1, 5),
      delay,
    );
  } finally {
    await browser.close();
  }
}
