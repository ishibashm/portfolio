import type { Page } from "puppeteer-core";
import { chromiumLaunchArgs } from "./chromiumLaunchArgs";
import { NIFTY_CONTEXT_OPTIONS } from "./niftyPolite";
import { rentalsOnDemandEnabled } from "./rentalsOnDemand";

/** Puppeteer's `error` event represents a renderer crash (not `pageerror`). */
export async function readRentalBrowser<T>(
  url: string,
  read: (page: Page) => Promise<T>,
  pause: () => Promise<void>,
): Promise<T> {
  const { default: puppeteer } = await import("puppeteer-core");
  const { default: chromium } = await import("@sparticuz/chromium");
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!rentalsOnDemandEnabled()) throw new Error("disabled");
    const browser = await puppeteer.launch({
      args: chromiumLaunchArgs(chromium.args),
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
    let page: Page | undefined;
    let crashed: ((error: Error) => void) | undefined;
    try {
      page = await browser.newPage();
      const current = page;
      const failure = new Promise<never>((_, reject) => {
        crashed = (error) =>
          reject(new Error(`page crashed: ${error.message}`));
        current.on("error", crashed);
      });
      // Install the rejection handler before any asynchronous setup can fail.
      return await Promise.race([
        failure,
        (async () => {
          await current.setUserAgent(NIFTY_CONTEXT_OPTIONS.userAgent);
          await current.setRequestInterception(true);
          current.on("request", (request) => {
            const sameOrigin =
              new URL(request.url()).origin === new URL(url).origin;
            const allowed =
              sameOrigin &&
              !["image", "font", "media"].includes(request.resourceType()) &&
              (!request.isNavigationRequest() ||
                request.frame() === current.mainFrame());
            // The target can close between dispatch and interception resolution.
            void (allowed ? request.continue() : request.abort()).catch(
              () => {},
            );
          });
          const response = await current.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          if (!response?.ok()) throw new Error("page unavailable");
          return read(current);
        })(),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        attempt === 1 ||
        !/frame.*detached|target closed|session closed|connection closed|page crashed/i.test(
          message,
        )
      )
        throw error;
      console.warn("[rentalsOnDemand] retrying browser navigation", {
        attempt: attempt + 1,
        message,
      });
    } finally {
      if (page && crashed) page.off("error", crashed);
      await page?.close().catch(() => {});
      await browser.close().catch(() => {});
    }
    await pause();
  }
  throw new Error("browser retries exhausted");
}
