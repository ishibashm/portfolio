import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/rentals/arbitrage/prefecture-counts（全国俯瞰の県別件数）。
 *
 * 守るのは 3 つ。
 *   1. 絞り込みが空なら、掲載中の条件だけで数える（静的ファイルと同じ数字）
 *   2. 家賃は**総家賃（賃料 + 管理費）**で比べる。賃料だけで比べると
 *      管理費の高い物件が上限内に見え、一覧と件数が食い違う
 *   3. SQL で表せない絞り込み（方位・吉凶・お気に入りなど）は数えたと
 *      言わない。応答で明示する
 *
 * SQL そのものは実 DB に投げないと確かめられないので、ここでは
 * 組み上がった SQL 文字列とパラメータを見る。テンプレートの入れ子
 * （Prisma.join / Prisma.raw）が崩れると本番で 500 になる。
 */

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: queryRaw } }));

import { GET } from "@/app/api/rentals/arbitrage/prefecture-counts/route";

/** $queryRaw はタグ付きテンプレートで呼ばれる。組み上がった SQL を復元する。 */
function lastQuery(): { sql: string; values: unknown[] } {
  const call = queryRaw.mock.calls.at(-1);
  if (!call) throw new Error("$queryRaw が呼ばれていない");
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  // Prisma.Sql が混ざる位置は展開して中身を見る。
  const flat: unknown[] = [];
  let sql = strings[0];
  values.forEach((v, i) => {
    const asSql = v as { strings?: string[]; sql?: string; values?: unknown[] };
    if (asSql && typeof asSql.sql === "string") {
      sql += asSql.sql;
      flat.push(...(asSql.values ?? []));
    } else {
      sql += "?";
      flat.push(v);
    }
    sql += strings[i + 1];
  });
  return { sql, values: flat };
}

function call(query: string) {
  return GET(
    new Request(
      `https://cloud-palette.com/api/rentals/arbitrage/prefecture-counts${query}`,
    ),
  );
}

describe("県別件数", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue([
      { pref: "兵庫県", n: 120 },
      { pref: "京都府", n: 0 },
    ]);
  });

  it("絞り込みが空なら、掲載中の条件だけで数える", async () => {
    const res = await call("");
    const json = await res.json();

    expect(res.status).toBe(200);
    // 0 件の県は返さない。地図側は「載っていない = 0」として扱う。
    expect(json.data.counts).toEqual({ 兵庫県: 120 });
    expect(json.data.appliedFilters).toEqual([]);

    const { sql } = lastQuery();
    expect(sql).toContain("last_seen_at > now() - interval '30 days'");
    expect(sql).toContain("expire_date IS NULL OR expire_date >= now()");
    // 余計な条件を足していない
    expect(sql).not.toContain("management_fee");
    expect(sql).not.toContain("building_age");
  });

  it("家賃は総家賃（賃料 + 管理費）で比べ、万円を円に直す", async () => {
    await call("?maxRentMan=8");
    const { sql, values } = lastQuery();

    expect(sql).toContain("rent + coalesce(management_fee, 0) <=");
    expect(values).toContain(80000);
  });

  it("間取りは部分一致。画面の filterLayouts と同じ規則にする", async () => {
    await call("?layouts=2LDK,1K");
    const { sql, values } = lastQuery();

    expect(sql).toContain("upper(coalesce(layout, '')) LIKE");
    // 前方一致にすると「ワンルーム2LDK」のような表記を落として
    // 一覧と食い違う。両側にワイルドカードを置く。
    expect(values).toContain("%2LDK%");
    expect(values).toContain("%1K%");
  });

  it("壊れた値・0・負の数は「指定なし」に倒す", async () => {
    const res = await call("?maxRentMan=abc&maxBuildingAge=0&minSizeSqm=-5");
    const json = await res.json();

    expect(json.data.appliedFilters).toEqual([]);
    const { sql } = lastQuery();
    expect(sql).not.toContain("management_fee");
    expect(sql).not.toContain("size_sqm >=");
  });

  it("複数の条件を AND でつなぐ", async () => {
    const res = await call(
      "?maxRentMan=10&maxBuildingAge=15&maxStationMin=10&minSizeSqm=30&layouts=2LDK",
    );
    const json = await res.json();

    expect(json.data.appliedFilters).toEqual([
      "maxRentMan",
      "maxBuildingAge",
      "maxStationMin",
      "minSizeSqm",
      "layouts",
    ]);
    const { sql } = lastQuery();
    expect(sql).toContain("building_age <=");
    expect(sql).toContain("minutes_to_station <=");
    expect(sql).toContain("size_sqm >=");
  });

  it("SQL で表せない絞り込みは、数えたと言わない", async () => {
    const res = await call("?maxRentMan=8");
    const json = await res.json();

    // 方位や吉凶は出発地・生年月日から画面側で出す値で、DB の列に無い。
    // 混ぜて 1 つの数字にすると「方位で絞ったのに減らない」に見える。
    expect(json.data.unsupportedFilters).toContain("direction");
    expect(json.data.unsupportedFilters).toContain("luckyOnly");
  });

  it("集計に失敗しても 0 件と偽らず 500 を返す", async () => {
    queryRaw.mockRejectedValueOnce(new Error("relation does not exist"));
    const res = await call("");
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
  });
});
