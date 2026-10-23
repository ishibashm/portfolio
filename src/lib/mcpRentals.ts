/**
 * 公開 MCP の賃貸掲載ツール。
 *
 * 掲載はログインなしで画面に出ていた市場データなので、個人用
 * （既定無効の `/api/mcp/personal`）ではなく公開 `/api/mcp` に置く。
 * 個人用に置くと、市場データまで本人認証の奥に隠れる。
 *
 * 返さないもの: 取込メール（source_emails）、スクレイパー名、名寄せキー、
 * お気に入り（favorite_properties）、地点（user_spots）、相談メモ
 * （ListingCandidate）。連絡先の列は掲載表に無い。
 *
 * 古い掲載は `listingFreshness` と同じ 30 日（LIVE_LISTING_MAX_AGE_DAYS）
 * で除く。座標の有無は地図の掲載条件であって鮮度ではないので、ここでは
 * 要求しない。掲載期限を過ぎた行はリンクが切れるので、鮮度と一緒に除く。
 *
 * SELECT だけ。スクレイパーも有料 API も呼ばない。しるべ（有料の
 * 言語モデル）の道具一覧には入れない。
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  describeListingFreshness,
  listingFreshnessMessage,
  type ListingFreshness,
} from "@/lib/listingFreshness";
import { LIVE_LISTING_MAX_AGE_DAYS } from "@/lib/rentalListingSql";
import { prefCodeByName, prefNameByCode } from "@/lib/prefContent";
import {
  DIRECTION_LABELS,
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import { toJapanDateString } from "@/utils/japanDate";

const SOURCE = "Cloud Palette（https://cloud-palette.com）";

/** 鮮度の窓。座標・家賃・面積の条件は含めない（地図の掲載条件とは別）。 */
export const FRESH_LISTING_SQL = `last_seen_at > now() - interval '${LIVE_LISTING_MAX_AGE_DAYS} days' AND (expire_date IS NULL OR expire_date >= now())`;

/** SELECT する列。これ以外は読まない。 */
export const RENTAL_SELECT_COLUMNS = [
  "id",
  "url",
  "address",
  "rent",
  "management_fee",
  "layout",
  "size_sqm",
  "minutes_to_station",
  "building_age",
  "last_seen_at",
  "lat",
  "lon",
  "property_name",
  "floor",
  "area",
  "is_new_build",
  "expire_date",
] as const;

/** 公開応答に出してはいけない列。SELECT にも WHERE にも使わない。 */
export const RENTAL_HIDDEN_COLUMNS = [
  "source_emails",
  "source_scraper",
  "name_key",
  "municipality_key",
  "user_id",
] as const;

export class RentalInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RentalInputError";
  }
}

export type StoredListing = {
  id: string;
  url: string | null;
  address: string | null;
  rent: number | null;
  managementFee: number | null;
  layout: string | null;
  sizeSqm: number | null;
  minutesToStation: number | null;
  buildingAge: number | null;
  lastSeenAt: Date;
  lat: number | null;
  lon: number | null;
  propertyName: string;
  floor: string | null;
  area: string | null;
  isNewBuild: boolean | null;
  expireDate: Date | null;
};

export type RentalFilters = {
  prefecture: string | null;
  municipality: string | null;
  maxRent: number | null;
  includeManagementFee: boolean;
  layout: string | null;
  minSizeSqm: number | null;
  maxWalkMinutes: number | null;
  maxBuildingAge: number | null;
};

export type MarketFilter = {
  prefecture: string | null;
  layout: string | null;
};

export type RentGroup = {
  n: number;
  medianTotalRent: number;
  medianSqmRent: number;
};

export type RentalReader = {
  search(query: {
    filters: RentalFilters;
    sort: "rent" | "recent";
    offset: number;
    limit: number;
    now: Date;
  }): Promise<{ rows: StoredListing[]; latestSeenAt: Date | null }>;
  getById(
    id: string,
  ): Promise<{ row: StoredListing | null; latestSeenAt: Date | null }>;
  market(query: { filters: MarketFilter; now: Date }): Promise<{
    byPrefecture: (RentGroup & { prefecture: string })[];
    byLayout: (RentGroup & { layout: string })[];
    byPrefectureAndLayout: (RentGroup & {
      prefecture: string;
      layout: string;
    })[];
    latestSeenAt: Date | null;
  }>;
};

