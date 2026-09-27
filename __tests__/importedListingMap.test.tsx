import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportedMapProps } from "@/components/relocation/ImportedListingMapInner";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  compute: vi.fn(),
  props: vi.fn(),
}));
vi.mock("@/lib/userSettings", async (original) => ({
  ...(await original<typeof import("@/lib/userSettings")>()),
  loadSettings: mocks.load,
}));
vi.mock("@/lib/dayKigakuClient", () => ({ computeDayKigaku: mocks.compute }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function TestMap(props: ImportedMapProps) {
      mocks.props(props);
      return (
        <div data-testid="map">
          {props.mapped.map(({ listing }) => (
            <button key={listing.url} onClick={() => props.onSelect(listing)}>
              {listing.propertyName}を地図から選択
            </button>
          ))}
        </div>
      );
    },
}));
import { ImportedListingMap } from "@/components/relocation/ImportedListingMap";
const listings = [
  {
    url: "https://example.com/1",
    propertyName: "サンプル1",
    address: "架空市1丁目",
  },
  {
    url: "https://example.com/2",
    propertyName: "サンプル2",
    address: "架空市1丁目",
  },
  { url: "https://example.com/3", propertyName: "サンプル3" },
];
beforeEach(() => {
  mocks.load.mockResolvedValue({ settings: {} });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      results: [{ address: "架空市1丁目", point: { lat: 35, lon: 135 } }],
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("sends only deduplicated addresses, wires settings into existing board, selects without saving", async () => {
  mocks.load.mockResolvedValue({
    settings: {
      base_lat: 34,
      base_lon: 134,
      birth_date: "1990-01-10",
      target_date: "2026-10-05",
      use_classical_board: false,
      tenchusatsu_mode: "strict",
      direction_filter_mode: "composite",
      involuntary_move: true,
    },
  });
  const board = { byDirection: {}, byPrefecture: {} };
  mocks.compute.mockReturnValue(board);
  const onSelect = vi.fn();
  render(<ImportedListingMap listings={listings} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  await screen.findByTestId("map");
  await waitFor(() =>
    expect(mocks.compute).toHaveBeenCalledWith({
      baseLat: "34",
      baseLon: "134",
      birthDate: "1990-01-10",
      targetDate: "2026-10-05",
      useClassical: false,
      tenchusatsuMode: "strict",
      directionFilterMode: "composite",
      involuntaryMove: true,
    }),
  );
  await waitFor(() =>
    expect(mocks.props).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: { lat: 34, lon: 134 },
        board,
        useClassical: false,
      }),
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
    "/api/relocation/candidates/geocode/batch",
  );
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
    addresses: ["架空市1丁目"],
  });
  expect(screen.getByText("住所なし（1件）")).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("サンプル1を地図から選択"));
  expect(onSelect).toHaveBeenCalledWith(listings[0]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("disabled geocoding keeps the list and a clear Japanese explanation", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ code: "GEOCODE_DISABLED" }, { status: 503 }),
  );
  render(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  expect(
    await screen.findByText(
      "地図表示は準備中です。下の一覧から物件を選んでください。",
    ),
  ).toBeTruthy();
  expect(screen.queryByTestId("map")).toBeNull();
  expect(screen.getByText("位置未確定（2件）")).toBeTruthy();
  expect(screen.getByText("住所なし（1件）")).toBeTruthy();
});
it("failed geocoding stays unresolved and addressless listings never make a request", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"));
  const view = render(
    <ImportedListingMap listings={[listings[2]]} onSelect={vi.fn()} />,
  );
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  expect(await screen.findByText(/位置を検索できませんでした/)).toBeTruthy();
  expect(screen.getByText("位置未確定（2件）")).toBeTruthy();
});
it("caps requested addresses and keeps excess listings unresolved", async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    url: `https://example.com/${i}`,
    address: `架空市${i + 1}丁目`,
  }));
  render(<ImportedListingMap listings={many} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  await screen.findByTestId("map");
  expect(
    JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).addresses,
  ).toHaveLength(10);
  expect(screen.getByText(/先頭の10住所/)).toBeTruthy();
  expect(screen.getByText("位置未確定（11件）")).toBeTruthy();
});
it("discards a stale response after the imported addresses change", async () => {
  let finish!: (r: Response) => void;
  vi.mocked(fetch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ results: [] }));
  const view = render(
    <ImportedListingMap listings={[listings[0]]} onSelect={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  view.rerender(
    <ImportedListingMap
      listings={[{ ...listings[0], address: "架空市2丁目" }]}
      onSelect={vi.fn()}
    />,
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  finish(
    Response.json({
      results: [{ address: "架空市1丁目", point: { lat: 35, lon: 135 } }],
    }),
  );
  await waitFor(() =>
    expect(screen.queryByText("住所の位置を検索中…")).toBeNull(),
  );
  expect(screen.queryByTestId("map")).toBeNull();
  expect(screen.getByText("位置未確定（1件）")).toBeTruthy();
});
it("does not send any address before the button is pressed, and says where it goes", async () => {
  /* 2026-09-27。#1550 の初版は取り込んだ直後に黙って国土地理院へ送っていた */
  render(<ImportedListingMap listings={listings} onSelect={vi.fn()} />);
  await waitFor(() => expect(mocks.load).toHaveBeenCalled());
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText(/国土地理院の住所検索に送って/)).toBeTruthy();
  expect(
    screen.getByText(/URL・メール本文・生年月日は送りません/),
  ).toBeTruthy();
  expect(screen.queryByText("住所の位置を検索中…")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "地図に表示する" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});
