import { afterEach, expect, it, vi } from "vitest";
import { fetchNiftyRentalArea } from "@/lib/niftyRentalFetch";

const mocks = vi.hoisted(() => ({
  goto: vi.fn(async () => ({ ok: () => true })),
  links: vi.fn(async () => [
    {
      href: "https://myhome.nifty.com/rent/tokyo/minatoku_ct/",
      text: "港区 (100件)",
    },
    {
      href: "https://myhome.nifty.com/rent/tokyo/shinjukuku_ct/",
      text: "新宿区",
    },
  ]),
  data: vi.fn(async () => [
    { id: "1", url: "/rent/detail_1/", address: "東京都港区芝", rent: "10.5" },
  ]),
  save: vi.fn(async () => 1),
  close: vi.fn(async () => {}),
  launch: vi.fn(),
}));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));
vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--single-process", "--no-zygote"],
    executablePath: async () => "/mock-browser",
  },
}));
vi.mock("@/lib/prisma", () => ({ default: { $executeRawUnsafe: mocks.save } }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function install() {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "true");
  vi.stubEnv("RENTALS_ON_DEMAND_MAX_PAGES", "1");
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("network unavailable")),
  );
  mocks.launch.mockResolvedValue({
    newPage: async () => ({
      setUserAgent: async () => {},
      setRequestInterception: async () => {},
      on: () => {},
      off: () => {},
      close: async () => {},
      waitForFunction: async () => {},
      goto: mocks.goto,
      $$eval: mocks.links,
      evaluate: mocks.data,
    }),
    close: mocks.close,
  });
}

it("索引の該当リンクだけを開き、既存の形式でupsertしてブラウザーを閉じる", async () => {
  install();
  const run = fetchNiftyRentalArea({
    prefecture: "東京都",
    municipality: "港区",
  });
  await vi.runAllTimersAsync();
  await run;
  expect(mocks.launch).toHaveBeenCalledWith({
    args: ["--no-zygote", "--disable-dev-shm-usage", "--disable-gpu"],
    executablePath: "/mock-browser",
    headless: "shell",
  });
  expect(mocks.goto.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
    "https://myhome.nifty.com/rent/tokyo/city/",
    "https://myhome.nifty.com/rent/tokyo/minatoku_ct/",
  ]);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const args = mocks.save.mock.calls[0] as unknown[];
  expect(args[0]).toContain("ON CONFLICT (url) DO UPDATE");
  expect(args).toContain(105000);
  expect(mocks.close).toHaveBeenCalledTimes(2);
});

it("保存エラーでもブラウザーを閉じて失敗を呼び出し側へ伝える", async () => {
  install();
  mocks.save.mockRejectedValueOnce(new Error("save failed"));
  const run = fetchNiftyRentalArea({
    prefecture: "東京都",
    municipality: "港区",
  });
  const assertion = expect(run).rejects.toThrow("save failed");
  await vi.runAllTimersAsync();
  await assertion;
  expect(mocks.close).toHaveBeenCalledTimes(2);
});

it("無効ならブラウザー自体を起動しない", async () => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "0");
  await expect(
    fetchNiftyRentalArea({ prefecture: "東京都", municipality: "港区" }),
  ).rejects.toThrow("disabled");
  expect(mocks.launch).not.toHaveBeenCalled();
});

const area = { prefecture: "愛知県", municipality: "名古屋市中区" };
const indexHtml = '<a href="/rent/aichi/nagoyashinakaku_ct/">名古屋市中区</a>';
const listingHtml =
  '<script>window.Nifty.Data.Bukken = {"1":{"id":"1","url":"/rent/detail_1/","address":"愛知県名古屋市中区栄","rent":"10"},"2":{"id":"2","url":"/rent/detail_2/","address":"東京都港区"}};</script>';

it("server-rendered Nagoya data is fetched and saved without launching Chromium", async () => {
  install();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, text: async () => indexHtml })
    .mockResolvedValueOnce({ ok: true, text: async () => listingHtml });
  vi.stubGlobal("fetch", fetch);
  const run = fetchNiftyRentalArea(area);
  await vi.runAllTimersAsync();
  await run;
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    "https://myhome.nifty.com/rent/aichi/city/",
    "https://myhome.nifty.com/rent/aichi/nagoyashinakaku_ct/",
  ]);
  expect(mocks.launch).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.save.mock.calls[0]).toContain("愛知県名古屋市中区栄");
  expect(mocks.save.mock.calls[0]).not.toContain("東京都港区");
});

it("HTTP rate limits fail without browser fallback", async () => {
  install();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
  const assertion = expect(fetchNiftyRentalArea(area)).rejects.toThrow(
    "HTTP 429",
  );
  await vi.runAllTimersAsync();
  await assertion;
  expect(mocks.launch).not.toHaveBeenCalled();
});