const searchShape = {
  prefecture: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .optional()
    .describe("都道府県名（東京都）または2桁コード"),
  municipality: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe("市区町村。都道府県名は繰り返さない（例: 港区）"),
  maxRent: z
    .number()
    .int()
    .min(0)
    .max(5_000_000)
    .optional()
    .describe("家賃の上限（円）。既定は管理費込み"),
  includeManagementFee: z
    .boolean()
    .default(true)
    .describe("true なら家賃+管理費で上限を見る。管理費が空なら家賃だけ"),
  layout: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .optional()
    .describe("間取りの完全一致（例: 1LDK）"),
  minSizeSqm: z.number().min(1).max(500).optional().describe("最小面積（㎡）"),
  maxWalkMinutes: z
    .number()
    .int()
    .min(0)
    .max(60)
    .optional()
    .describe("駅徒歩の上限（分）。駅名はデータに無い"),
  maxBuildingAge: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("築年数の上限"),
  sort: z
    .enum(["rent", "recent"])
    .default("rent")
    .describe("rent=家賃の安い順 / recent=最終確認の新しい順"),
  page: z.number().int().min(1).max(20).default(1),
  limit: z.number().int().min(1).max(20).default(10).describe("既定10、最大20"),
  originLat: z
    .number()
    .min(20)
    .max(46)
    .optional()
    .describe("起点の緯度。経度と両方あるときだけ方位を添える"),
  originLon: z.number().min(122).max(154).optional().describe("起点の経度"),
};

const getShape = {
  id: z.uuid().describe("rental_properties.id"),
  originLat: z.number().min(20).max(46).optional(),
  originLon: z.number().min(122).max(154).optional(),
};

const statsShape = {
  prefecture: z
    .string()
    .trim()
    .min(1)
    .max(8)
    .optional()
    .describe("都道府県名または2桁コード。省略時は全都道府県"),
  layout: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .optional()
    .describe("間取り。生きている掲載の集計だけに効く"),
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function totalRent(row: Pick<StoredListing, "rent" | "managementFee">) {
  if (row.rent == null) return null;
  return row.rent + (row.managementFee ?? 0);
}

/**
 * SQL の `last_seen_at > now() - interval 'N days'` と同じ境界。
 * ちょうど N 日まえは含めない。掲載期限ちょうどは含める（`>=`）。
 */
export function listingIsFresh(row: StoredListing, now: Date): boolean {
  if (!Number.isFinite(row.lastSeenAt.getTime())) return false;
  const freshness = describeListingFreshness(row.lastSeenAt.toISOString(), now);
  if (freshness.kind === "unknown" || freshness.kind === "empty") return false;
  if (row.expireDate && row.expireDate.getTime() < now.getTime()) return false;
  return true;
}

function addressMatches(
  address: string | null,
  prefecture: string | null,
  municipality: string | null,
): boolean {
  const text = address ?? "";
  if (prefecture && municipality)
    return text.startsWith(prefecture + municipality);
  if (prefecture) return text.startsWith(prefecture);
  if (municipality) return text.includes(municipality);
  return true;
}

/** 検索条件。鮮度を含む。サービス側でもう一度掛け、古い行を通さない。 */
export function listingMatches(
  row: StoredListing,
  filters: RentalFilters,
  now: Date,
): boolean {
  if (!listingIsFresh(row, now)) return false;
  if (!addressMatches(row.address, filters.prefecture, filters.municipality))
    return false;
  if (filters.maxRent != null) {
    const cost = filters.includeManagementFee ? totalRent(row) : row.rent;
    if (cost == null || cost > filters.maxRent) return false;
  }
  if (filters.layout != null && row.layout !== filters.layout) return false;
  if (
    filters.minSizeSqm != null &&
    (row.sizeSqm == null || row.sizeSqm < filters.minSizeSqm)
  )
    return false;
  if (
    filters.maxWalkMinutes != null &&
    (row.minutesToStation == null ||
      row.minutesToStation > filters.maxWalkMinutes)
  )
    return false;
  if (
    filters.maxBuildingAge != null &&
    (row.buildingAge == null || row.buildingAge > filters.maxBuildingAge)
  )
    return false;
  return true;
}

function compareListings(
  a: StoredListing,
  b: StoredListing,
  sort: "rent" | "recent",
): number {
  if (sort === "recent") {
    const byTime = b.lastSeenAt.getTime() - a.lastSeenAt.getTime();
    if (byTime !== 0) return byTime;
  } else {
    const ar = totalRent(a);
    const br = totalRent(b);
    if (ar == null && br != null) return 1;
    if (br == null && ar != null) return -1;
    if (ar != null && br != null && ar !== br) return ar - br;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function medianRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(raw);
}

function marketRowCounts(row: StoredListing, filters: MarketFilter, now: Date) {
  if (!listingIsFresh(row, now)) return false;
  if (row.rent == null || row.sizeSqm == null || !(row.sizeSqm > 0))
    return false;
  if (filters.prefecture && !(row.address ?? "").startsWith(filters.prefecture))
    return false;
  if (filters.layout && row.layout !== filters.layout) return false;
  return true;
}

let prefectureNameCache: string[] | null = null;
export function prefectureNames(): string[] {
  if (prefectureNameCache) return prefectureNameCache;
  const names: string[] = [];
  for (let i = 1; i <= 47; i++) {
    const name = prefNameByCode(String(i).padStart(2, "0"));
    if (name) names.push(name);
  }
  prefectureNameCache = names;
  return names;
}

export function prefectureOfAddress(address: string | null): string | null {
  if (!address) return null;
  for (const name of prefectureNames()) {
    if (address.startsWith(name)) return name;
  }
  return null;
}

export function summarizeLive(
  rows: readonly StoredListing[],
  filters: MarketFilter,
  now: Date,
) {
  const byPref = new Map<string, { total: number[]; sqm: number[] }>();
  const byLayout = new Map<string, { total: number[]; sqm: number[] }>();
  const byBoth = new Map<string, { total: number[]; sqm: number[] }>();
  for (const row of rows) {
    if (!marketRowCounts(row, filters, now)) continue;
    const total = totalRent(row);
    if (total == null || row.sizeSqm == null || !(row.sizeSqm > 0)) continue;
    const sqm = total / row.sizeSqm;
    const pref = prefectureOfAddress(row.address);
    const layout = row.layout && row.layout.length > 0 ? row.layout : null;
    if (pref) {
      const bucket = byPref.get(pref) ?? { total: [], sqm: [] };
      bucket.total.push(total);
      bucket.sqm.push(sqm);
      byPref.set(pref, bucket);
    }
    if (layout) {
      const bucket = byLayout.get(layout) ?? { total: [], sqm: [] };
      bucket.total.push(total);
      bucket.sqm.push(sqm);
      byLayout.set(layout, bucket);
    }
    if (pref && layout) {
      const key = `${pref}\t${layout}`;
      const bucket = byBoth.get(key) ?? { total: [], sqm: [] };
      bucket.total.push(total);
      bucket.sqm.push(sqm);
      byBoth.set(key, bucket);
    }
  }
  const finish = (
    map: Map<string, { total: number[]; sqm: number[] }>,
    limit: number,
  ) => {
    const out: (RentGroup & { key: string })[] = [];
    for (const [key, bucket] of map) {
      const medianTotalRent = medianRounded(bucket.total);
      const medianSqmRent = medianRounded(bucket.sqm);
      if (medianTotalRent == null || medianSqmRent == null) continue;
      out.push({
        key,
        n: bucket.total.length,
        medianTotalRent,
        medianSqmRent,
      });
    }
    out.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key, "ja"));
    return out.slice(0, limit);
  };
  const both: (RentGroup & { prefecture: string; layout: string })[] = [];
  for (const [key, bucket] of byBoth) {
    const tab = key.indexOf("\t");
    if (tab <= 0) continue;
    const prefecture = key.slice(0, tab);
    const layout = key.slice(tab + 1);
    const medianTotalRent = medianRounded(bucket.total);
    const medianSqmRent = medianRounded(bucket.sqm);
    if (medianTotalRent == null || medianSqmRent == null) continue;
    both.push({
      prefecture,
      layout,
      n: bucket.total.length,
      medianTotalRent,
      medianSqmRent,
    });
  }
  both.sort(
    (a, b) =>
      b.n - a.n ||
      a.prefecture.localeCompare(b.prefecture, "ja") ||
      a.layout.localeCompare(b.layout, "ja"),
  );
  return {
    byPrefecture: finish(byPref, 47).map(({ key, ...rest }) => ({
      prefecture: key,
      ...rest,
    })),
    byLayout: finish(byLayout, 100).map(({ key, ...rest }) => ({
      layout: key,
      ...rest,
    })),
    byPrefectureAndLayout: both.slice(0, 80),
  };
}

