import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「買うときの水準（成約価格）」を方位・予算・広さで絞れること
 * （利用者の依頼、2026-09-24「買うときの水準も、土地の方角などで
 * フィルタリングできるようにしてほしい」）。
 *
 * それまで方位別の相場は札を並べるだけで、押しても何も起きなかった。
 * 一覧（直近の成約事例）は新しい順に 500 件で切られ、方位も予算も
 * 選べなかった。
 *
 * ## 決めごと
 *
 * - **絞るのは API。**画面で絞ると、新しい 500 件の中に件数の少ない
 *   方位（北 3 件など）はほとんど残らない。上限は絞った後に掛ける
 * - **方位は一覧にだけ効かせ、相場の札には効かせない。**札は選ぶための
 *   材料なので、1 方位に絞っても他の方位の札は残す
 * - **方位は頁全体の絞り込みと同じ状態。**街の一覧・方位ごとの内訳と
 *   食い違わない。段階も頁が組んだ同じ盤から借りる（ここで判定を作らない）
 * - 予算・広さは相場の札にも効かせる（予算内の相場を方位で比べたい）
 */

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { property_transactions: { findMany, count } },
}));

import { GET } from "@/app/api/relocation/transactions/route";
import {
  TransactionsPanel,
  listDirections,
} from "@/components/relocation/TransactionsPanel";

/** 札幌市中央区の区役所あたり（公開の代表点）。 */
const BASE = { lat: 43.0618, lon: 141.3545 };

function row(id: string, dLat: number, dLon: number, year: number) {
  return {
    id,
    prefecture: "北海道",
    municipality: "札幌市",
    district_name: null,
    property_type: "宅地(土地)",
    trade_price: BigInt(20_000_000),
    area_sqm: 200,
    unit_price_sqm: 100_000,
    building_year: null,
    total_floor_area_sqm: null,
    est_building_price: null,
    est_land_price: null,
    building_ratio: null,
    trade_year: year,
    trade_quarter: 4,
    lat: BASE.lat + dLat,
    lon: BASE.lon + dLon,
  };
}

function req(params: string) {
  return new Request(
    `http://test.local/api/relocation/transactions?lat=${BASE.lat}&lon=${BASE.lon}&radius_km=50&${params}`,
  );
}

describe("API: 方位・予算・広さで絞る", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    count.mockResolvedValue(0);
    /* 東に新しい 3 件、北に古い 1 件（新しい順に並ぶ） */
    findMany.mockResolvedValue([
      row("e1", 0, 0.12, 2025),
      row("e2", 0, 0.13, 2025),
      row("e3", 0, 0.14, 2025),
      row("n1", 0.1, 0, 2020),
    ]);
  });

  it("方位で絞ると一覧はその方位だけ。上限は絞った後に掛ける", async () => {
    const res = await GET(req("directions=N&limit=1"));
    const body = await res.json();
    /* 絞る前に上限を掛けると東の新しい 1 件しか残らず、北は 0 件になる */
    expect(body.data.rows.map((r: { id: string }) => r.id)).toEqual(["n1"]);
    expect(body.data.totalInRadius).toBe(1);
  });

  it("相場の札は全方位ぶん残す（選び直せるように）", async () => {
    const res = await GET(req("directions=N"));
    const body = await res.json();
    const dirs = body.data.byDirection.map(
      (d: { direction: string }) => d.direction,
    );
    expect(dirs.sort()).toEqual(["E", "N"]);
  });

  it("知らない綴りは絞らない（空の集合で 0 件を返さない）", async () => {
    const res = await GET(req("directions=XX,,"));
    const body = await res.json();
    expect(body.data.rows).toHaveLength(4);
  });

  it("予算・広さは DB の条件に入る（値の無い行は外す）", async () => {
    await GET(req("max_price=30000000&min_area=150"));
    const where = findMany.mock.calls[0][0].where;
    expect(where.trade_price).toEqual({ not: null, lte: BigInt(30_000_000) });
    expect(where.area_sqm).toEqual({ not: null, gte: 150 });
  });

  it("0 や負の値は絞らない", async () => {
    await GET(req("max_price=0&min_area=-5"));
    const where = findMany.mock.calls[0][0].where;
    expect(where.trade_price).toBeUndefined();
    expect(where.area_sqm).toBeUndefined();
  });
});

