import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countByDirection,
  directionRank,
  isOpenDirection,
  orderDirections,
} from "@/lib/directionTowns";
import { HousingStatsByDirection } from "@/components/relocation/HousingStatsByDirection";

/*
  **街を方位で探す**ための並べ方（2026-09-20）。

  賃貸の巡回は規約に従って止め、掲載は 10 月中旬に 0 件になる。物件検索は
  「部屋を並べる」から「その日に開いている方位の街を並べる」へ移す
  （利用者の依頼「物件検索の掲載も閉じて、違う形に変えて」）。

  ここで固定するのは 3 つ。
    ・「開いている」の境目が時期ツールと同じ（X・D・天中殺を避ける）。
      同じ日の同じ方位が、時期ツールでは開いていて街の一覧では閉じて
      いる、という食い違いを作らない
    ・並びが「開いている順、同じなら八方位の順」で、判定が無ければ
      並べ替えない（中身も触らない）
    ・e-Stat の方位別パネルが、判定を渡すと開いている順に並び、段階の札を
      出し、届いた応答を親に渡すこと
*/

describe("directionRank / isOpenDirection", () => {
  it("S が先、X が後、天中殺は最後、判定なしは X と天中殺の間", () => {
    expect(directionRank({ tier: "S", blocked: false })).toBe(0);
    expect(directionRank({ tier: "X", blocked: false })).toBe(5);
    expect(directionRank(undefined)).toBe(6);
    expect(directionRank({ tier: "S", blocked: true })).toBe(7);
  });

  it("開いているのは C 以上で天中殺でない方位（時期ツールと同じ境目）", () => {
    expect(isOpenDirection({ tier: "C", blocked: false })).toBe(true);
    expect(isOpenDirection({ tier: "D", blocked: false })).toBe(false);
    expect(isOpenDirection({ tier: "X", blocked: false })).toBe(false);
    expect(isOpenDirection({ tier: "S", blocked: true })).toBe(false);
    expect(isOpenDirection(undefined)).toBe(false);
  });

  it("知らない段階は X と同じ扱い（良いほうに倒さない）", () => {
    expect(directionRank({ tier: "??", blocked: false })).toBe(5);
    expect(isOpenDirection({ tier: "??", blocked: false })).toBe(false);
  });
});

describe("orderDirections", () => {
  const items = [
    { direction: "N" as const, count: 1 },
    { direction: "E" as const, count: 2 },
    { direction: "S" as const, count: 3 },
    { direction: "W" as const, count: 4 },
  ];

  it("判定が無ければ八方位の順のまま", () => {
    expect(orderDirections(items).map((d) => d.direction)).toEqual([
      "N",
      "E",
      "S",
      "W",
    ]);
    /* 入力が乱れていても八方位の順に揃える */
    expect(
      orderDirections([items[3], items[0], items[2]]).map((d) => d.direction),
    ).toEqual(["N", "S", "W"]);
  });

  it("判定があれば開いている順、同じ段階なら八方位の順", () => {
    const verdicts = {
      N: { tier: "X", blocked: false },
      E: { tier: "A", blocked: false },
      S: { tier: "A", blocked: true },
      W: { tier: "S", blocked: false },
    };
    expect(orderDirections(items, verdicts).map((d) => d.direction)).toEqual([
      "W",
      "E",
      "N",
      "S",
    ]);
    /* 中身は触らない */
    expect(
      orderDirections(items, verdicts).find((d) => d.direction === "W"),
    ).toEqual(items[3]);
  });

  it("判定の無い方位は X の後ろ、天中殺の前", () => {
    const verdicts = {
      N: { tier: "X", blocked: false },
      S: { tier: "B", blocked: true },
    };
    expect(orderDirections(items, verdicts).map((d) => d.direction)).toEqual([
      "N",
      "E",
      "W",
      "S",
    ]);
  });
});

