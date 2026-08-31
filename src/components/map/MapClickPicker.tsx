"use client";

import { useMapEvents } from "react-leaflet";

/**
 * 地図をクリックしたら、その座標を返す層。**3 か所の写しを 1 つに。**
 *
 * ## なぜ 1 つにするか（実際に起きた事故）
 *
 * 同じ処理が 3 通りに書かれていた。
 *
 *   ArbitrageMapInner … 操作部品の上のクリックを**除いていた**
 *   MagneticMapInner  … 除いていない
 *   LocationPickerInner … 除いていない
 *
 * 除いていない 2 つは、地図の中に置いたボタン（明暗の切り替え、
 * 現在地）を押しただけで**その真下の座標が選ばれる。**出発地が
 * 勝手に書き換わり、方位の判定まで変わる。#778 で現在地ボタン側の
 * 止め方を入れたが、**根っこは「守りが 1 か所にしか無かった」こと。**
 *
 * ここに寄せておけば、次に地図へ何かを置いたときも守りが効く。
 *
 * ## 何を除くか
 *
 * - .leaflet-control  … 操作部品（ボタン・凡例・現在地）
 * - .leaflet-popup    … 吹き出しの中身
 * - .leaflet-marker-icon … ピン。ピンを押すのは「選び直し」ではない
 */

export interface MapClickPickerProps {
  /** クリックされた地点。操作部品の上のクリックでは呼ばれない。 */
  onPick: (lat: number, lon: number) => void;
}

/** 地図そのものへのクリックか（操作部品・吹き出し・ピンの上でないか）。 */
export function isBareMapClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return !(
    target.closest(".leaflet-control") ||
    target.closest(".leaflet-popup") ||
    target.closest(".leaflet-marker-icon")
  );
}

export function MapClickPicker({ onPick }: MapClickPickerProps) {
  useMapEvents({
    click(e) {
      if (!isBareMapClick(e.originalEvent.target)) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default MapClickPicker;
