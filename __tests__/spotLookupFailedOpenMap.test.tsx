import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SpotVerdict } from "@/components/relocation/SpotVerdict";

/**
 * 住所が引けなかったとき、その場から地図へ行けること。
 *
 * 候補の欄の住所検索は、運営者が開くまで API が
 * 「住所検索は準備中です。地図をクリックするか座標を入力してください。」
 * を返す（LISTING_CANDIDATE_GSI_ENABLED）。狭い画面では地図は欄の下に
 * あり、「地図をクリック」と言われてもどこか分からない。失敗の文の
 * 横に「地図で場所を指定する →」を置いて、頁が地図へ寄せる。
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
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

describe("住所が引けなかったとき", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("API の文言をそのまま出し、「地図で場所を指定する →」で頁が地図へ寄せる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error:
            "住所検索は準備中です。地図をクリックするか座標を入力してください。",
        }),
        { status: 503 },
      ),
    );
    const onOpenMap = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        candidateContext={context}
        onOpenMap={onOpenMap}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "愛知県名古屋市中村区名駅1丁目" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    await screen.findByText(/住所検索は準備中です/);
    fireEvent.click(
      screen.getByRole("button", { name: "地図で場所を指定する →" }),
    );
    expect(onOpenMap).toHaveBeenCalledTimes(1);
  });

  it("頁が地図を持っていなければボタンは出さない", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "見つかりません" }), {
        status: 422,
      }),
    );
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        candidateContext={context}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "愛知県名古屋市中村区名駅1丁目" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    await screen.findByText(/見つかりません/);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "地図で場所を指定する →" }),
      ).toBeNull(),
    );
  });
});