describe("listDirections（一覧を絞る方位）", () => {
  const verdicts = {
    N: { tier: "S", blocked: false },
    E: { tier: "X", blocked: false },
    S: { tier: "A", blocked: true },
  };

  it("1 方位を選んでいればそれだけ", () => {
    expect(listDirections("E", true, verdicts)).toEqual(["E"]);
  });

  it("「開いている方位だけ」は時期ツールと同じ境目（X・天中殺を外す）", () => {
    expect(listDirections("ALL", true, verdicts)).toEqual(["N"]);
  });

  it("どちらでもなければ絞らない", () => {
    expect(listDirections("ALL", false, verdicts)).toBeNull();
    expect(listDirections("ALL", true, undefined)).toBeNull();
  });
});

describe("画面: 札を押すと頁の方位が変わり、条件は API へ渡る", () => {
  let urls: string[];

  beforeEach(() => {
    urls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              rows: [],
              totalInRadius: 0,
              truncated: false,
              pendingCoords: 0,
              byDirection: [
                { direction: "N", count: 3, medianUnitPriceSqm: 7000 },
                { direction: "E", count: 193, medianUnitPriceSqm: 118000 },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const verdicts = {
    N: { tier: "S", blocked: false },
    E: { tier: "X", blocked: false },
  };

  it("札に段階が付き、押すとその方位を頁へ返す", async () => {
    const onSelect = vi.fn();
    render(
      <TransactionsPanel
        lat={BASE.lat}
        lon={BASE.lon}
        radiusKm={50}
        hasBase={true}
        nodeMapping="traditional"
        verdicts={verdicts}
        selectedDirection="ALL"
        onSelectDirection={onSelect}
      />,
    );
    const north = await screen.findByRole("button", { name: /^北/ });
    expect(north.textContent).toContain("三盤吉");
    fireEvent.click(north);
    expect(onSelect).toHaveBeenCalledWith("N");
  });

  it("選んだ方位・予算・広さ・開いている方位だけ、が URL に載る", async () => {
    const { rerender } = render(
      <TransactionsPanel
        lat={BASE.lat}
        lon={BASE.lon}
        radiusKm={50}
        hasBase={true}
        nodeMapping="traditional"
        verdicts={verdicts}
        selectedDirection="ALL"
        onSelectDirection={() => {}}
      />,
    );
    await waitFor(() => expect(urls.length).toBe(1));
    expect(urls[0]).not.toContain("directions=");

    fireEvent.change(screen.getByLabelText("総額の上限"), {
      target: { value: "30000000" },
    });
    fireEvent.change(screen.getByLabelText("面積の下限"), {
      target: { value: "150" },
    });
    fireEvent.click(screen.getByLabelText(/開いている方位の事例だけ/));
    await waitFor(() =>
      expect(urls.at(-1)).toMatch(
        /max_price=30000000.*min_area=150.*directions=N$/,
      ),
    );

    /* 頁で 1 方位を選ぶと、開いている方位の集合よりそちらが勝つ */
    rerender(
      <TransactionsPanel
        lat={BASE.lat}
        lon={BASE.lon}
        radiusKm={50}
        hasBase={true}
        nodeMapping="traditional"
        verdicts={verdicts}
        selectedDirection="E"
        onSelectDirection={() => {}}
      />,
    );
    await waitFor(() => expect(urls.at(-1)).toMatch(/directions=E$/));
  });
});

describe("物件検索の頁が、判定と方位の状態を渡している", () => {
  it("TransactionsPanel に verdicts / selectedDirection / onSelectDirection", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
      "utf8",
    );
    const m = src.match(/<TransactionsPanel[\s\S]*?\/>/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("verdicts={dayKigaku?.byDirection}");
    expect(m![0]).toContain("selectedDirection={selectedDirection}");
    expect(m![0]).toContain("onSelectDirection=");
  });
});
