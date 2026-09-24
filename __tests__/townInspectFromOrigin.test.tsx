import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { housingStatsByDirection } from "@/lib/housingStatsDirections";
import { HousingStatsByDirection } from "@/components/relocation/HousingStatsByDirection";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 方位で街を選んでいる途中で、**起点が入れ替わらない**こと
 * （利用者の指摘、2026-09-24）。
 *
 *     方位で街を選んだあと、愛知県長久手市から見た方位別のエリアと
 *     家賃相場になるんだけど、京都から東のエリアはどこかで愛知県に
 *     なって、その愛知から見た方位だと、起点とはまた違う方位になる
 *
 * 「方位ごとの街」の街の名前は市区町村ページ（/houi/area/{code}）への
 * リンクだった。あの頁は**その街を起点にした方位**の頁なので、京都から
 * 東で選んだ長久手市を押すと、長久手から見た 8 方位が出る。方位で街を
 * 選んでいる人が知りたいのは、**出発地から見てその街がどう出るか。**
 *
 * 直し方
 *   - 街の名前を押すと「この地点を調べる」に渡す（出発地から見た方位・
 *     距離・吉凶と、その街の SUUMO の一覧）。地図もその街へ寄せる
 *   - 市区町村ページへのリンクは「この街から見た方位」と名乗って残す
 *   - 渡す点は、方位と距離を測った代表点そのもの（API が返す）
 */

/** 京都市南区（公開の代表点）を出発地にする。 */
const KYOTO = { lat: 34.9819, lon: 135.7444 };
/** 長久手市のあたり（公開の代表点）。京都から見て東。 */
const NAGAKUTE = { lat: 35.1837, lon: 137.0488 };

describe("lib: 街 1 件に代表点を持たせる", () => {
  it("方位と距離を測った点そのものを lat / lon で返す", () => {
    const [east] = housingStatsByDirection(
      [
        {
          area_code: "23238",
          area_name: "長久手市",
          total_dwellings: 25000,
          vacant_dwellings: 2000,
          rent_per_tatami_yen: 3000,
          tatami_per_rental: 20,
          floor_area_per_rental: 40,
        },
      ],
      [{ code: "23238", pref: "愛知県", city: "長久手市", ...NAGAKUTE }],
      KYOTO.lat,
      KYOTO.lon,
    ).filter((d) => d.direction === "E");
    const town = east.municipalities[0];
    expect(town.name).toBe("愛知県長久手市");
    expect(town.lat).toBe(NAGAKUTE.lat);
    expect(town.lon).toBe(NAGAKUTE.lon);
  });
});

const RESPONSE = {
  directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d) => ({
    direction: d,
    count: d === "E" ? 1 : 0,
    rentCount: d === "E" ? 1 : 0,
    medianRentPerSqm: d === "E" ? 1852 : null,
    medianMonthlyRentEstimate: null,
    vacancyRate: null,
    vacancyCount: 0,
    nearestKm: d === "E" ? 120 : null,
    topMunicipalities: d === "E" ? ["愛知県長久手市"] : [],
    municipalities:
      d === "E"
        ? [
            {
              code: "23238",
              name: "愛知県長久手市",
              distanceKm: 120,
              bearing: 79,
              ...NAGAKUTE,
              rentPerSqm: 1852,
              vacancyRate: 0.08,
              totalDwellings: 25000,
            },
          ]
        : [],
    truncated: false,
  })),
  meta: {
    municipalitiesScanned: 1,
    dataYear: 2023,
    minKm: 5,
    maxKm: 150,
    nodeMapping: "traditional",
    source: "出典：政府統計の総合窓口(e-Stat)",
    credit: "e-Stat",
  },
};

describe("画面: 街の名前は出発地から見た判定へ渡す", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openEast(
    onInspectTown?: (t: { lat: number; lon: number; name: string }) => void,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => RESPONSE })),
    );
    render(
      <HousingStatsByDirection
        lat={KYOTO.lat}
        lon={KYOTO.lon}
        radiusKm={150}
        hasBase
        nodeMapping="traditional"
        selectedDirection="E"
        onInspectTown={onInspectTown}
      />,
    );
    /* 方位を選んでいると最初から開いている（「街を閉じる」になる） */
    const toggle = await screen.findByRole("button", {
      name: /この方位の街を見る|街を閉じる/,
    });
    if (toggle.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(toggle);
    }
  }

  it("名前を押すと、代表点と名前を渡す（市区町村ページへは飛ばない）", async () => {
    const onInspect = vi.fn();
    await openEast(onInspect);
    const name = await screen.findByRole("button", { name: "愛知県長久手市" });
    fireEvent.click(name);
    expect(onInspect).toHaveBeenCalledWith({
      ...NAGAKUTE,
      name: "愛知県長久手市",
    });
  });

  it("市区町村ページへのリンクは「この街から見た方位」と名乗って残す", async () => {
    await openEast(vi.fn());
    const link = await screen.findByRole("link", {
      name: "この街から見た方位",
    });
    expect(link.getAttribute("href")).toBe("/houi/area/23238");
    expect(screen.getByText(/出発地から見たその街の方位と吉凶/)).toBeTruthy();
  });

  it("渡さなければ今までどおり（名前が市区町村ページへのリンク）", async () => {
    await openEast(undefined);
    const link = await screen.findByRole("link", { name: "愛知県長久手市" });
    expect(link.getAttribute("href")).toBe("/houi/area/23238");
  });
});

describe("「この地点を調べる」: 街の名前つきで受ける", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("入力欄に街の名前が入り、出発地から見た方位（東）を出す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical={true}
        requestedPoint={{ ...NAGAKUTE, seq: 1, name: "愛知県長久手市" }}
        dirKigaku={{
          E: {
            direction: "E",
            directionLabel: "東",
            tier: "S",
            blocked: false,
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(
        (document.getElementById("arb-spot-query") as HTMLInputElement).value,
      ).toBe("愛知県長久手市"),
    );
    expect(screen.getByText("東")).toBeTruthy();
  });
});

describe("物件検索の頁: 街の名前を「この地点を調べる」へつなぐ", () => {
  it("onInspectTown が spotRequest に名前つきで入り、地図と画面を寄せる", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
      "utf8",
    );
    const m = src.match(/<HousingStatsByDirection[\s\S]*?\n\s*\/>/);
    expect(m).not.toBeNull();
    const block = m![0];
    expect(block).toContain("onInspectTown=");
    expect(block).toContain("name: town.name");
    expect(block).toContain('mapFocusKind: "spot"');
    expect(block).toContain('getElementById("arb-spot-section")');
    expect(src).toContain('id="arb-spot-section"');
  });
});