function rejectToken(value: string, label: string) {
  if (/[%_\\\u0000-\u001f]/.test(value))
    throw new RentalInputError(`${label}に使えない文字があります。`);
}

function resolvePrefecture(value: string | undefined): string | null {
  if (value == null) return null;
  rejectToken(value, "都道府県");
  if (/^\d{2}$/.test(value)) {
    const name = prefNameByCode(value);
    if (!name) throw new RentalInputError(`県コード ${value} が分かりません。`);
    return name;
  }
  if (!prefCodeByName(value))
    throw new RentalInputError(
      "都道府県は名称（東京都）か2桁コードで指定してください。",
    );
  return value;
}

function resolveToken(value: string | undefined, label: string): string | null {
  if (value == null) return null;
  rejectToken(value, label);
  return value;
}

function originOf(
  lat: number | undefined,
  lon: number | undefined,
): { lat: number; lon: number } | null {
  if (lat == null && lon == null) return null;
  if (lat == null || lon == null)
    throw new RentalInputError("起点は緯度と経度を両方指定してください。");
  return { lat, lon };
}

function parseFailed(): never {
  throw new RentalInputError(
    "条件の形式を確認してください。件数は1〜20、ページは1〜20です。",
  );
}

type ParsedSearch = {
  filters: RentalFilters;
  sort: "rent" | "recent";
  page: number;
  limit: number;
  origin: { lat: number; lon: number } | null;
};

