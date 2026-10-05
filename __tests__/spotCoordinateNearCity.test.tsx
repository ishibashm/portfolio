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
 * 座標だけで指した点（地図のクリック・座標入力）に、一番近い街の名前を
 * 「〇〇市 付近」として添えること。
 *
 * 以前は札の見出しが "35.1815, 136.9066" のままで、どこを調べているのか
 * 画面から読めなかった。逆引き（/api/geocode/reverse）は入口のリンクの
 * ために既に引いていたので、同じ応答の `data.name` を使う。
 *
 * 名前は頁にも知らせる（ピンの吹き出し・目的地の控えに入る）。逆引きが
 * 済むまでは空のまま（座標の字面を地名として覚えない）。
 */

const KYOTO = { lat: 35.0116, lon: 135.7681 };
const NAGOYA = { lat: 35.1815, lon: 136.9066 };

function mockReverse(name: string | null) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.startsWith("/api/geocode/reverse?"))
      return new Response(
        JSON.stringify({
          data: name ? { name } : null,
          /* 入口のリンクが無い街でも名前は出す */
          portal: null,
        }),
      );
    return new Response("{}", { status: 404 });
  });
}

describe("座標だけの点に街の名前を添える", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("座標入力: 札に「〇〇市 付近」と座標の両方が出て、頁には「〇〇市 付近」を知らせる", async () => {
    mockReverse("愛知県名古屋市中村区");
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: `${NAGOYA.lat}, ${NAGOYA.lon}` } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    expect(await screen.findByText("愛知県名古屋市中村区 付近")).toBeTruthy();
    expect(screen.getByText(`${NAGOYA.lat}, ${NAGOYA.lon}`)).toBeTruthy();
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        { lat: NAGOYA.lat, lon: NAGOYA.lon, name: "愛知県名古屋市中村区 付近" },
        false,
      ),
    );
  });

  it("地図のクリック（名前の無い requestedPoint）でも同じ", async () => {
    mockReverse("愛知県名古屋市中村区");
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
        requestedPoint={{ lat: NAGOYA.lat, lon: NAGOYA.lon, seq: 1 }}
      />,
    );
    expect(await screen.findByText("愛知県名古屋市中村区 付近")).toBeTruthy();
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        { lat: NAGOYA.lat, lon: NAGOYA.lon, name: "愛知県名古屋市中村区 付近" },
        true,
      ),
    );
  });

  it("逆引きが返らなければ名前は空のまま（座標を地名として覚えない）", async () => {
    mockReverse(null);
    const onTargetChange = vi.fn();
    render(
      <SpotVerdict
        baseLat={KYOTO.lat}
        baseLon={KYOTO.lon}
        useClassical
        onTargetChange={onTargetChange}
        requestedPoint={{ lat: NAGOYA.lat, lon: NAGOYA.lon, seq: 1 }}
      />,
    );
    await waitFor(() =>
      expect(onTargetChange).toHaveBeenLastCalledWith(
        { lat: NAGOYA.lat, lon: NAGOYA.lon, name: "" },
        true,
      ),
    );
    expect(screen.queryByText(/付近/)).toBeNull();
  });

  it("住所で引いた点（名前がある）には付近を付けない", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith("/api/geocode?"))
        return new Response(
          JSON.stringify({
            ...NAGOYA,
            name: "愛知県名古屋市中村区名駅1丁目",
            source: "gsi",
          }),
        );
      if (u.startsWith("/api/geocode/reverse?"))
        return new Response(
          JSON.stringify({
            data: { name: "愛知県名古屋市中村区" },
            portal: null,
          }),
        );
      return new Response("{}", { status: 404 });
    });
    render(
      <SpotVerdict baseLat={KYOTO.lat} baseLon={KYOTO.lon} useClassical />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "物件URL・住所・座標から調べる" }),
      { target: { value: "愛知県名古屋市中村区名駅1丁目" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "調べる" }));
    expect(
      await screen.findByText("愛知県名古屋市中村区名駅1丁目"),
    ).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/付近/)).toBeNull();
  });
});
