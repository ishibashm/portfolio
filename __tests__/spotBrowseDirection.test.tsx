import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 調べた地点の札から、同じ方位の街の一覧へ行けること。
 *
 * 住所を 1 つ調べた人が「同じ方位で他に無いか」を見るには、
 * 「方位ごとの街」まで戻って方位の帯を押し直す必要があった。札に
 * 「東の他の街を見る →」を置き、頁がその方位に絞って一覧へ送る。
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

const dirKigaku = Object.fromEntries(
  (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const).map((d) => [
    d,
    {
      direction: d,
      directionLabel: {
        N: "北",
        NE: "北東",
        E: "東",
        SE: "南東",
        S: "南",
        SW: "南西",
        W: "西",
        NW: "北西",
      }[d],
      tier: "B",
      blocked: false,
    },
  ]),
);

describe("調べた地点の札から同じ方位の街へ", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("「東の他の街を見る →」で方位の記号を渡す", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    const onBrowseDirection = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        dirKigaku={dirKigaku}
        onBrowseDirection={onBrowseDirection}
        requestedPoint={{ ...NAGOYA, seq: 1, name: "愛知県名古屋市" }}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "東の他の街を見る →" }),
    );
    expect(onBrowseDirection).toHaveBeenCalledWith("E");
  });

  it("頁が渡さなければ出さない", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 404 }),
    );
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        dirKigaku={dirKigaku}
        requestedPoint={{ ...NAGOYA, seq: 1, name: "愛知県名古屋市" }}
      />,
    );
    await screen.findByText("東");
    expect(screen.queryByRole("button", { name: /の他の街を見る/ })).toBeNull();
  });
});

describe("物件検索の頁: 方位に絞って一覧へ送る", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/relocation/arbitrage/page.tsx"),
    "utf8",
  );

  it("「方位ごとの街」の器に id があり、onBrowseDirection が絞ってそこへ送る", () => {
    expect(src).toContain('id="arb-towns-section"');
    const m = src.match(/onBrowseDirection=\{\(dir\) => \{[\s\S]*?\}\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("patch({ selectedDirection: dir })");
    expect(m![0]).toContain('getElementById("arb-towns-section")');
  });
});