function parseSearch(input: unknown): ParsedSearch {
  const parsed = z.object(searchShape).safeParse(input ?? {});
  if (!parsed.success) parseFailed();
  const v = parsed.data;
  return {
    filters: {
      prefecture: resolvePrefecture(v.prefecture),
      municipality: resolveToken(v.municipality, "市区町村"),
      maxRent: v.maxRent ?? null,
      includeManagementFee: v.includeManagementFee,
      layout: resolveToken(v.layout, "間取り"),
      minSizeSqm: v.minSizeSqm ?? null,
      maxWalkMinutes: v.maxWalkMinutes ?? null,
      maxBuildingAge: v.maxBuildingAge ?? null,
    },
    sort: v.sort,
    page: v.page,
    limit: v.limit,
    origin: originOf(v.originLat, v.originLon),
  };
}

function freshnessOf(latest: Date | null, now: Date) {
  const described: ListingFreshness = describeListingFreshness(
    latest ? latest.toISOString() : null,
    now,
  );
  return {
    ...described,
    dataUpdatedAt: latest ? latest.toISOString() : null,
    message: listingFreshnessMessage(described),
    maxAgeDays: LIVE_LISTING_MAX_AGE_DAYS,
  };
}

export function rentalToolNote(withOrigin: boolean): string {
  const base = `最終確認から${LIVE_LISTING_MAX_AGE_DAYS}日を過ぎた掲載と、掲載期限を過ぎた掲載は除いています。駅名は保存していないため徒歩分だけ返します。連絡先・取込メール・利用者のお気に入りは返しません。スクレイピングと有料APIは呼んでいません。`;
  if (!withOrigin) return base;
  return `${base}方位は起点から見た真北の伝統区分で、吉凶は含みません。吉凶は judge_directions を別に呼んでください。`;
}

function compass(
  origin: { lat: number; lon: number } | null,
  row: StoredListing,
) {
  if (origin == null || row.lat == null || row.lon == null) return {};
  const bearing = bearingBetween(origin.lat, origin.lon, row.lat, row.lon);
  const direction = directionFromBearing(bearing, "traditional");
  return {
    bearing: Math.round(bearing * 10) / 10,
    direction,
    directionLabel: DIRECTION_LABELS[direction],
    distanceKm:
      Math.round(
        distanceKmBetween(origin.lat, origin.lon, row.lat, row.lon) * 10,
      ) / 10,
    directionBasis: "true-north-traditional" as const,
  };
}

function toPublic(
  row: StoredListing,
  origin: { lat: number; lon: number } | null,
) {
  return {
    id: row.id,
    url: row.url,
    address: row.address,
    propertyName: row.propertyName,
    rent: row.rent,
    managementFee: row.managementFee,
    totalRent: totalRent(row),
    layout: row.layout,
    sizeSqm: row.sizeSqm,
    minutesToStation: row.minutesToStation,
    stationName: null,
    buildingAge: row.buildingAge,
    lastSeenAt: row.lastSeenAt.toISOString(),
    lastSeenOn: toJapanDateString(row.lastSeenAt),
    lat: row.lat,
    lon: row.lon,
    ...compass(origin, row),
  };
}

const flags = {
  source: SOURCE,
  readOnly: true as const,
  scrapingStarted: false as const,
  paidApiCalled: false as const,
};

export async function searchRentals(
  input: unknown,
  reader: RentalReader,
  now = new Date(),
) {
  const query = parseSearch(input);
  const fetched = await reader.search({
    filters: query.filters,
    sort: query.sort,
    offset: (query.page - 1) * query.limit,
    limit: query.limit + 1,
    now,
  });
  const hasMore = fetched.rows.length > query.limit;
  const results = fetched.rows
    .slice(0, query.limit)
    .filter((row) => listingMatches(row, query.filters, now))
    .map((row) => toPublic(row, query.origin));
  return {
    ...flags,
    filters: query.filters,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
    hasMore,
    freshness: freshnessOf(fetched.latestSeenAt, now),
    note: rentalToolNote(query.origin != null),
    results,
  };
}

export async function getRental(
  input: unknown,
  reader: RentalReader,
  now = new Date(),
) {
  const parsed = z.object(getShape).safeParse(input ?? {});
  if (!parsed.success)
    throw new RentalInputError("id は UUID で指定してください。");
  const origin = originOf(parsed.data.originLat, parsed.data.originLon);
  const got = await reader.getById(parsed.data.id);
  const freshness = freshnessOf(got.latestSeenAt, now);
  if (!got.row || !listingIsFresh(got.row, now)) {
    return {
      ...flags,
      found: Boolean(got.row),
      available: false as const,
      reason: got.row ? ("stale" as const) : ("missing" as const),
      id: parsed.data.id,
      freshness,
      note: got.row
        ? `最終確認から${LIVE_LISTING_MAX_AGE_DAYS}日を過ぎたか、掲載期限を過ぎているため、本文は返しません。`
        : "そのIDの掲載はありません。",
    };
  }
  return {
    ...flags,
    found: true as const,
    available: true as const,
    reason: null,
    id: parsed.data.id,
    freshness,
    note: rentalToolNote(origin != null),
    listing: {
      ...toPublic(got.row, origin),
      floor: got.row.floor,
      area: got.row.area,
      isNewBuild: got.row.isNewBuild,
    },
  };
}

