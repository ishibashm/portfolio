"use client";
import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import { StandardBaseTile } from "@/components/map/StandardBaseTile";
import { InvalidateMapSize } from "@/components/map/InvalidateMapSize";
import { evaluateSpot } from "@/lib/spotEvaluation";
import { directionUnstableNote } from "@/lib/directionDistance";
import { DIRECTION_LABELS } from "@/utils/directionGeo";
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import type { DayKigaku } from "@/lib/dayKigakuClient";
import type { EmailListing } from "@/lib/listingDetails";
import type { ListingMapPoint, MappedListing } from "@/lib/listingCandidateMap";

applyLeafletDefaultIcon();
export type ImportedMapProps = {
  mapped: MappedListing[];
  origin?: ListingMapPoint;
  board?: DayKigaku;
  useClassical: boolean;
  onSelect: (listing: EmailListing) => void;
};

export function ListingMapPopup({
  listing,
  point,
  origin,
  board,
  useClassical,
  onSelect,
}: MappedListing & Omit<ImportedMapProps, "mapped">) {
  const result = origin
    ? evaluateSpot(
        origin.lat,
        origin.lon,
        point.lat,
        point.lon,
        useClassical,
        board?.byDirection,
      )
    : null;
  const cell = result?.cell;
  const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
  return (
    <div className="space-y-1 text-xs">
      <strong>{listing.propertyName || "名称なし"}</strong>
      <p>
        賃料: {listing.rentYen == null ? "不明" : yen(listing.rentYen)} /
        管理費・共益費:{" "}
        {listing.managementFeeYen == null
          ? "不明"
          : yen(listing.managementFeeYen)}
      </p>
      <p>
        間取り: {listing.layout ?? "不明"} / 面積:{" "}
        {listing.floorAreaM2 == null ? "不明" : `${listing.floorAreaM2}m²`}
      </p>
      <p>
        {listing.nearestStation ?? "駅情報なし"}
        {listing.walkMinutes == null ? "" : ` 徒歩${listing.walkMinutes}分`}
      </p>
      <p>{listing.address}</p>
      {result ? (
        <>
          <p>
            方位: {DIRECTION_LABELS[result.direction] ?? result.direction} /
            真北 {result.bearingDeg.toFixed(1)}° / 約
            {result.distanceKm.toFixed(1)}km
          </p>
          <p>
            {cell
              ? (TIER_LABELS[cell.tier as DayTier] ?? cell.tier)
              : "生年月日・対象日を設定すると盤を表示します。"}
          </p>
          {cell?.blocked && <p>天中殺により移動を避ける扱いです。</p>}
          {cell?.doyouSatsu && <p>土用殺の方位です。</p>}
          {directionUnstableNote(result.distanceKm) && (
            <p>{directionUnstableNote(result.distanceKm)}</p>
          )}
        </>
      ) : (
        <p>
          {origin
            ? "出発地と同じ位置のため方位を判定できません。"
            : "出発地を設定すると方位・盤を表示します。"}
        </p>
      )}
      <p>GSIの概算位置です。保存前に地図で位置を確認してください。</p>
      <button
        type="button"
        className="underline font-bold"
        onClick={() => onSelect(listing)}
      >
        この物件を既存入力へ
      </button>
    </div>
  );
}
function FitListings({
  mapped,
  origin,
}: Pick<ImportedMapProps, "mapped" | "origin">) {
  const map = useMap();
  const points = JSON.stringify([
    ...mapped.map(({ point }) => [point.lat, point.lon]),
    ...(origin ? [[origin.lat, origin.lon]] : []),
  ]);
  useEffect(() => {
    const bounds: [number, number][] = JSON.parse(points);
    if (bounds.length)
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
  }, [map, points]);
  return null;
}
export default function ImportedListingMapInner(props: ImportedMapProps) {
  const first = props.mapped[0]?.point ?? props.origin;
  if (!first) return null;
  return (
    <MapContainer
      center={[first.lat, first.lon]}
      zoom={12}
      className="h-96 w-full rounded-lg"
      aria-label="取り込み物件の地図"
    >
      <StandardBaseTile />
      <InvalidateMapSize />
      <FitListings mapped={props.mapped} origin={props.origin} />
      {props.origin && (
        <CircleMarker
          center={[props.origin.lat, props.origin.lon]}
          radius={9}
          pathOptions={{ color: "#b45309", fillOpacity: 0.8 }}
        >
          <Popup>出発地</Popup>
        </CircleMarker>
      )}
      {props.mapped.map(({ listing, point }) => (
        <Marker
          key={listing.url}
          position={[point.lat, point.lon]}
          title={listing.propertyName ?? "取り込み物件"}
        >
          <Popup>
            <ListingMapPopup {...props} listing={listing} point={point} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
