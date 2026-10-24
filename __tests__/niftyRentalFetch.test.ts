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
  vi.useRealTimers();
  vi.clearAllMocks();
});

function install() {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "true");
  vi.stubEnv("RENTALS_ON_DEMAND_MAX_PAGES", "1");
  vi.useFakeTimers();
  mocks.launch.mockResolvedValue({
    newPage: async () => ({
      setUserAgent: async () => {},
      setRequestInterception: async () => {},
      on: () => {},
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
    "https://myhome.nifty.com/rent/tokyo/",
    "https://myhome.nifty.com/rent/tokyo/minatoku_ct/",
  ]);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const args = mocks.save.mock.calls[0] as unknown[];
  expect(args[0]).toContain("ON CONFLICT (url) DO UPDATE");
  expect(args).toContain(105000);
  expect(mocks.close).toHaveBeenCalledOnce();
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
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("無効ならブラウザー自体を起動しない", async () => {
  vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "0");
  await expect(
    fetchNiftyRentalArea({ prefecture: "東京都", municipality: "港区" }),
  ).rejects.toThrow("disabled");
  expect(mocks.launch).not.toHaveBeenCalled();
});