type SnapshotPref = {
  prefecture: string;
  n: number;
  medianTotalRent: number;
  medianSqmRent: number;
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readSnapshot(raw: unknown): {
  generatedAt: string;
  national: SnapshotPref;
  byPrefecture: SnapshotPref[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  if (typeof root.generatedAt !== "string") return null;
  const national = root.national;
  if (!national || typeof national !== "object") return null;
  const nat = national as Record<string, unknown>;
  const rent = nat.rent;
  const sqm = nat.sqmRent;
  if (!rent || typeof rent !== "object" || !sqm || typeof sqm !== "object")
    return null;
  const medianTotalRent = readNumber((rent as Record<string, unknown>).median);
  const medianSqmRent = readNumber((sqm as Record<string, unknown>).median);
  const n = readNumber((rent as Record<string, unknown>).n);
  if (medianTotalRent == null || medianSqmRent == null || n == null)
    return null;
  if (!Array.isArray(root.prefectures)) return null;
  const byPrefecture: SnapshotPref[] = [];
  for (const item of root.prefectures) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.prefecture !== "string") continue;
    const rowRent = row.rent;
    const rowSqm = row.sqmRent;
    if (
      !rowRent ||
      typeof rowRent !== "object" ||
      !rowSqm ||
      typeof rowSqm !== "object"
    )
      continue;
    const rowMedian = readNumber((rowRent as Record<string, unknown>).median);
    const rowSqmMedian = readNumber((rowSqm as Record<string, unknown>).median);
    const rowN = readNumber(row.n);
    if (rowMedian == null || rowSqmMedian == null || rowN == null) continue;
    byPrefecture.push({
      prefecture: row.prefecture,
      n: rowN,
      medianTotalRent: rowMedian,
      medianSqmRent: rowSqmMedian,
    });
  }
  return {
    generatedAt: root.generatedAt,
    national: {
      prefecture: "全国",
      n,
      medianTotalRent,
      medianSqmRent,
    },
    byPrefecture,
  };
}

async function loadMarketSnapshot() {
  const mod = (await import("@/data/marketStats.json")) as unknown;
  const raw =
    mod && typeof mod === "object" && "default" in mod
      ? (mod as { default: unknown }).default
      : mod;
  return readSnapshot(raw);
}

export async function rentalMarketStats(
  input: unknown,
  reader: RentalReader,
  now = new Date(),
) {
  const parsed = z.object(statsShape).safeParse(input ?? {});
  if (!parsed.success) parseFailed();
  const filters: MarketFilter = {
    prefecture: resolvePrefecture(parsed.data.prefecture),
    layout: resolveToken(parsed.data.layout, "間取り"),
  };
  const live = await reader.market({ filters, now });
  const snapshot = await loadMarketSnapshot().catch(() => null);
  const snapshotPrefs = snapshot
    ? filters.prefecture
      ? snapshot.byPrefecture.filter(
          (row) => row.prefecture === filters.prefecture,
        )
      : snapshot.byPrefecture
    : [];
  const snapshotFreshness = snapshot
    ? freshnessOf(new Date(snapshot.generatedAt), now)
    : null;
  return {
    ...flags,
    unit: "円",
    totalRentDefinition: "家賃+管理費。管理費が空の掲載は家賃だけ",
    filters,
    freshness: freshnessOf(live.latestSeenAt, now),
    live: {
      note: `最終確認から${LIVE_LISTING_MAX_AGE_DAYS}日以内で、掲載期限を過ぎておらず、家賃と面積がある掲載だけです。中央値は円に丸めています。`,
      byPrefecture: live.byPrefecture,
      byLayout: live.byLayout,
      byPrefectureAndLayout: live.byPrefectureAndLayout,
    },
    snapshot: snapshot
      ? {
          asOf: snapshot.generatedAt,
          freshness: snapshotFreshness,
          page: "https://cloud-palette.com/relocation/market",
          byLayout: null,
          national: filters.prefecture ? null : snapshot.national,
          byPrefecture: snapshotPrefs,
          note: "画面の家賃相場と同じ凍結ファイルです。間取り別はありません。生きている掲載の中央値ではなく、検索の母集団（座標の有無など）とも一致しません。鮮度を見て現在の相場と読まないでください。",
        }
      : null,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function whereSql(
  filters: RentalFilters,
  extra: Prisma.Sql[] = [],
): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`(${Prisma.raw(FRESH_LISTING_SQL)})`,
    ...extra,
  ];
  if (filters.prefecture && filters.municipality) {
    parts.push(
      Prisma.sql`address LIKE ${`${escapeLike(filters.prefecture + filters.municipality)}%`} ESCAPE '\\'`,
    );
  } else if (filters.prefecture) {
    parts.push(
      Prisma.sql`address LIKE ${`${escapeLike(filters.prefecture)}%`} ESCAPE '\\'`,
    );
  } else if (filters.municipality) {
    parts.push(
      Prisma.sql`address LIKE ${`%${escapeLike(filters.municipality)}%`} ESCAPE '\\'`,
    );
  }
  if (filters.maxRent != null) {
    parts.push(
      filters.includeManagementFee
        ? Prisma.sql`(rent + COALESCE(management_fee, 0)) <= ${filters.maxRent}`
        : Prisma.sql`rent <= ${filters.maxRent}`,
    );
  }
  if (filters.layout) parts.push(Prisma.sql`layout = ${filters.layout}`);
  if (filters.minSizeSqm != null)
    parts.push(Prisma.sql`size_sqm >= ${filters.minSizeSqm}`);
  if (filters.maxWalkMinutes != null)
    parts.push(Prisma.sql`minutes_to_station <= ${filters.maxWalkMinutes}`);
  if (filters.maxBuildingAge != null)
    parts.push(Prisma.sql`building_age <= ${filters.maxBuildingAge}`);
  return Prisma.join(parts, " AND ");
}

