import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 保存した候補を「現在の条件で再判定」で開いたとき（?candidate=）の断りは、
 * 失敗の文ではない。
 *
 * error に入れていたので赤字で出て、#1638 からは失敗の文の横に付く
 * 「地図で場所を指定する →」まで並び、再判定が失敗したように読めた。
 * 札の先頭の断り（note）として出す。
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };
const context = {
  birthDate: "1990-01-10",
  targetDate: "2026-11-08",
  baseLat: String(KYOTO.lat),
  baseLon: String(KYOTO.lon),
  tenchusatsuMode: "strict",
  involuntaryMove: false,
  directionFilterMode: "composite",
  useClassical: true,
} as const;

describe("保存した候補を開き直したときの断り", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("赤字の失敗ではなく断りとして出し、「地図で場所を指定する →」は付かない", async () => {
    window.history.replaceState(
      null,
      "",
      "/relocation/arbitrage?candidate=0f9d2c2a-1b2c-4d3e-8f4a-5b6c7d8e9f00",
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith("/api/relocation/candidates/0f9d2c2a"))
        return new Response(
          JSON.stringify({
            candidate: {
              ...NAGOYA,
              title: "名駅の部屋",
              url: null,
              memo: null,
              judgment: { source: "pin" },
            },
          }),
        );
      return new Response("{}", { status: 404 });
    });
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        candidateContext={context}
        onOpenMap={() => {}}
      />,
    );
    const note = await screen.findByText(/現在の設定で再判定しています/);
    expect(note.className).not.toMatch(/rose/);
    expect(
      screen.queryByRole("button", { name: "地図で場所を指定する →" }),
    ).toBeNull();
    expect(screen.getByText("名駅の部屋")).toBeTruthy();
  });
});
