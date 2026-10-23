/** 公開 MCP 専用。既定 OFF。有料 API は使用しない。 */
import { MUNICIPALITY_POINTS } from "./municipalityCoords";
import { MIN_PAGE_INTERVAL_MS } from "./niftyPolite";
import type { RentalUpsertRow } from "./rentalUpsert";

export const AREA_TTL_MS = 24 * 60 * 60 * 1000;
export const rentalsOnDemandEnabled = () =>
  ["1", "true"].includes(process.env.RENTALS_ON_DEMAND_ENABLED ?? "");

export type RentalArea = { prefecture: string; municipality: string };
export type RefreshResult = { status: string; scrapingStarted: boolean };
export interface RentalRefreshDependencies {
  lastFetched(area: RentalArea): Promise<Date | null>;
  markFetched(area: RentalArea, at: Date): Promise<void>;
  fetchArea(area: RentalArea): Promise<void>;
}

function resolveArea(
  prefecture: string | null,
  municipality: string,
): RentalArea | null {
  const matches = MUNICIPALITY_POINTS.filter(
    (p) => p.city === municipality && (!prefecture || p.pref === prefecture),
  );
  if (matches.length !== 1) return null;
  return { prefecture: matches[0].pref, municipality: matches[0].city };
}

/** 同じ地域の同時要求を合流。別地域も直列化してホストへの並列要求を防ぐ。 */
export function createRentalRefresher(deps: RentalRefreshDependencies) {
  const pending = new Map<string, Promise<RefreshResult>>();
  let queue: Promise<unknown> = Promise.resolve();
  return async (
    prefecture: string | null,
    municipality: string | null,
  ): Promise<RefreshResult> => {
    if (!rentalsOnDemandEnabled())
      return { status: "disabled", scrapingStarted: false };
    if (!municipality)
      return { status: "municipality_required", scrapingStarted: false };
    const area = resolveArea(prefecture, municipality);
    if (!area)
      return { status: "area_unknown_or_ambiguous", scrapingStarted: false };
    const key = JSON.stringify(area);
    const existing = pending.get(key);
    if (existing) return existing;
    const work = queue.then(async (): Promise<RefreshResult> => {
      let scrapingStarted = false;
      try {
        if (!rentalsOnDemandEnabled())
          return { status: "disabled", scrapingStarted };
        const last = await deps.lastFetched(area);
        const age = last ? Date.now() - last.getTime() : Infinity;
        if (age >= 0 && age < AREA_TTL_MS)
          return { status: "cache_hit", scrapingStarted };
        scrapingStarted = true;
        await deps.fetchArea(area);
        await deps.markFetched(area, new Date());
        return { status: "fetched", scrapingStarted };
      } catch {
        return { status: "fetch_failed", scrapingStarted };
      }
    });
    pending.set(key, work);
    queue = work;
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  };
}

export function boundedSetting(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(raw);
  return raw && Number.isFinite(n)
    ? Math.max(min, Math.min(max, Math.floor(n)))
    : fallback;
}

/** 各ページの保存完了後に待つ。空・重複ページでも最後に待ち、次地域を連打しない。 */
export async function fetchRentalPages(
  deps: {
    page(n: number): Promise<RentalUpsertRow[]>;
    save(rows: RentalUpsertRow[]): Promise<void>;
    sleep(ms: number): Promise<void>;
  },
  maxPages = 3,
  delayMs = MIN_PAGE_INTERVAL_MS,
) {
  const seen = new Set<string>();
  const cap = boundedSetting(String(maxPages), 3, 1, 5);
  const delay = boundedSetting(
    String(delayMs),
    MIN_PAGE_INTERVAL_MS,
    MIN_PAGE_INTERVAL_MS,
    60000,
  );
  for (let n = 1; n <= cap; n++) {
    if (!rentalsOnDemandEnabled()) throw new Error("disabled");
    try {
      const rows = (await deps.page(n)).filter((row) => !seen.has(row.url));
      if (!rows.length) break;
      await deps.save(rows);
      for (const row of rows) seen.add(row.url);
    } finally {
      await deps.sleep(delay);
    }
  }
}

const cacheKey = (area: RentalArea) =>
  `mcp-rentals:v1:${area.prefecture}:${area.municipality}`;
export const refreshRentalsOnDemand = createRentalRefresher({
  async lastFetched(area) {
    const { default: db } = await import("./prisma");
    const row = await db.scraper_state.findUnique({
      where: { key: cacheKey(area) },
    });
    return row?.updated_at ?? null;
  },
  async markFetched(area, at) {
    const { default: db } = await import("./prisma");
    await db.scraper_state.upsert({
      where: { key: cacheKey(area) },
      create: {
        key: cacheKey(area),
        state: { lastFetchedAt: at.toISOString() },
        updated_at: at,
      },
      update: { state: { lastFetchedAt: at.toISOString() }, updated_at: at },
    });
  },
  async fetchArea(area) {
    const { fetchNiftyRentalArea } = await import("./niftyRentalFetch");
    await fetchNiftyRentalArea(area);
  },
});