export function rentalReadOnlySql(): Prisma.Sql {
  return Prisma.sql`SELECT set_config('statement_timeout', '4000', true) AS statement_timeout, set_config('transaction_read_only', 'on', true) AS transaction_read_only`;
}

export function rentalLatestSql(): Prisma.Sql {
  return Prisma.sql`SELECT max(last_seen_at) AS latest FROM rental_properties`;
}

export function rentalSearchSql(query: {
  filters: RentalFilters;
  sort: "rent" | "recent";
  offset: number;
  limit: number;
}): Prisma.Sql {
  const order =
    query.sort === "recent"
      ? Prisma.sql`last_seen_at DESC, id ASC`
      : Prisma.sql`(rent + COALESCE(management_fee, 0)) ASC NULLS LAST, id ASC`;
  return Prisma.sql`SELECT ${Prisma.raw(RENTAL_SELECT_COLUMNS.join(", "))} FROM rental_properties WHERE ${whereSql(query.filters)} ORDER BY ${order} LIMIT ${query.limit} OFFSET ${query.offset}`;
}

export function rentalGetSql(id: string): Prisma.Sql {
  return Prisma.sql`SELECT ${Prisma.raw(RENTAL_SELECT_COLUMNS.join(", "))} FROM rental_properties WHERE id = ${id}::uuid LIMIT 1`;
}

function prefectureCase(): Prisma.Sql {
  const names = prefectureNames();
  if (names.length === 0) return Prisma.sql`NULL::text`;
  const whens = names.map(
    (name) => Prisma.sql`WHEN address LIKE ${`${name}%`} THEN ${name}`,
  );
  return Prisma.sql`CASE ${Prisma.join(whens, " ")} ELSE NULL END`;
}

export function rentalMarketSql(
  filters: MarketFilter,
  kind: "prefecture" | "layout" | "both",
): Prisma.Sql {
  const blank: RentalFilters = {
    prefecture: filters.prefecture,
    municipality: null,
    maxRent: null,
    includeManagementFee: true,
    layout: filters.layout,
    minSizeSqm: null,
    maxWalkMinutes: null,
    maxBuildingAge: null,
  };
  const selectPref =
    kind === "layout"
      ? Prisma.sql`NULL::text AS prefecture`
      : Prisma.sql`prefecture`;
  const selectLayout =
    kind === "prefecture"
      ? Prisma.sql`NULL::text AS layout`
      : Prisma.sql`layout`;
  const groupBy =
    kind === "prefecture"
      ? Prisma.sql`prefecture`
      : kind === "layout"
        ? Prisma.sql`layout`
        : Prisma.sql`prefecture, layout`;
  const having =
    kind === "prefecture"
      ? Prisma.sql`prefecture IS NOT NULL`
      : kind === "layout"
        ? Prisma.sql`layout IS NOT NULL`
        : Prisma.sql`prefecture IS NOT NULL AND layout IS NOT NULL`;
  const limit = kind === "both" ? 80 : 100;
  return Prisma.sql`WITH live AS (SELECT ${prefectureCase()} AS prefecture, layout, (rent + COALESCE(management_fee, 0)) AS total_rent, (rent + COALESCE(management_fee, 0)) / size_sqm AS sqm_rent FROM rental_properties WHERE ${whereSql(blank, [Prisma.sql`rent IS NOT NULL`, Prisma.sql`size_sqm > 0`])}) SELECT ${selectPref}, ${selectLayout}, COUNT(*)::int AS n, ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_rent))::int AS median_total_rent, ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY sqm_rent))::int AS median_sqm_rent FROM live GROUP BY ${groupBy} HAVING ${having} ORDER BY n DESC LIMIT ${limit}`;
}

