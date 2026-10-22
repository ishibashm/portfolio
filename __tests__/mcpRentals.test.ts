// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CHAIN_TOOLS } from "@/lib/mcpChain";
import { describeListingFreshness } from "@/lib/listingFreshness";
import { createMcpPersonalServer } from "@/lib/mcpPersonalServer";
import { createMcpServer } from "@/lib/mcpServer";
import marketStats from "@/data/marketStats.json";
import {
  bearingBetween,
  destinationAtBearing,
  directionFromBearing,
} from "@/utils/directionGeo";
import {
  FRESH_LISTING_SQL,
  RENTAL_HIDDEN_COLUMNS,
  RENTAL_SELECT_COLUMNS,
  RentalInputError,
  createFixtureRentalReader,
  createSqlRentalReader,
  getRental,
  listingIsFresh,
  rentalGetSql,
  rentalLatestSql,
  rentalMarketSql,
  rentalMarketStats,
  rentalReadOnlySql,
  rentalSearchSql,
  searchRentals,
  type RentalFilters,
  type RentalReader,
  type StoredListing,
} from "@/lib/mcpRentals";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  default: { $transaction: (...args: unknown[]) => transaction(...args) },
}));

const NOW = new Date("2026-10-22T00:00:00.000Z");
const DAY = 86_400_000;
const FRESH_SEEN = new Date("2026-10-20T00:00:00.000Z");

function id(n: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
}

function listing(n: number, patch: Partial<StoredListing> = {}): StoredListing {
  return {
    id: id(n),
    url: `https://example.test/listings/${n}`,
    address: "東京都港区芝公園",
    rent: 80000,
    managementFee: 5000,
    layout: "1LDK",
    sizeSqm: 40,
    minutesToStation: 8,
    buildingAge: 10,
    lastSeenAt: FRESH_SEEN,
    lat: 35.65,
    lon: 139.75,
    propertyName: "公開名",
    floor: "3",
    area: "港区",
    isNewBuild: false,
    expireDate: null,
    ...patch,
  };
}

const blankFilters: RentalFilters = {
  prefecture: null,
  municipality: null,
  maxRent: null,
  includeManagementFee: true,
  layout: null,
  minSizeSqm: null,
  maxWalkMinutes: null,
  maxBuildingAge: null,
};

function sqlBag(query: Prisma.Sql): { text: string; values: unknown[] } {
  const bag = query as Prisma.Sql & {
    strings?: readonly string[];
    values?: readonly unknown[];
  };
  if (!bag.strings || !bag.values) {
    throw new Error("Prisma.Sql の strings / values が読めません");
  }
  return { text: bag.strings.join(" "), values: [...bag.values] };
}

describe("掲載の鮮度", () => {
  it("30日ちょうどは外し、1ミリ秒内側と期限ちょうどは残す", () => {
    const edge = listing(1, { lastSeenAt: new Date(NOW.getTime() - 30 * DAY) });
    const inside = listing(1, {
      lastSeenAt: new Date(NOW.getTime() - 30 * DAY + 1),
    });
    expect(listingIsFresh(edge, NOW)).toBe(false);
    expect(listingIsFresh(inside, NOW)).toBe(true);
    expect(listingIsFresh(listing(1, { expireDate: NOW }), NOW)).toBe(true);
    expect(
      listingIsFresh(
        listing(1, { expireDate: new Date(NOW.getTime() - 1) }),
        NOW,
      ),
    ).toBe(false);
    expect(listingIsFresh(listing(1, { lat: null, lon: null }), NOW)).toBe(
      true,
    );
  });
});

