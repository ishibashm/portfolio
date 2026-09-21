import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceInput } from "@/components/relocation/PlaceInput";

/**
 * 場所の欄で、**打った住所をそのまま番地まで当てて決められる**こと。
 *
 * ## 何が足りなかったか（利用者の依頼。2026-09-21）
 *
 * 座標が入る経路は「候補をクリック」と「郵便番号 7 桁」の 2 つしか
 * 無かった。候補は国土地理院の住所検索を**町丁目まで**で出すので、
 * 番地まで打った人は**候補に無い**か、町丁目の代表点を掴まされていた。
 * 番地まで当てる `/api/geocode`（#40 で国土地理院優先）はシミュレータや
 * SpotVerdict からは呼んでいたのに、この欄だけ取り残されていた。
 *
 * ここで固定するのは 4 つ。
 *
 * - Enter と「この住所で決める」が `/api/geocode` を引き、座標と地名を
 *   呼び出し側へ渡す（緯度経度の欄は props なので、その瞬間に入る）
 * - 粗い点（source が normalize）で返ったら、その旨を出す。**手段は
 *   「緯度経度を直接入れる」**（この欄に地図は無い）
 * - 404 は API の文言をそのまま出す（URL を貼った人に住所の話を返さない）
 * - 日本語入力の変換確定の Enter では引かない
 */

type Body = Record<string, unknown>;

function stubGeocode(status: number, body: Body) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith("/api/geocode?q=")) {
        return { ok: status < 400, status, json: async () => body };
      }
      /* 候補は出さない。この試験は確定の経路だけを見る */
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    }),
  );
  return calls;
}

/* 京都市南区の区役所あたり。利用者の登録内容ではない */
const POINT = { lat: 34.9819, lon: 135.7444 };
const ADDRESS = "京都市南区西九条南田町1";

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaceInput: 住所を打って決める", () => {
  it("Enter で /api/geocode を引き、番地まで当てた座標と地名を渡す", async () => {
    const calls = stubGeocode(200, {
      ...POINT,
      name: `京都府${ADDRESS}`,
      source: "gsi",
    });
    const onChange = vi.fn();
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={onChange} />,
    );

    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, { target: { value: ADDRESS } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        POINT.lat,
        POINT.lon,
        `京都府${ADDRESS}`,
      ),
    );
    /* 候補（町丁目まで）ではなく、番地まで当てる口を引いている */
    expect(calls.some((u) => u.startsWith("/api/geocode?q="))).toBe(true);
    expect(calls.some((u) => u.startsWith("/api/geocode/suggest"))).toBe(false);
    /* 決まった地名が出て、粗い点の断りは出ない（gsi は番地まで当たっている） */
    expect(await screen.findByText(`京都府${ADDRESS}`)).toBeTruthy();
    expect(screen.queryByText(/番地まで特定できませんでした/)).toBeNull();
  });

  it("「この住所で決める」ボタンも同じ口を引く", async () => {
    stubGeocode(200, { ...POINT, name: ADDRESS, source: "gsi" });
    const onChange = vi.fn();
    render(
      <PlaceInput
        label="出発地"
        lat={null}
        lon={null}
        onChange={onChange}
        variant="form"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/例:/), {
      target: { value: ADDRESS },
    });
    fireEvent.click(screen.getByRole("button", { name: "この住所で決める" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(POINT.lat, POINT.lon, ADDRESS),
    );
  });

  it("決めた座標は、緯度経度の欄にそのまま入る（props で束縛）", async () => {
    /*
      「緯度経度を入れるものは住所でも正確な地点が入るように」の部分。
      呼び出し側が onChange で受けた値を props に戻す、という
      普通の使い方で確かめる。
    */
    stubGeocode(200, { ...POINT, name: ADDRESS, source: "gsi" });
    function Host() {
      const [p, setP] = React.useState<{ lat: number; lon: number } | null>(
        null,
      );
      return (
        <PlaceInput
          label="出発地"
          lat={p?.lat ?? null}
          lon={p?.lon ?? null}
          onChange={(lat, lon) => setP({ lat, lon })}
        />
      );
    }
    render(<Host />);

    fireEvent.click(screen.getByText(/緯度経度を直接入れる/));
    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, { target: { value: ADDRESS } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(
        (screen.getByPlaceholderText("緯度") as HTMLInputElement).value,
      ).toBe(String(POINT.lat));
      expect(
        (screen.getByPlaceholderText("経度") as HTMLInputElement).value,
      ).toBe(String(POINT.lon));
    });
  });

  it("粗い点（normalize）なら断りを出す。手段は緯度経度（地図は無い）", async () => {
    stubGeocode(200, { ...POINT, name: ADDRESS, source: "normalize" });
    const onChange = vi.fn();
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, { target: { value: ADDRESS } });
    fireEvent.keyDown(input, { key: "Enter" });

    const note = await screen.findByText(/番地まで特定できませんでした/);
    expect(note.textContent).toContain("緯度経度を直接入れる");
    expect(note.textContent).not.toContain("地図をクリック");
    /* 粗くても点は渡す。使うかどうかは利用者が断りを読んで決める */
    expect(onChange).toHaveBeenCalledWith(POINT.lat, POINT.lon, ADDRESS);
  });

  it("404 は API の文言をそのまま出し、座標は渡さない", async () => {
    const msg =
      "この URL は京都府までしか指していません。市区町村名で入れてください。";
    stubGeocode(404, { error: msg });
    const onChange = vi.fn();
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, {
      target: { value: "https://example.com/kyoto/" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText(msg)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("日本語入力の変換確定の Enter では引かない", async () => {
    const calls = stubGeocode(200, { ...POINT, name: ADDRESS, source: "gsi" });
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, { target: { value: "きょうと" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    /* 候補の効果は 400ms 待ってから引く。その前に確認する */
    expect(calls.some((u) => u.startsWith("/api/geocode?q="))).toBe(false);
  });

  it("郵便番号らしき入力は Enter でも引かない（郵便番号の経路に任せる）", async () => {
    const calls = stubGeocode(200, { ...POINT, name: ADDRESS, source: "gsi" });
    render(
      <PlaceInput label="出発地" lat={null} lon={null} onChange={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText(/例:/);
    fireEvent.change(input, { target: { value: "601-8001" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(calls.some((u) => u.startsWith("/api/geocode?q="))).toBe(false);
    expect(
      screen.queryByRole("button", { name: "この住所で決める" }),
    ).toBeNull();
  });
});