type SqlListing = {
  id: unknown;
  url: unknown;
  address: unknown;
  rent: unknown;
  management_fee: unknown;
  layout: unknown;
  size_sqm: unknown;
  minutes_to_station: unknown;
  building_age: unknown;
  last_seen_at: unknown;
  lat: unknown;
  lon: unknown;
  property_name: unknown;
  floor: unknown;
  area: unknown;
  is_new_build: unknown;
  expire_date: unknown;
};

function storedFromSql(row: SqlListing): StoredListing | null {
  if (typeof row.id !== "string") return null;
  const lastSeenAt = asDate(row.last_seen_at);
  if (!lastSeenAt) return null;
  return {
    id: row.id,
    url: typeof row.url === "string" ? row.url : null,
    address: typeof row.address === "string" ? row.address : null,
    rent: asNumber(row.rent),
    managementFee: asNumber(row.management_fee),
    layout: typeof row.layout === "string" ? row.layout : null,
    sizeSqm: asNumber(row.size_sqm),
    minutesToStation: asNumber(row.minutes_to_station),
    buildingAge: asNumber(row.building_age),
    lastSeenAt,
    lat: asNumber(row.lat),
    lon: asNumber(row.lon),
    propertyName:
      typeof row.property_name === "string" ? row.property_name : "",
    floor: typeof row.floor === "string" ? row.floor : null,
    area: typeof row.area === "string" ? row.area : null,
    isNewBuild: typeof row.is_new_build === "boolean" ? row.is_new_build : null,
    expireDate: asDate(row.expire_date),
  };
}

type SqlQuery = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

