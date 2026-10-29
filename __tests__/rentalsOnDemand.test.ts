import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AREA_TTL_MS,
  createRentalRefresher,
  fetchRentalPages,
  type RentalRefreshDependencies,
} from "@/lib/rentalsOnDemand";
import { createFixtureRentalReader, searchRentals } from "@/lib/mcpRentals";
import { rentalRows } from "@/lib/niftyRentalData";

const production = vi.hoisted(() => ({
  fetchArea: vi.fn(async () => {}),
  last: vi.fn(async (): Promise<{ updated_at: Date } | null> => null),
  mark: vi.fn(async () => {}),
}));
vi.mock("@/lib/prisma", () => ({
  default: {
    scraper_state: { findUnique: production.last, upsert: production.mark },
  },
}));
vi.mock("@/lib/niftyRentalFetch", () => ({
  fetchNiftyRentalArea: production.fetchArea,
}));

function dependencies(): RentalRefreshDependencies {
  return {
    lastFetched: vi.fn(async () => null),
    markFetched: vi.fn(async () => {}),
    fetchArea: vi.fn(async () => {}),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  production.last.mockResolvedValue(null);
  production.fetchArea.mockResolvedValue(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("賃貸のオンデマンド取得", () => {
  it("検索のキャッシュ命中は取得せず、失敗しても検索結果と理由を返す", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "true");
    production.last.mockResolvedValue({ updated_at: new Date() });
    const reader = createFixtureRentalReader([]);
    const search = vi.spyOn(reader, "search");
    const input = { prefecture: "東京都", municipality: "港区" };
    expect((await searchRentals(input, reader)).onDemand).toBe("cache_hit");
    expect(production.fetchArea).not.toHaveBeenCalled();
    production.last.mockResolvedValue(null);
    production.fetchArea.mockRejectedValueOnce(new Error("private-db-secret"));
    const result = await searchRentals(input, reader);
    expect(result.onDemand).toBe("fetch_failed");
    expect(result.reason).toContain("保存済み");
    expect(JSON.stringify(result)).not.toContain("private-db-secret");
    expect(search).toHaveBeenCalledTimes(2);
    expect(production.mark).not.toHaveBeenCalled();
  });

  it.each([undefined, "0", "false", "TRUE", "yes"])(
    "スイッチ %s は外部取得もキャッシュ接続もしない",
    async (flag) => {
      vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", flag);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const deps = dependencies();
      expect(await createRentalRefresher(deps)("東京都", "港区")).toEqual({
        status: "disabled",
        scrapingStarted: false,
      });
      const result = await searchRentals(
        { prefecture: "13", municipality: "港区" },
        createFixtureRentalReader([]),
      );
      expect(result.reason).toContain("オンデマンド取得は無効");
      expect(result.reason).toContain("30日以上");
      expect(fetch).not.toHaveBeenCalled();
      expect(production.fetchArea).not.toHaveBeenCalled();
      expect(production.last).not.toHaveBeenCalled();
      expect(deps.lastFetched).not.toHaveBeenCalled();
      expect(deps.fetchArea).not.toHaveBeenCalled();
    },
  );

  it.each(["1", "true"])(
    "%s: 24時間以内のキャッシュは取得しない",
    async (flag) => {
      vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", flag);
      const deps = dependencies();
      deps.lastFetched = vi.fn(
        async () => new Date(Date.now() - AREA_TTL_MS + 10000),
      );
      expect((await createRentalRefresher(deps)("東京都", "港区")).status).toBe(
        "cache_hit",
      );
      expect(deps.fetchArea).not.toHaveBeenCalled();
      expect(deps.markFetched).not.toHaveBeenCalled();
    },
  );

  it("TTL切れを取得し、同じ地域の同時要求は1回に合流する", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
    const deps = dependencies();
    deps.lastFetched = vi.fn(async () => new Date(Date.now() - AREA_TTL_MS));
    const refresh = createRentalRefresher(deps);
    const result = await Promise.all([
      refresh("東京都", "港区"),
      refresh(null, "港区"),
    ]);
    expect(result.map((r) => r.status)).toEqual(["fetched", "fetched"]);
    expect(deps.fetchArea).toHaveBeenCalledTimes(1);
    expect(deps.markFetched).toHaveBeenCalledTimes(1);
  });

  it("失敗時はキャッシュを更新せずロックを解放する", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "true");
    const deps = dependencies();
    const error = new Error("Chromium launch failed: libnspr4.so missing");
    Object.assign(error, { privateContext: "must-not-log" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deps.fetchArea = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const refresh = createRentalRefresher(deps);
    expect(await refresh("東京都", "港区")).toEqual({
      status: "fetch_failed",
      scrapingStarted: true,
    });
    expect(deps.markFetched).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[rentalsOnDemand] fetch failed",
      { message: error.message, stack: error.stack },
    );
    expect((await refresh("東京都", "港区")).status).toBe("fetched");
  });

  it("Error 以外の例外は内容をログに展開しない", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "true");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = dependencies();
    deps.fetchArea = vi.fn().mockRejectedValue({ secret: "must-not-log" });
    expect((await createRentalRefresher(deps)("東京都", "港区")).status).toBe(
      "fetch_failed",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[rentalsOnDemand] fetch failed",
      { message: "Unknown error", stack: undefined },
    );
  });

  it("曖昧な地域や未指定は取得しない", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
    const deps = dependencies();
    const refresh = createRentalRefresher(deps);
    expect((await refresh(null, "府中市")).status).toBe(
      "area_unknown_or_ambiguous",
    );
    expect((await refresh("東京都", null)).status).toBe(
      "municipality_required",
    );
    expect(deps.fetchArea).not.toHaveBeenCalled();
  });

  it("ページ取得・保存・20秒待機が直列で重ならず上限で止まる", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
    vi.useFakeTimers();
    const events: string[] = [];
    let active = 0;
    const run = fetchRentalPages(
      {
        async page(n) {
          expect(active++).toBe(0);
          events.push(`page${n}`);
          await new Promise((r) => setTimeout(r, 10));
          active--;
          return rentalRows([
            {
              id: String(n),
              url: `/rent/detail_${n}/`,
              address: "東京都港区芝",
            },
          ]);
        },
        async save() {
          expect(active++).toBe(0);
          events.push("save");
          await new Promise((r) => setTimeout(r, 10));
          active--;
        },
        async sleep(ms) {
          expect(active++).toBe(0);
          expect(ms).toBe(20000);
          events.push("sleep");
          await new Promise((r) => setTimeout(r, ms));
          active--;
        },
      },
      2,
      3000,
    );
    await vi.advanceTimersByTimeAsync(20019);
    expect(events).toEqual(["page1", "save", "sleep"]);
    await vi.runAllTimersAsync();
    await run;
    expect(events).toEqual([
      "page1",
      "save",
      "sleep",
      "page2",
      "save",
      "sleep",
    ]);
  });

  it("別地域も同時に取得しない", async () => {
    vi.stubEnv("RENTALS_ON_DEMAND_ENABLED", "1");
    vi.useFakeTimers();
    const deps = dependencies();
    let active = 0;
    deps.fetchArea = vi.fn(async () => {
      expect(active++).toBe(0);
      await new Promise((r) => setTimeout(r, 100));
      active--;
    });
    const refresh = createRentalRefresher(deps);
    const run = Promise.all([
      refresh("東京都", "港区"),
      refresh("東京都", "新宿区"),
    ]);
    await vi.runAllTimersAsync();
    await run;
    expect(deps.fetchArea).toHaveBeenCalledTimes(2);
  });
});
