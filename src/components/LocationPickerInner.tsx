"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, Marker, ScaleControl, useMap } from "react-leaflet";
import { applyLeafletDefaultIcon } from "@/lib/leafletDefaultIcon";
import "leaflet/dist/leaflet.css";
import { CurrentLocationControl } from "@/components/map/CurrentLocationControl";
import { InvalidateMapSize } from "@/components/map/InvalidateMapSize";
import { useMapTheme } from "@/lib/useMapTheme";
import { StandardBaseTile } from "@/components/map/StandardBaseTile";
import { MapClickPicker } from "@/components/map/MapClickPicker";
import type { WatchedPosition } from "@/lib/useWatchedPosition";

// Fix typical Leaflet icon issue
applyLeafletDefaultIcon();

/**
 * 選んだ点を視野に入れる。**画面の中で押したときは動かさない。**
 *
 * 以前は選ぶたびに `setView` で中心に寄せていたので、端のほうを
 * 押すと地図がそのぶん跳ねた。続けて隣を押したい操作（建物を
 * 探しながら位置を詰める）と噛み合わない。外から座標が変わった
 * とき（地名で選び直した、郵便番号を入れた）だけ寄せる。
 */
function SyncMapCenter({ markerPos }: { markerPos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!markerPos) return;
    if (map.getBounds().contains(markerPos)) return;
    map.setView(markerPos, map.getZoom() < 6 ? 6 : map.getZoom());
  }, [markerPos, map]);
  return null;
}

interface LocationPickerInnerProps {
  initialLat: number;
  initialLon: number;
  onSelect: (lat: number, lng: number) => void;
  /**
   * 測位のたびに呼ぶ。**これを受けても座標は入らない。**現在地を
   * 「決める」かどうかは使う側が利用者に押させること（下の註）。
   */
  onCurrentPosition?: (position: WatchedPosition) => void;
}

export default function LocationPickerInner({
  initialLat,
  initialLon,
  onSelect,
  onCurrentPosition,
}: LocationPickerInnerProps) {
  const [isMounted, setIsMounted] = useState(false);
  const { mapTheme, toggleMapTheme } = useMapTheme();

  /*
    **印は state で持たない。渡された座標そのもの。**

    以前は `useState` の初期値に props を写していたので、開いたあとに
    外から座標が変わっても（地名で選び直す、郵便番号を入れる、緯度経度を
    打ち直す）印が前の場所に残っていた。値は新しいのに地図は古い、という
    食い違いを利用者が見る。

    呼び出し側（PlaceInput・ホームの目的地タブ・資産マップ）は 3 つとも
    `onSelect` の結果をそのまま `initialLat` / `initialLon` に返してくるので、
    導出にすれば必ず一致する。**写しを持たなければずれようがない。**
  */
  const markerPos: [number, number] | null =
    initialLat !== 0 || initialLon !== 0 ? [initialLat, initialLon] : null;

  /* 明暗の読み出しと購読は useMapTheme に寄せた（5 か所に同じ 15 行が
     写されていた）。ここに残るのは「描画に入ったか」だけ。 */
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-500">
        地図を読み込んでいます…
      </div>
    );
  }

  const initialCenter = markerPos || [35.6812, 139.7671];
  const initialZoom = markerPos ? 14 : 4;

  /*
    isolate を外さないこと。`relative` は z-index が auto なので重ね合わせ
    文脈を作らず、Leaflet の枠（.leaflet-pane 400・コントロール 1000）と
    この器に重ねている札（z-[1000]）が頁全体まですり抜ける。メニューは
    z-[46] なので地図が前に出て、開いたメニューを覆う（#694 の Android 報告）。
  */
  return (
    <div className="isolate relative h-full w-full overflow-hidden rounded-xl border border-stone-200">
      <MapContainer
        key="location-picker-map"
        center={initialCenter}
        zoom={initialZoom}
        maxZoom={20}
        style={{
          height: "100%",
          width: "100%",
          /* タイルの無いところの地色。黒（#09090b）だと、読み込みの
             あいだ穴が開いたように見える。明るいほうへ寄せる。 */
          background: mapTheme === "dark" ? "#1c1917" : "#f5f5f4",
          zIndex: 0,
        }}
      >
        <StandardBaseTile />
        {/* 器が広がったぶんのタイルを敷き直す。折りたたみの中で開くと、
            これが無いと広がった側が地色のまま残る */}
        <InvalidateMapSize />
        <SyncMapCenter markerPos={markerPos} />
        <MapClickPicker onPick={onSelect} />
        <ScaleControl position="bottomleft" imperial={false} />
        {/* 現在地。**自動では座標を入れない。**入れてしまうと、測位の
            たびに利用者が選んだ地点が上書きされる。今どこに居るかを
            見て、そこを地図で指してもらうか、使う側が出す「ここにする」
            を押してもらう（`onCurrentPosition`）。 */}
        <CurrentLocationControl
          corner="bottomright"
          onPosition={onCurrentPosition}
        />
        {/* 押せる目印ではない（吹き出しも handler も持たない）。選ぶのは
            地図そのものなので、キーボードの巡回からは外す */}
        {markerPos && <Marker position={markerPos} keyboard={false} />}
      </MapContainer>

      <div className="pointer-events-none absolute top-2 left-2 z-[1000] max-w-[min(20rem,calc(100%-6rem))] rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 text-xs leading-snug font-medium text-stone-700 shadow-sm backdrop-blur-sm">
        {markerPos
          ? "押した場所が選び直されます"
          : "地図を押すと、その地点になります"}
      </div>

      <div className="absolute top-2 right-2 z-[1000]">
        <button
          type="button"
          onClick={() => {
            toggleMapTheme();
          }}
          className="flex cursor-pointer items-center gap-1 rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
        >
          {mapTheme === "dark" ? "☀️ 明るく" : "🌙 暗く"}
        </button>
      </div>
    </div>
  );
}
