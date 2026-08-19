"use client";

import { TileLayer } from "react-leaflet";
import {
  HAZARD_TABS,
  HAZARD_MAX_NATIVE_ZOOM,
  HAZARD_OPACITY,
  type HazardTabId,
} from "@/lib/hazardLayers";

/**
 * 選ばれたハザードのタイルを地図に重ねる。
 *
 * MapContainer の中に置くこと（react-leaflet の TileLayer は
 * 地図の文脈が無いと描けない）。"none" なら何も描かない。
 *
 * key に url を使うのは、タブを替えたときに Leaflet へ「別のレイヤー」
 * だと伝えるため。同じ TileLayer を使い回すと前のタイルが残る。
 */
export function HazardTileOverlay({ tab }: { tab: HazardTabId }) {
  if (tab === "none") return null;

  return (
    <>
      {HAZARD_TABS[tab].layers.map((layer) => (
        <TileLayer
          key={layer.url}
          url={layer.url}
          attribution={layer.attribution}
          opacity={HAZARD_OPACITY}
          maxNativeZoom={HAZARD_MAX_NATIVE_ZOOM}
          maxZoom={20}
        />
      ))}
    </>
  );
}
