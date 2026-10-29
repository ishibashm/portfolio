import { SCRAPE_TARGETS } from "./scrapeTargets";
import { NIFTY_CONTEXT_OPTIONS, MIN_PAGE_INTERVAL_MS } from "./niftyPolite";
import { rentalRows, type NiftyWindow } from "./niftyRentalData";
import { buildRentalUpsert } from "./rentalUpsert";
import { readRentalBrowser } from "./niftyRentalBrowser";
import { rentalCityLinks, rentalPropertiesFromHtml } from "./niftyRentalHtml";
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
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  const delay = boundedSetting(
    process.env.RENTALS_ON_DEMAND_DELAY_MS,
    MIN_PAGE_INTERVAL_MS,
    MIN_PAGE_INTERVAL_MS,
    60000,
  );
  async function html(url: string): Promise<string | null> {
    if (!rentalsOnDemandEnabled()) throw new Error("disabled");
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": NIFTY_CONTEXT_OPTIONS.userAgent },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      // Do not retry explicit rate limits or access denials through a browser.
      if (!response.ok) throw new Error(`rental HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("rental HTTP"))
        throw error;
      return null;
    }
  }
  const pause = () => sleep(delay);
  // /city/ renders all municipalities; the prefecture landing page loads them via JS.
  const index = `https://myhome.nifty.com/rent/${pref.slug}/city/`;
  function matchingLinks(links: { href: string; text: string }[]) {
    return links.filter(
      (link) =>
        link.text.replace(/\s*[（(][\d,]+(?:件)?[）)]\s*$/, "") ===
        area.municipality,
    );
  }
  let links: { href: string; text: string }[];
  try {
    const source = await html(index);
    links = source === null ? [] : rentalCityLinks(source, index);
    if (!matchingLinks(links).length) {
      await pause();
      links = await readRentalBrowser(
        index,
        async (page) => {
          await page.waitForFunction(
            (name) =>
              Array.from(document.querySelectorAll("a")).some(
                (a) => a.textContent?.trim() === name,
              ),
            { timeout: 15000 },
            area.municipality,
          );
          return page.$$eval("a", (anchors) =>
            anchors.map((a) => ({
              href: a.href,
              text: a.textContent?.trim() ?? "",
            })),
          );
        },
        pause,
      );
    }
  } finally {
    await pause();
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
        const url = n === 1 ? base : `${base}${n}/`;
        const source = await html(url);
        let properties =
          source === null ? null : rentalPropertiesFromHtml(source);
        if (properties === null) {
          await pause();
          properties = await readRentalBrowser(
            url,
            async (page) => {
              await page.waitForFunction(
                () => !!(window as NiftyWindow).Nifty?.Data?.Bukken,
                { timeout: 15000 },
              );
              return page.evaluate(() => {
                const data = (window as NiftyWindow).Nifty?.Data?.Bukken;
                if (!data || typeof data !== "object")
                  throw new Error("listing data unavailable");
                return Object.values(data);
              });
            },
            pause,
          );
        }
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
}
