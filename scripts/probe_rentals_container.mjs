/* Read-only HTTPS probe for the production runner; see docs/rentals-navigation-repro.md. */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const req = createRequire("/app/server.js");
const origin = "https://myhome.nifty.com";
const city = `${origin}/rent/aichi/nagoyashinakaku_ct/`;
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const pause = () => new Promise((resolve) => setTimeout(resolve, 20000));
function memory() {
  return Object.fromEntries(
    ["memory.max", "cpu.max", "memory.peak", "memory.events"].map((name) => [
      name,
      readFileSync(`/sys/fs/cgroup/${name}`, "utf8").trim(),
    ]),
  );
}
async function main() {
  if (process.argv[2] === "fetch") {
    // Bundle the actual production parser using the command in the reproduction note.
    const { rentalCityLinks, rentalPropertiesFromHtml } = req(
      "/tmp/rentals-html.cjs",
    );
    async function html(url) {
      const r = await fetch(url, {
        headers: { "User-Agent": userAgent },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }
    const index = `${origin}/rent/aichi/city/`;
    const links = rentalCityLinks(await html(index), index).filter(
      (a) => a.text === "名古屋市中区",
    );
    if (!links.some((a) => a.href === city))
      throw new Error("city link unavailable");
    await pause();
    const data = rentalPropertiesFromHtml(await html(city));
    if (!data?.length) throw new Error("listing data unavailable");
    console.log({
      city,
      listings: data.length,
      areaListings: data.filter((p) =>
        p.address?.startsWith("愛知県名古屋市中区"),
      ).length,
      ...memory(),
    });
    return;
  }
  const chromium = req("@sparticuz/chromium");
  const puppeteer = req("puppeteer-core");
  const browser = await puppeteer.launch({
    args: [
      ...chromium.args.filter((a) => a !== "--single-process"),
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    executablePath: await chromium.executablePath(),
    headless: "shell",
    dumpio: true,
  });
  browser.on("disconnected", () => console.log("browser disconnected"));
  try {
    for (const url of [`${origin}/rent/aichi/`, city]) {
      const page = await browser.newPage();
      page.on("error", (e) => console.error("page crash", e.message));
      page.on("framedetached", (f) => console.log("frame detached", f.url()));
      await page.setUserAgent(userAgent);
      await page.setRequestInterception(true);
      // Deliberately reproduce the original interception policy for before/after comparison.
      page.on("request", (r) => {
        void (
          r.isNavigationRequest() &&
          r.frame() === page.mainFrame() &&
          r.url() === url
            ? r.continue()
            : r.abort()
        ).catch(() => {});
      });
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        console.log({
          url,
          status: response.status(),
          listings: await page.evaluate(
            () => Object.keys(window.Nifty?.Data?.Bukken || {}).length,
          ),
          ...memory(),
        });
      } finally {
        await page.close().catch(() => {});
      }
      await pause();
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
