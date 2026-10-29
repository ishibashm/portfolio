import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { readRentalBrowser } from "@/lib/niftyRentalBrowser";
const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: async () => "/chromium" },
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
function page() {
  const p = Object.assign(new EventEmitter(), {
    setUserAgent: vi.fn(),
    setRequestInterception: vi.fn(),
    goto: vi.fn().mockResolvedValue({ ok: () => true }),
    close: vi.fn().mockResolvedValue(undefined),
    mainFrame: () => "main",
  });
  const browser = {
    newPage: vi.fn().mockResolvedValue(p),
    close: vi.fn().mockResolvedValue(undefined),
  };
  mocks.launch.mockResolvedValueOnce(browser);
  return { p, browser };
}
const url = "https://myhome.nifty.com/rent/aichi/nagoyashinakaku_ct/";
it.each([
  "Navigating frame was detached",
  "Protocol error: Target closed",
  "crash",
])("recovers %s with a fresh page and browser", async (message) => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
  const first = page(),
    second = page();
  if (message === "crash")
    first.p.goto.mockImplementation(async () => {
      first.p.emit("error", new Error("renderer crashed"));
      return new Promise(() => {});
    });
  else first.p.goto.mockRejectedValue(new Error(message));
  const pause = vi.fn(async () => {});
  expect(await readRentalBrowser(url, async () => "data", pause)).toBe("data");
  expect(first.p.close).toHaveBeenCalledOnce();
  expect(first.browser.close).toHaveBeenCalledOnce();
  expect(second.p.goto).toHaveBeenCalledWith(url, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });
  expect(pause).toHaveBeenCalledOnce();
});
it("stops after one retry and cleans up both attempts", async () => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
  const first = page(),
    second = page();
  for (const item of [first, second])
    item.p.goto.mockRejectedValue(new Error("Target closed"));
  await expect(
    readRentalBrowser(
      url,
      async () => [],
      async () => {},
    ),
  ).rejects.toThrow("Target closed");
  expect(mocks.launch).toHaveBeenCalledTimes(2);
  expect(second.browser.close).toHaveBeenCalledOnce();
});
it("does not retry unrelated errors", async () => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
  page().p.goto.mockRejectedValue(new Error("timeout"));
  await expect(
    readRentalBrowser(
      url,
      async () => [],
      async () => {},
    ),
  ).rejects.toThrow("timeout");
  expect(mocks.launch).toHaveBeenCalledOnce();
});
it("blocks images, fonts, media and third-party frames while allowing first-party scripts", async () => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
  const { p } = page();
  await readRentalBrowser(
    url,
    async () => {
      for (const type of ["image", "font", "media", "script"]) {
        const request = {
          url: () => url,
          resourceType: () => type,
          isNavigationRequest: () => false,
          continue: vi.fn().mockResolvedValue(undefined),
          abort: vi.fn().mockResolvedValue(undefined),
        };
        p.emit("request", request);
        expect(
          type === "script" ? request.continue : request.abort,
        ).toHaveBeenCalledOnce();
      }
      const request = {
        url: () => "https://ads.example/frame",
        resourceType: () => "document",
        isNavigationRequest: () => true,
        frame: () => "child",
        abort: vi.fn().mockRejectedValue(new Error("Target closed")),
      };
      p.emit("request", request);
      expect(request.abort).toHaveBeenCalledOnce();
    },
    async () => {},
  );
});
