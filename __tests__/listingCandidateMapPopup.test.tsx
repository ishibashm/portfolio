import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), fitBounds: vi.fn() }));
vi.mock("@/lib/spotEvaluation", () => ({ evaluateSpot: mocks.evaluate }));
vi.mock("@/lib/leafletDefaultIcon", () => ({
  applyLeafletDefaultIcon: vi.fn(),
}));
vi.mock("@/components/map/StandardBaseTile", () => ({
  StandardBaseTile: () => null,
}));
vi.mock("@/components/map/InvalidateMapSize", () => ({
  InvalidateMapSize: () => null,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Marker: ({
    children,
    position,
  }: {
    children: ReactNode;
    position: number[];
  }) => (
    <div data-testid="pin" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  CircleMarker: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: mocks.fitBounds }),
}));
import MapInner, {
  ListingMapPopup,
} from "@/components/relocation/ImportedListingMapInner";
const listing = {
  url: "https://example.com/property",
  propertyName: "サンプル物件",
  rentYen: 90000,
  managementFeeYen: 0,
  layout: "2LDK",
  floorAreaM2: 50.2,
  nearestStation: "架空駅",
  walkMinutes: 3,
  address: "架空市1丁目",
};
const point = { lat: 35, lon: 135 };
const origin = { lat: 34, lon: 134 };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("formats facts and calls the shared evaluator with the same origin, board and board mode", () => {
  const cell = {
    direction: "NE",
    directionLabel: "北東",
    tier: "S",
    blocked: true,
    doyouSatsu: true,
  };
  const board = { byDirection: { NE: cell }, byPrefecture: {} };
  mocks.evaluate.mockReturnValue({
    direction: "NE",
    bearingDeg: 45,
    distanceKm: 145,
    cell,
  });
  const onSelect = vi.fn();
  render(
    <ListingMapPopup
      listing={listing}
      point={point}
      origin={origin}
      board={board}
      useClassical={false}
      onSelect={onSelect}
    />,
  );
  expect(mocks.evaluate).toHaveBeenCalledWith(
    34,
    134,
    35,
    135,
    false,
    board.byDirection,
  );
  expect(screen.getByText(/90,000円.*0円/)).toBeTruthy();
  expect(screen.getByText(/2LDK.*50.2m²/)).toBeTruthy();
  expect(screen.getByText(/架空駅 徒歩3分/)).toBeTruthy();
  expect(screen.getByText(/北東/)).toBeTruthy();
  expect(screen.getByText("三盤吉")).toBeTruthy();
  expect(screen.getByText(/天中殺/)).toBeTruthy();
  expect(screen.getByText(/土用殺/)).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "この物件を既存入力へ" }));
  expect(onSelect).toHaveBeenCalledWith(listing);
});
it("shows missing facts and origin without inventing a board or station walk time", () => {
  render(
    <ListingMapPopup
      listing={{ url: listing.url, nearestStation: "架空駅 バス15分" }}
      point={point}
      useClassical
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText("名称なし")).toBeTruthy();
  expect(screen.getByText(/出発地を設定/)).toBeTruthy();
  expect(screen.queryByText(/徒歩/)).toBeNull();
  expect(mocks.evaluate).not.toHaveBeenCalled();
});
it("places one pin for each listing and an origin marker, and fits the same points", () => {
  mocks.evaluate.mockReturnValue(null);
  render(
    <MapInner
      mapped={[
        { listing, point },
        { listing: { ...listing, url: "https://example.com/2" }, point },
      ]}
      origin={origin}
      useClassical
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getAllByTestId("pin")).toHaveLength(2);
  expect(screen.getByText("出発地")).toBeTruthy();
  expect(mocks.fitBounds).toHaveBeenCalledWith(
    [
      [35, 135],
      [35, 135],
      [34, 134],
    ],
    { padding: [32, 32], maxZoom: 16 },
  );
});