type RentalDb = {
  $transaction<T>(
    fn: (tx: SqlQuery) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

function isRentalDb(value: unknown): value is RentalDb {
  if (!value || typeof value !== "object") return false;
  const tx = (value as { $transaction?: unknown }).$transaction;
  return typeof tx === "function";
}

async function withDb<T>(run: (tx: SqlQuery) => Promise<T>): Promise<T> {
  const mod = (await import("@/lib/prisma")) as { default?: unknown };
  if (!isRentalDb(mod.default)) throw new Error("rental db unavailable");
  return mod.default.$transaction(
    async (tx) => {
      await tx.$queryRaw(rentalReadOnlySql());
      return run(tx);
    },
    { maxWait: 1000, timeout: 5000 },
  );
}

function latestFrom(rows: { latest: unknown }[]): Date | null {
  return asDate(rows[0]?.latest);
}

function groupsFrom(
  rows: {
    prefecture: unknown;
    layout: unknown;
    n: unknown;
    median_total_rent: unknown;
    median_sqm_rent: unknown;
  }[],
  kind: "prefecture" | "layout" | "both",
) {
  const out = [];
  for (const row of rows) {
    const n = asNumber(row.n);
    const medianTotalRent = asNumber(row.median_total_rent);
    const medianSqmRent = asNumber(row.median_sqm_rent);
    if (n == null || medianTotalRent == null || medianSqmRent == null) continue;
    if (kind === "prefecture" && typeof row.prefecture === "string")
      out.push({
        prefecture: row.prefecture,
        n,
        medianTotalRent,
        medianSqmRent,
      });
    if (kind === "layout" && typeof row.layout === "string")
      out.push({ layout: row.layout, n, medianTotalRent, medianSqmRent });
    if (
      kind === "both" &&
      typeof row.prefecture === "string" &&
      typeof row.layout === "string"
    )
      out.push({
        prefecture: row.prefecture,
        layout: row.layout,
        n,
        medianTotalRent,
        medianSqmRent,
      });
  }
  return out;
}

export function createSqlRentalReader(): RentalReader {
  return {
    async search(query) {
      return withDb(async (tx) => {
        const rows = await tx.$queryRaw<SqlListing[]>(
          rentalSearchSql({
            filters: query.filters,
            sort: query.sort,
            offset: query.offset,
            limit: query.limit,
          }),
        );
        const latest =
          await tx.$queryRaw<{ latest: unknown }[]>(rentalLatestSql());
        return {
          rows: rows.flatMap((row) => {
            const stored = storedFromSql(row);
            return stored ? [stored] : [];
          }),
          latestSeenAt: latestFrom(latest),
        };
      });
    },
    async getById(id) {
      return withDb(async (tx) => {
        const rows = await tx.$queryRaw<SqlListing[]>(rentalGetSql(id));
        const latest =
          await tx.$queryRaw<{ latest: unknown }[]>(rentalLatestSql());
        return {
          row: rows[0] ? storedFromSql(rows[0]) : null,
          latestSeenAt: latestFrom(latest),
        };
      });
    },
    async market(query) {
      return withDb(async (tx) => {
        const byPrefecture = await tx.$queryRaw<
          {
            prefecture: unknown;
            layout: unknown;
            n: unknown;
            median_total_rent: unknown;
            median_sqm_rent: unknown;
          }[]
        >(rentalMarketSql(query.filters, "prefecture"));
        const byLayout = await tx.$queryRaw<
          {
            prefecture: unknown;
            layout: unknown;
            n: unknown;
            median_total_rent: unknown;
            median_sqm_rent: unknown;
          }[]
        >(rentalMarketSql(query.filters, "layout"));
        const both = await tx.$queryRaw<
          {
            prefecture: unknown;
            layout: unknown;
            n: unknown;
            median_total_rent: unknown;
            median_sqm_rent: unknown;
          }[]
        >(rentalMarketSql(query.filters, "both"));
        const latest =
          await tx.$queryRaw<{ latest: unknown }[]>(rentalLatestSql());
        return {
          byPrefecture: groupsFrom(byPrefecture, "prefecture") as (RentGroup & {
            prefecture: string;
          })[],
          byLayout: groupsFrom(byLayout, "layout") as (RentGroup & {
            layout: string;
          })[],
          byPrefectureAndLayout: groupsFrom(both, "both") as (RentGroup & {
            prefecture: string;
            layout: string;
          })[],
          latestSeenAt: latestFrom(latest),
        };
      });
    },
  };
}

function latestOf(rows: readonly StoredListing[]): Date | null {
  let max: Date | null = null;
  for (const row of rows) {
    if (!max || row.lastSeenAt > max) max = row.lastSeenAt;
  }
  return max;
}

export function createFixtureRentalReader(
  rows: readonly StoredListing[],
): RentalReader {
  return {
    async search(query) {
      const matched = rows.filter((row) =>
        listingMatches(row, query.filters, query.now),
      );
      matched.sort((a, b) => compareListings(a, b, query.sort));
      return {
        rows: matched.slice(query.offset, query.offset + query.limit),
        latestSeenAt: latestOf(rows),
      };
    },
    async getById(id) {
      return {
        row: rows.find((row) => row.id === id) ?? null,
        latestSeenAt: latestOf(rows),
      };
    },
    async market(query) {
      return {
        ...summarizeLive(rows, query.filters, query.now),
        latestSeenAt: latestOf(rows),
      };
    },
  };
}

function text(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
    structuredContent: payload as Record<string, unknown>,
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

async function answer(run: () => Promise<unknown>) {
  try {
    return text(await run());
  } catch (e) {
    if (e instanceof RentalInputError) return fail(e.message);
    console.error("[mcp] rental read failed");
    return fail("掲載を取得できませんでした。");
  }
}

export function registerPublicRentalTools(
  server: McpServer,
  reader: RentalReader = createSqlRentalReader(),
) {
  server.registerTool(
    "search_rentals",
    {
      title: "賃貸掲載を探す",
      description:
        "公開されていた賃貸掲載を読み取りだけで検索します。都道府県・市区町村・家賃上限（既定は管理費込み）・間取りの完全一致・最小面積・駅徒歩・築年数。既定10件、最大20件、20ページまで。最終確認から30日を過ぎた掲載と掲載期限切れは除きます。駅名は保存していないため徒歩分だけです。連絡先・取込メール・お気に入りは返しません。スクレイピングと有料APIは呼びません。起点の緯度と経度を両方渡すと、真北の伝統区分で方位を添えます。吉凶は judge_directions です。",
      inputSchema: searchShape,
      annotations: readOnlyAnnotations,
    },
    async (input) => answer(() => searchRentals(input, reader)),
  );
  server.registerTool(
    "get_rental",
    {
      title: "賃貸掲載の1件",
      description:
        "掲載ID（UUID）の1件を読み取ります。最終確認から30日を過ぎた掲載と掲載期限切れは本文を返さず、除いたことだけ返します。連絡先・取込メール・お気に入りは返しません。スクレイピングと有料APIは呼びません。",
      inputSchema: getShape,
      annotations: readOnlyAnnotations,
    },
    async (input) => answer(() => getRental(input, reader)),
  );
  server.registerTool(
    "rental_market_stats",
    {
      title: "家賃の中央値",
      description:
        "最終確認から30日以内の掲載について、都道府県別・間取り別の家賃中央値（管理費込み、円）を返します。生きている掲載が無いときは空です。あわせて画面の凍結集計を snapshot として返します。snapshot は間取り別ではなく、現在の相場でもありません。読み取りだけで、スクレイピングと有料APIは呼びません。",
      inputSchema: statsShape,
      annotations: readOnlyAnnotations,
    },
    async (input) => answer(() => rentalMarketStats(input, reader)),
  );
}
