import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportedMapProps } from "@/components/relocation/ImportedListingMapInner";
import { stackByPoint } from "@/components/relocation/ImportedListingMapInner";
import { MUNICIPALITY_POINTS } from "@/lib/municipalityCoords";
import { municipalityFromAddress } from "@/lib/municipalityFromAddress";

/**
 * メールから取り込んだ物件に、**外へ送らずに**市区町村の代表点で
 * ピンを立てる（利用者の指摘、2026-09-29「メール取り込みで物件の位置が
 * ピンで立つように」）。
 *
 * 取り込みの地図は国土地理院の住所検索（LISTING_CANDIDATE_GSI_ENABLED）
 * でしか位置を引いておらず、旗が OFF の本番では押しても
 * 「地図表示は準備中です」で 1 本もピンが立たなかった。
 *
 * 守ること:
 * - 手元の表で引けた物件は、**押す前から**地図に出る。そのとき fetch は
 *   1 回も呼ばれない（押すまで外へ送らない、という #1552 の約束のまま）
 * - 押すと番地の検索に進み、引けたものは番地の位置が勝つ
 * - 国土地理院が無効でも、代表点のピンは消えない
 * - 県が無く 2 県にまたがる名前（府中市）は引かない
 */

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  props: vi.fn(),
}));
vi.mock("@/lib/userSettings", async (original) => ({
  ...(await original<typeof import("@/lib/userSettings")>()),
  loadSettings: mocks.load,
}));
vi.mock("@/lib/dayKigakuClient", () => ({ computeDayKigaku: vi.fn() }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function TestMap(props: ImportedMapProps) {
      mocks.props(props);
      return <div data-testid="map">{props.mapped.length}件</div>;
    },
}));
import { ImportedListingMap } from "@/components/relocation/ImportedListingMap";

describe("住所から市区町村を引く", () => {
  const cityOf = (a: string) => {
    const p = municipalityFromAddress(a, MUNICIPALITY_POINTS);
    return p ? `${p.pref}${p.city}` : null;
  };

  it.each([
    ["東京都世田谷区三軒茶屋1-2-3", "東京都世田谷区"],
    ["神奈川県横浜市港北区日吉1", "神奈川県横浜市港北区"],
    ["横浜市港北区日吉1", "神奈川県横浜市港北区"],
    ["北海道札幌市中央区北1条", "北海道札幌市中央区"],
    ["北海道倶知安町南1条", "北海道虻田郡倶知安町"],
    ["千葉県鎌ケ谷市道野辺", "千葉県鎌ヶ谷市"],
    ["東京都府中市宮町1", "東京都府中市"],
    ["大阪府大阪市中央区本町", "大阪府大阪市中央区"],
  ])("%s → %s", (address, city) => {
    expect(cityOf(address)).toBe(city);
  });

  it.each([
    ["府中市宮町1", "東京都と広島県の両方にある"],
    ["横浜市", "区まで書いていない（区の代表点しか持っていない）"],
    ["架空市1丁目", "表に無い"],
    ["", "空"],
  ])("%s は引かない（%s）", (address) => {
    expect(cityOf(address)).toBeNull();
  });
});

describe("同じ位置の物件は 1 本のピンにまとめる", () => {
  it("同じ点は 1 組、違う点は別の組", () => {
    const at = (url: string, lat: number) => ({
      listing: { url },
      point: { lat, lon: 139 },
    });
    const stacks = stackByPoint([at("a", 35), at("b", 35), at("c", 36)]);
    expect(stacks.map((s) => s.map((m) => m.listing.url))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });
});

describe("取り込み物件の地図", () => {
  const listings = [
    {
      url: "https://example.com/1",
      propertyName: "世田谷の部屋",
      address: "東京都世田谷区三軒茶屋1-2-3",
    },
    {
      url: "https://example.com/2",
      propertyName: "架空の部屋",
      address: "架空市1丁目",
    },
  ];

  beforeEach(() => {
    mocks.load.mockResolvedValue({ settings: {} });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ code: "GEOCODE_DISABLED" }, { status: 503 }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("押す前から代表点のピンが立ち、fetch は呼ばれない", async () => {
    render(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
    await screen.findByTestId("map");
    const props = mocks.props.mock.lastCall![0] as ImportedMapProps;
    expect(props.mapped).toHaveLength(1);
    expect(props.mapped[0].listing.url).toBe("https://example.com/1");
    expect(props.mapped[0].point.municipality).toBe("東京都世田谷区");
    expect(screen.getByText(/1件のピンは市区町村の代表点です/)).toBeTruthy();
    expect(screen.getByText("位置未確定（1件）")).toBeTruthy();
    expect(screen.getByRole("button", { name: "番地まで調べる" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("国土地理院が無効でも代表点のピンは消えない", async () => {
    render(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "番地まで調べる" }),
    );
    expect(
      await screen.findByText(
        "番地までの位置検索は準備中です。地図のピンは市区町村の代表点です。",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("map")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("番地まで引けたものは番地の位置が勝つ", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        results: [
          {
            address: "東京都世田谷区三軒茶屋1-2-3",
            point: { lat: 35.643, lon: 139.67 },
          },
        ],
      }),
    );
    render(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "番地まで調べる" }),
    );
    await waitFor(() => {
      const props = mocks.props.mock.lastCall![0] as ImportedMapProps;
      expect(props.mapped[0].point).toEqual({ lat: 35.643, lon: 139.67 });
    });
    expect(screen.queryByText(/件のピンは市区町村の代表点です/)).toBeNull();
  });
});
