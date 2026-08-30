"use client";

import { useEffect, useRef } from "react";
import {
  Circle,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  useWatchedPosition,
  type WatchedPosition,
} from "@/lib/useWatchedPosition";

/**
 * 現在地を出し、移動に追従する層。**どの地図にも同じように挿せる。**
 *
 * 利用者の要望「Google マップのように、移動したら現在地もリアルタイムに
 * 動く」。Google マップの現在地表示は 3 つの部品でできている。
 *
 *   1. 青い点        … いまの位置
 *   2. 薄い円        … 測位の誤差半径（accuracy）。狭いほど正確
 *   3. 追従の切り替え … 地図を手で動かしたら追うのをやめる
 *
 * 3 が要になる。追い続けるだけだと、利用者が別の場所を見ようとした
 * 瞬間に現在地へ引き戻されて操作できない。**手で動かしたら追従を切る**
 * （Google マップも同じ挙動）。切れたことは親に伝えて、ボタンの見た目で
 * 分かるようにする。
 *
 * ## 判定には使わない
 *
 * この層は**表示だけ**。方位の判定は「出発地」から行う（設定バーで
 * 入れる座標）。現在地が動くたびに吉凶が変わると、画面の答えが歩いた
 * だけで変わってしまう。現在地を出発地にしたい人のために、親が
 * onAdopt を渡せば「ここを出発地にする」を出せるようにしてある。
 */

export interface CurrentLocationLayerProps {
  /** 購読するか。false のあいだは許可を求めない。 */
  enabled: boolean;
  /** 追従するか。地図を手で動かすと false に落とす。 */
  follow: boolean;
  /** 追従が切れたことを親へ返す（ボタンの見た目を戻すため）。 */
  onFollowBroken?: () => void;
  /** 測位のたびに親へ渡す。状態表示や「出発地にする」に使う。 */
  onPosition?: (position: WatchedPosition) => void;
  /** 失敗の 1 行を親へ渡す。null は失敗していない。 */
  onMessage?: (message: string | null) => void;
}

/** 追従でどこまで寄るか。街区が見える程度。 */
const FOLLOW_ZOOM = 16;

/**
 * 誤差の円を描く上限（メートル）。
 *
 * 屋内や地下だと accuracy が数千メートルで返ることがあり、そのまま
 * 描くと画面が薄い円で埋まって地図が読めなくなる。円は「どのくらい
 * あいまいか」を示すためのものなので、あいまいすぎるときは描かない
 * （点だけ出す）。
 */
const MAX_ACCURACY_CIRCLE_M = 2000;

export function CurrentLocationLayer({
  enabled,
  follow,
  onFollowBroken,
  onPosition,
  onMessage,
}: CurrentLocationLayerProps) {
  const map = useMap();
  const { position, message } = useWatchedPosition(enabled);
  /* 追従で地図を動かしたぶんは「手で動かした」に数えない。
     setView も dragend/zoomend と同じ道で moveend を出すため。 */
  const movingByFollowRef = useRef(false);

  useMapEvents({
    dragstart() {
      if (follow) onFollowBroken?.();
    },
    zoomstart() {
      /* 追従のズームで自分の追従を切らない */
      if (follow && !movingByFollowRef.current) onFollowBroken?.();
    },
  });

  useEffect(() => {
    if (!position) return;
    onPosition?.(position);
  }, [position, onPosition]);

  useEffect(() => {
    onMessage?.(message);
  }, [message, onMessage]);

  useEffect(() => {
    if (!follow || !position) return;
    movingByFollowRef.current = true;
    map.setView(
      [position.lat, position.lon],
      Math.max(map.getZoom(), FOLLOW_ZOOM),
      { animate: true },
    );
    /* setView が出すイベントを通り過ぎてから旗を戻す */
    const t = setTimeout(() => {
      movingByFollowRef.current = false;
    }, 400);
    return () => clearTimeout(t);
  }, [follow, position, map]);

  if (!position) return null;

  return (
    <>
      {position.accuracyM <= MAX_ACCURACY_CIRCLE_M && (
        <Circle
          center={[position.lat, position.lon]}
          radius={position.accuracyM}
          pathOptions={{
            color: "#2563eb",
            weight: 1,
            opacity: 0.35,
            fillColor: "#3b82f6",
            fillOpacity: 0.12,
          }}
          /* 誤差の円はクリックを吸わない。下の物件ピンを押せなくなる */
          interactive={false}
        />
      )}
      {/* 白い縁の青点。Google マップと同じ約束事にして、
          物件ピン（吉凶の色）と取り違えないようにする */}
      <CircleMarker
        center={[position.lat, position.lon]}
        radius={7}
        pathOptions={{
          color: "#ffffff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          現在地（誤差 約 {Math.round(position.accuracyM)}m）
        </Tooltip>
      </CircleMarker>
    </>
  );
}

export default CurrentLocationLayer;