describe("search_rentals", () => {
  it("条件・家賃順・ページを掛け、古い掲載と期限切れを落とす", async () => {
    const rows = [
      listing(1, { rent: 70000, managementFee: 20000 }),
      listing(2, { rent: 80000, managementFee: 0 }),
      listing(3, { address: "神奈川県横浜市西区" }),
      listing(4, { address: "東京都中央区日本橋" }),
      listing(5, { layout: "2DK" }),
      listing(6, { sizeSqm: 20 }),
      listing(7, { minutesToStation: 20 }),
      listing(8, { buildingAge: 40 }),
      listing(9, { lat: null, lon: null }),
      listing(10, { lastSeenAt: new Date("2026-08-01T00:00:00.000Z") }),
      listing(11, { expireDate: new Date("2026-10-01T00:00:00.000Z") }),
      listing(12, { address: "STALE-MARKER-ADDRESS" }),
    ];
    rows[11] = listing(12, {
      address: "STALE-MARKER-ADDRESS",
      lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const reader = createFixtureRentalReader(rows);
    const tokyo = await searchRentals(
      { prefecture: "東京都", municipality: "港区" },
      reader,
      NOW,
    );
    expect(tokyo.results.map((row) => row.id)).not.toContain(id(3));
    expect(tokyo.results.map((row) => row.id)).not.toContain(id(4));
    expect(
      tokyo.results.every((row) => row.address?.startsWith("東京都港区")),
    ).toBe(true);

    const wardOnly = await searchRentals({ municipality: "港区" }, reader, NOW);
    expect(wardOnly.results.map((row) => row.address)).toEqual(
      expect.arrayContaining([expect.stringContaining("港区")]),
    );

    const withFee = await searchRentals({ maxRent: 84000 }, reader, NOW);
    expect(withFee.results.map((row) => row.id)).not.toContain(id(1));
    const rentOnly = await searchRentals(
      { maxRent: 84000, includeManagementFee: false },
      reader,
      NOW,
    );
    expect(rentOnly.results.map((row) => row.id)).toContain(id(1));

    const layout = await searchRentals({ layout: "1LDK" }, reader, NOW);
    expect(layout.results.map((row) => row.id)).not.toContain(id(5));
    const size = await searchRentals({ minSizeSqm: 30 }, reader, NOW);
    expect(size.results.map((row) => row.id)).not.toContain(id(6));
    const walk = await searchRentals({ maxWalkMinutes: 10 }, reader, NOW);
    expect(walk.results.map((row) => row.id)).not.toContain(id(7));
    const age = await searchRentals({ maxBuildingAge: 15 }, reader, NOW);
    expect(age.results.map((row) => row.id)).not.toContain(id(8));

    const all = await searchRentals({}, reader, NOW);
    expect(all.results.map((row) => row.id)).toContain(id(9));
    expect(JSON.stringify(all)).not.toContain("STALE-MARKER-ADDRESS");
    expect(all.results.map((row) => row.id)).not.toContain(id(10));
    expect(all.results.map((row) => row.id)).not.toContain(id(11));
    expect(all.paidApiCalled).toBe(false);
    expect(all.scrapingStarted).toBe(false);
    expect(all.results[0]?.stationName).toBeNull();

    const byRent = await searchRentals({ sort: "rent", limit: 2 }, reader, NOW);
    expect(byRent.results.map((row) => row.totalRent).slice(0, 2)).toEqual([
      80000, 85000,
    ]);
    const recentA = listing(20, {
      lastSeenAt: new Date("2026-10-21T00:00:00.000Z"),
      rent: 200000,
    });
    const recentB = listing(21, {
      lastSeenAt: new Date("2026-10-19T00:00:00.000Z"),
      rent: 10000,
    });
    const recent = await searchRentals(
      { sort: "recent", limit: 2 },
      createFixtureRentalReader([recentA, recentB]),
      NOW,
    );
    expect(recent.results.map((row) => row.id)).toEqual([id(20), id(21)]);
  });

  it("既定は10件で、次のページを持っていることを返す", async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      listing(i + 1, { rent: 10000 * (i + 1), managementFee: 0 }),
    );
    const reader = createFixtureRentalReader(rows);
    const page1 = await searchRentals({}, reader, NOW);
    expect(page1.limit).toBe(10);
    expect(page1.results).toHaveLength(10);
    expect(page1.hasMore).toBe(true);
    const page2 = await searchRentals({ page: 2 }, reader, NOW);
    expect(page2.results).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
  });

  it("読み手が古い行を返しても本文に出さない", async () => {
    const fresh = listing(1);
    const stale = listing(2, {
      address: "STALE-MARKER-ADDRESS",
      lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const reader: RentalReader = {
      async search() {
        return { rows: [stale, fresh], latestSeenAt: fresh.lastSeenAt };
      },
      async getById(wanted) {
        const row = [stale, fresh].find((item) => item.id === wanted) ?? null;
        return { row, latestSeenAt: fresh.lastSeenAt };
      },
      async market() {
        return {
          byPrefecture: [],
          byLayout: [],
          byPrefectureAndLayout: [],
          latestSeenAt: null,
        };
      },
    };
    const found = await searchRentals({}, reader, NOW);
    expect(found.results.map((row) => row.id)).toEqual([id(1)]);
    expect(JSON.stringify(found)).not.toContain("STALE-MARKER-ADDRESS");
  });

  it("起点があるときだけ真北の伝統区分を添える", async () => {
    const origin = { lat: 35.6812, lon: 139.7671 };
    let placed: { lat: number; lon: number } | null = null;
    let traditional = directionFromBearing(0, "traditional");
    let physical = directionFromBearing(0, "physical");
    for (let km = 1; km <= 30 && placed == null; km += 1) {
      for (let bearing = 15; bearing < 23; bearing += 0.25) {
        const dest = destinationAtBearing(origin.lat, origin.lon, bearing, km);
        const got = bearingBetween(origin.lat, origin.lon, dest.lat, dest.lon);
        traditional = directionFromBearing(got, "traditional");
        physical = directionFromBearing(got, "physical");
        if (traditional !== physical) {
          placed = dest;
          break;
        }
      }
    }
    expect(placed).not.toBeNull();
    const dest = placed ?? origin;
    const out = await searchRentals(
      { originLat: origin.lat, originLon: origin.lon, limit: 5 },
      createFixtureRentalReader([
        listing(1, { lat: dest.lat, lon: dest.lon }),
        listing(2, { lat: null, lon: null }),
      ]),
      NOW,
    );
    const withPoint = out.results.find((row) => row.id === id(1));
    const without = out.results.find((row) => row.id === id(2));
    expect(withPoint?.direction).toBe(traditional);
    expect(withPoint?.direction).not.toBe(physical);
    expect(withPoint?.directionBasis).toBe("true-north-traditional");
    expect(without).not.toHaveProperty("direction");
    expect(out.note).toContain("judge_directions");
  });

  it("県コードを名称にし、壊れた条件は本文をオウム返ししない", async () => {
    const reader = createFixtureRentalReader([listing(1)]);
    const coded = await searchRentals({ prefecture: "13" }, reader, NOW);
    expect(coded.filters.prefecture).toBe("東京都");
    await expect(
      searchRentals({ prefecture: "99" }, reader, NOW),
    ).rejects.toThrow("県コード 99 が分かりません。");
    await expect(
      searchRentals({ municipality: "港%" }, reader, NOW),
    ).rejects.toBeInstanceOf(RentalInputError);
    await expect(
      searchRentals({ municipality: "港%" }, reader, NOW),
    ).rejects.toThrow("市区町村に使えない文字があります。");
    await expect(
      searchRentals({ originLat: 35.6 }, reader, NOW),
    ).rejects.toThrow("起点は緯度と経度を両方指定してください。");
  });

  it("最終確認日は日本時間の日付にする", async () => {
    const out = await searchRentals(
      {},
      createFixtureRentalReader([
        listing(1, { lastSeenAt: new Date("2026-10-19T15:00:00.000Z") }),
      ]),
      NOW,
    );
    expect(out.results[0]?.lastSeenOn).toBe("2026-10-20");
  });
});

describe("get_rental", () => {
  it("生きている1件は階を足し、無いものと古いものは本文を返さない", async () => {
    const fresh = listing(1);
    const stale = listing(2, {
      address: "STALE-MARKER-ADDRESS",
      lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const reader = createFixtureRentalReader([fresh, stale]);
    const ok = await getRental({ id: id(1) }, reader, NOW);
    expect(ok.available).toBe(true);
    if (ok.available) {
      expect(ok.listing.floor).toBe("3");
      expect(ok.listing.area).toBe("港区");
      expect(ok.listing.isNewBuild).toBe(false);
    }
    const old = await getRental({ id: id(2) }, reader, NOW);
    expect(old).toMatchObject({
      found: true,
      available: false,
      reason: "stale",
    });
    expect(old).not.toHaveProperty("listing");
    expect(JSON.stringify(old)).not.toContain("STALE-MARKER-ADDRESS");
    const missing = await getRental(
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      reader,
      NOW,
    );
    expect(missing).toMatchObject({
      found: false,
      available: false,
      reason: "missing",
    });
    await expect(getRental({ id: "not-a-uuid" }, reader, NOW)).rejects.toThrow(
      "id は UUID で指定してください。",
    );
  });
});

describe("rental_market_stats", () => {
  it("生きている掲載の中央値と、凍結ファイルを分けて返す", async () => {
    const rows = [
      listing(1, {
        rent: 100000,
        managementFee: 0,
        sizeSqm: 40,
        layout: "1LDK",
      }),
      listing(2, {
        rent: 120000,
        managementFee: 0,
        sizeSqm: 40,
        layout: "1LDK",
      }),
      listing(3, {
        rent: 10000,
        managementFee: 0,
        sizeSqm: 40,
        layout: "1LDK",
        lastSeenAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
      listing(4, {
        address: "大阪府大阪市北区",
        rent: 60000,
        managementFee: 0,
        sizeSqm: 30,
        layout: "1K",
      }),
    ];
    const reader = createFixtureRentalReader(rows);
    const tokyo = await rentalMarketStats(
      { prefecture: "東京都" },
      reader,
      NOW,
    );
    expect(tokyo.live.byPrefecture).toEqual([
      {
        prefecture: "東京都",
        n: 2,
        medianTotalRent: 110000,
        medianSqmRent: 2750,
      },
    ]);
    expect(tokyo.live.byLayout).toEqual([
      { layout: "1LDK", n: 2, medianTotalRent: 110000, medianSqmRent: 2750 },
    ]);
    expect(tokyo.live.byPrefectureAndLayout[0]).toMatchObject({
      prefecture: "東京都",
      layout: "1LDK",
      n: 2,
    });
    const fileTokyo = marketStats.prefectures.find(
      (row) => row.prefecture === "東京都",
    );
    expect(tokyo.snapshot?.byPrefecture).toEqual([
      {
        prefecture: "東京都",
        n: fileTokyo?.n,
        medianTotalRent: fileTokyo?.rent.median,
        medianSqmRent: fileTokyo?.sqmRent.median,
      },
    ]);
    expect(tokyo.snapshot?.byLayout).toBeNull();
    expect(tokyo.snapshot?.national).toBeNull();
    expect(tokyo.snapshot?.freshness).toMatchObject(
      describeListingFreshness(marketStats.generatedAt, NOW),
    );
    expect(tokyo.snapshot?.freshness?.kind).toBe("empty");

    const emptyLive = await rentalMarketStats(
      {},
      createFixtureRentalReader([
        listing(1, { lastSeenAt: new Date("2026-08-01T00:00:00.000Z") }),
      ]),
      NOW,
    );
    expect(emptyLive.live.byPrefecture).toEqual([]);
    expect(emptyLive.snapshot?.national?.medianTotalRent).toBe(
      marketStats.national.rent.median,
    );

    const quiet = await rentalMarketStats(
      { prefecture: "東京都" },
      createFixtureRentalReader([
        listing(1, {
          address: "北海道札幌市中央区",
          lastSeenAt: new Date("2026-10-20T00:00:00.000Z"),
        }),
      ]),
      NOW,
    );
    expect(quiet.live.byPrefecture).toEqual([]);
    expect(quiet.freshness.kind).toBe("fresh");
    expect(quiet.freshness.message).toBeNull();
  });
});

describe("読み取りSQL", () => {
  it("条件は値に閉じ込め、鮮度以外の列と書き込みを混ぜない", () => {
    const attack = "'; DROP TABLE rental_properties;--";
    const query = rentalSearchSql({
      filters: { ...blankFilters, municipality: attack, prefecture: "東京都" },
      sort: "rent",
      offset: 3,
      limit: 7,
    });
    const { text, values } = sqlBag(query);
    expect(text).not.toContain("DROP TABLE");
    expect(text).not.toContain(attack);
    /* `_` は LIKE のワイルドカードなので、束縛値の中だけで逃がす。 */
    expect(values.join(" ")).toContain(
      "東京都'; DROP TABLE rental\\_properties;--%",
    );
    expect(text).toContain("last_seen_at");
    expect(text).not.toContain("source_emails");
    expect(text).not.toMatch(/favorite_properties|user_spots|ListingCandidate/);
    expect(FRESH_LISTING_SQL).not.toContain("lat IS NOT NULL");
    expect(text).toContain(FRESH_LISTING_SQL);
    expect(values).toContain(7);
    expect(values).toContain(3);
    const selected = RENTAL_SELECT_COLUMNS as readonly string[];
    for (const hidden of RENTAL_HIDDEN_COLUMNS) {
      expect(selected).not.toContain(hidden);
      expect(text).not.toContain(hidden);
    }
    const recent = sqlBag(
      rentalSearchSql({
        filters: blankFilters,
        sort: "recent",
        offset: 0,
        limit: 1,
      }),
    );
    expect(text).toContain("ASC NULLS LAST");
    expect(recent.text).toContain("last_seen_at DESC");
    const guard = sqlBag(rentalReadOnlySql());
    expect(guard.text).toContain("statement_timeout");
    expect(guard.text).toContain("transaction_read_only");
    const market = sqlBag(rentalMarketSql(blankFilters, "prefecture"));
    expect(market.text).toContain("percentile_cont");
    expect(market.text).toContain("rental_properties");
    expect(sqlBag(rentalGetSql(id(1))).values).toContain(id(1));
    expect(sqlBag(rentalLatestSql()).text).toContain("max(last_seen_at)");
  });
});

describe("SQLの読み手", () => {
  const secret = "hidden-contact@example.test";
  function install(mode: "ok" | "throw") {
    const queries: Prisma.Sql[] = [];
    transaction.mockImplementation(
      async (
        fn: (tx: {
          $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
        }) => Promise<unknown>,
        options?: { maxWait?: number; timeout?: number },
      ) => {
        expect(options).toEqual({ maxWait: 1000, timeout: 5000 });
        if (mode === "throw") {
          throw new Error("postgres://user:super-secret-marker@db/app");
        }
        return fn({
          async $queryRaw(query: Prisma.Sql) {
            queries.push(query);
            const text = sqlBag(query).text;
            if (text.includes("set_config")) return [];
            if (text.includes("max(last_seen_at)")) {
              return [{ latest: FRESH_SEEN }];
            }
            if (text.includes("NULL::text AS layout")) {
              return [
                {
                  prefecture: "東京都",
                  layout: null,
                  n: 2,
                  median_total_rent: 110000,
                  median_sqm_rent: 2750,
                },
              ];
            }
            if (text.includes("NULL::text AS prefecture")) {
              return [
                {
                  prefecture: null,
                  layout: "1LDK",
                  n: 2,
                  median_total_rent: 110000,
                  median_sqm_rent: 2750,
                },
              ];
            }
            if (text.includes("percentile_cont")) {
              return [
                {
                  prefecture: "東京都",
                  layout: "1LDK",
                  n: 2,
                  median_total_rent: 110000,
                  median_sqm_rent: 2750,
                },
              ];
            }
            return [
              {
                id: id(1),
                url: "https://example.test/listings/1",
                address: "東京都港区芝公園",
                rent: 80000,
                management_fee: 5000,
                layout: "1LDK",
                size_sqm: "40.5",
                minutes_to_station: 8,
                building_age: 10,
                last_seen_at: FRESH_SEEN,
                lat: 35.65,
                lon: 139.75,
                property_name: "公開名",
                floor: "3",
                area: "港区",
                is_new_build: false,
                expire_date: null,
                source_emails: secret,
                source_scraper: "nifty",
              },
            ];
          },
        });
      },
    );
    return queries;
  }

  afterEach(() => {
    transaction.mockReset();
  });

  it("余分な列を捨て、数値の文字列を数にする", async () => {
    const queries = install("ok");
    const reader = createSqlRentalReader();
    const found = await searchRentals({}, reader, NOW);
    expect(queries.length).toBeGreaterThan(0);
    expect(sqlBag(queries[0]).text).toContain("set_config");
    expect(found.results[0]?.sizeSqm).toBe(40.5);
    expect(JSON.stringify(found)).not.toContain(secret);
    expect(JSON.stringify(found)).not.toContain("source_scraper");
    const one = await getRental({ id: id(1) }, reader, NOW);
    expect(JSON.stringify(one)).not.toContain(secret);
    const stats = await rentalMarketStats(
      { prefecture: "東京都" },
      reader,
      NOW,
    );
    expect(stats.live.byPrefecture[0]?.medianTotalRent).toBe(110000);
    expect(stats.live.byLayout[0]?.layout).toBe("1LDK");
    for (const query of queries) {
      const text = sqlBag(query).text;
      expect(text).not.toMatch(/INSERT|UPDATE|DELETE|DROP TABLE|source_emails/);
    }
  });
});

describe("公開MCPの道具", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    transaction.mockReset();
    await Promise.all(closers.splice(0).map((close) => close()));
  });

  async function connect(server: ReturnType<typeof createMcpServer>) {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    closers.push(
      () => client.close(),
      () => server.close(),
    );
    return client;
  }

  it("読み取り専用として登録し、個人用としるべには出さない", async () => {
    const client = await connect(
      createMcpServer({ rentals: createFixtureRentalReader([listing(1)]) }),
    );
    const tools = (await client.listTools()).tools;
    for (const name of [
      "search_rentals",
      "get_rental",
      "rental_market_stats",
    ]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool?.inputSchema.properties).toBeTruthy();
    }
    const search = tools.find((item) => item.name === "search_rentals");
    expect(search?.inputSchema.properties).toHaveProperty("maxRent");
    expect(search?.inputSchema.properties).toHaveProperty("originLat");
    const called = await client.callTool({
      name: "search_rentals",
      arguments: { prefecture: "東京都" },
    });
    const body = JSON.parse((called.content as { text: string }[])[0].text);
    expect(body.results).toHaveLength(1);
    expect(body.readOnly).toBe(true);
    const chain = CHAIN_TOOLS as readonly string[];
    for (const name of [
      "search_rentals",
      "get_rental",
      "rental_market_stats",
    ]) {
      expect(chain).not.toContain(name);
    }

    const personal = await connect(
      createMcpPersonalServer({
        userId: "11111111-1111-4111-8111-111111111111",
        grantId: "22222222-2222-4222-8222-222222222222",
        clientId: "test-client",
        allowedProfileIds: ["one"],
      }),
    );
    const names = (await personal.listTools()).tools.map((tool) => tool.name);
    for (const name of [
      "search_rentals",
      "get_rental",
      "rental_market_stats",
    ]) {
      expect(names).not.toContain(name);
    }
  });

  it("接続失敗の文言に接続文字列を出さない", async () => {
    installThrow();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = await connect(createMcpServer());
    const called = await client.callTool({
      name: "search_rentals",
      arguments: {},
    });
    const text = (called.content as { text: string }[])[0].text;
    expect(called.isError).toBe(true);
    expect(text).toBe("掲載を取得できませんでした。");
    expect(JSON.stringify(called)).not.toContain("super-secret-marker");
    expect(spy).toHaveBeenCalledWith("[mcp] rental read failed");
    expect(spy.mock.calls.flat().join(" ")).not.toContain(
      "super-secret-marker",
    );
    spy.mockRestore();
  });
});

function installThrow() {
  transaction.mockRejectedValue(
    new Error("postgres://user:super-secret-marker@db/app"),
  );
}

describe("賃貸ツールの源", () => {
  it("スクレイパーと有料APIと静的なDB接続を呼ばない", () => {
    const src = readFileSync("src/lib/mcpRentals.ts", "utf8");
    for (const token of [
      "nifty_scraper",
      "nifty_extractor",
      "rentalUpsert",
      "child_process",
      "$executeRaw",
      "$queryRawUnsafe",
      "fetch(",
      "paidApis",
    ]) {
      expect(src, token).not.toContain(token);
    }
    expect(src).not.toContain('from "@/lib/prisma"');
    expect(src).toContain('import("@/lib/prisma")');
  });
});