describe("countByDirection", () => {
  it("無い方位も 0 で返す（黙って消さない）", () => {
    const counts = countByDirection([
      { direction: "N", count: 3 },
      { direction: "SW", count: 0 },
    ]);
    expect(counts.N).toBe(3);
    expect(counts.SW).toBe(0);
    expect(counts.E).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});

/* ---- パネル ---- */

function stat(direction: string, count: number, name: string) {
  return {
    direction,
    count,
    rentCount: count,
    medianRentPerSqm: count ? 2000 : null,
    medianMonthlyRentEstimate: count ? 60000 : null,
    vacancyRate: count ? 0.1 : null,
    vacancyCount: count,
    nearestKm: count ? 12 : null,
    topMunicipalities: count ? [name] : [],
    municipalities: count
      ? [
          {
            code: "13101",
            name,
            distanceKm: 12,
            bearing: 10,
            lat: 35.69,
            lon: 139.75,
            rentPerSqm: 2000,
            vacancyRate: 0.1,
            totalDwellings: 1000,
          },
        ]
      : [],
    truncated: false,
  };
}

const RESPONSE = {
  directions: [
    stat("N", 1, "北の街"),
    stat("NE", 0, ""),
    stat("E", 2, "東の街"),
    stat("SE", 0, ""),
    stat("S", 3, "南の街"),
    stat("SW", 0, ""),
    stat("W", 4, "西の街"),
    stat("NW", 0, ""),
  ],
  meta: {
    municipalitiesScanned: 10,
    dataYear: 2023,
    minKm: 5,
    maxKm: 150,
    nodeMapping: "traditional",
    source: "出典：政府統計の総合窓口(e-Stat)",
    credit: "このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用しています",
  },
};

describe("HousingStatsByDirection（判定を渡したとき）", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RESPONSE })),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(
    props: Partial<React.ComponentProps<typeof HousingStatsByDirection>>,
  ) {
    await act(async () => {
      root.render(
        <HousingStatsByDirection
          lat={35.68}
          lon={139.69}
          radiusKm={150}
          hasBase
          nodeMapping="traditional"
          {...props}
        />,
      );
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  it("判定を渡すと開いている順に並び、段階の札が付く", async () => {
    await render({
      verdicts: {
        N: { tier: "X", blocked: false },
        E: { tier: "S", blocked: false },
        S: { tier: "C", blocked: false },
        W: { tier: "A", blocked: true },
      },
    });
    const badges = [...container.querySelectorAll("[data-tier]")];
    /* 東（S）→ 南（C）→ 北（X）→ 判定なし 4 方位 → 西（天中殺） */
    expect(badges.map((b) => b.getAttribute("data-tier"))).toEqual([
      "S",
      "C",
      "X",
      "none",
      "none",
      "none",
      "none",
      "blocked",
    ]);
    expect(badges[0].textContent).toBe("三盤吉");
    expect(badges[7].textContent).toBe("天中殺");
    /* 開いているのは東と南だけ */
    expect(
      badges.map((b) => b.getAttribute("data-open")).filter((v) => v === "1"),
    ).toHaveLength(2);
  });

  it("判定を渡さなければ八方位の順のまま、札も出ない", async () => {
    await render({});
    expect(container.querySelector("[data-tier]")).toBeNull();
    const heads = [...container.querySelectorAll("span.text-xs.font-bold")].map(
      (s) => s.textContent,
    );
    expect(heads.slice(0, 3)).toEqual(["北", "北東", "東"]);
  });

  it("方位で絞ると、その方位だけを最初から開いて出す", async () => {
    await render({ selectedDirection: "S" });
    const text = container.textContent ?? "";
    expect(text).toContain("南の街");
    expect(text).not.toContain("西の街");
    const btn = container.querySelector("button[aria-expanded]");
    expect(btn?.getAttribute("aria-expanded")).toBe("true");
  });

  it("届いた応答を親に渡す（方位ごとの街の数を上の一覧に入れるため）", async () => {
    const onData = vi.fn();
    await render({ onData });
    expect(onData).toHaveBeenCalledTimes(1);
    expect(countByDirection(onData.mock.calls[0][0].directions)).toMatchObject({
      N: 1,
      E: 2,
      S: 3,
      W: 4,
      NE: 0,
    });
  });
});
