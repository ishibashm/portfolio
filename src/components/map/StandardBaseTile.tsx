"use client";

import { TileLayer } from "react-leaflet";
import { BASE_MAPS, DARK_TILE_CLASS } from "@/lib/baseMapLayers";
import { useMapTheme } from "@/lib/useMapTheme";

/**
 * 地理院の標準地図を敷く層。**4 か所に同じ 10 行が写されていた。**
 *
 * MagneticMapInner・LocationPickerInner・SimulatorMap・PastMoveMap の
 * 4 つが、key・url・className・attribution・maxZoom・maxNativeZoom を
 * まったく同じに書いていた（ダークの作り方を説明したコメントごと）。
 *
 * 下地は「どの地図でも同じであるべきもの」なので、部品にする。
 * 明暗も自分で引く（useMapTheme）ので、使う側は 1 行置くだけでよい。
 *
 * ArbitrageMapInner だけは下地を選べる（淡色・写真・地形）ので、
 * この部品は使わない。**選べる地図と選べない地図の違いは残す。**
 * 無理に 1 つにすると、選択肢を持たない画面にまで切り替えの都合が
 * 混ざる。
 */
export function StandardBaseTile() {
  const { mapTheme } = useMapTheme();

  return (
    <TileLayer
      key={`tile-layer-${mapTheme}`}
      url={BASE_MAPS.std.url}
      /* ダークは CSS の反転で作る。CARTO の dark_all は鍵なしの
         ラスタ配信に「API key required」の透かしが入るようになった
         （lib/baseMapLayers の経緯を見ること）。 */
      className={mapTheme === "dark" ? DARK_TILE_CLASS : undefined}
      attribution={BASE_MAPS.std.attribution}
      maxZoom={BASE_MAPS.std.maxZoom}
      maxNativeZoom={BASE_MAPS.std.maxNativeZoom}
    />
  );
}

export default StandardBaseTile;
