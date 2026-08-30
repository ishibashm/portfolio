"use client";

import { useCallback, useState } from "react";
import { CurrentLocationLayer } from "@/components/map/CurrentLocationLayer";
import type { WatchedPosition } from "@/lib/useWatchedPosition";

/**
 * 現在地の「層＋ボタン」を 1 つにまとめたもの。**地図に 1 行挿すだけで使える。**
 *
 * CurrentLocationLayer は層だけなので、使う側がボタンと状態を毎回書く
 * ことになる。それだと地図の数だけ同じコードが増える（このリポジトリは
 * 実際に、テーマ切替・座標クリック・下地タイルがそれぞれ 3〜5 か所に
 * 写されていて、直すときに取りこぼす原因になっている）。
 *
 * ボタンは Leaflet の control 枠（leaflet-top / leaflet-right）に置く。
 * MapContainer の中に書けるので、使う側は HUD の場所を考えなくてよい。
 *
 * 押すたびに 消 → 表示＋追従 → 表示のみ → 消 と回る。ラベルは
 * 「今どうなっているか」を書く（押すとどうなるかは title に置く）。
 */

export interface CurrentLocationControlProps {
  /** 測位のたびに親へ渡す。「ここを出発地にする」などに使う。 */
  onPosition?: (position: WatchedPosition) => void;
  /** ボタンの置き場所。既定は右上。 */
  corner?: "topright" | "topleft" | "bottomright" | "bottomleft";
}

const CORNER_CLASS: Record<
  NonNullable<CurrentLocationControlProps["corner"]>,
  string
> = {
  topright: "leaflet-top leaflet-right",
  topleft: "leaflet-top leaflet-left",
  bottomright: "leaflet-bottom leaflet-right",
  bottomleft: "leaflet-bottom leaflet-left",
};

export function CurrentLocationControl({
  onPosition,
  corner = "topright",
}: CurrentLocationControlProps) {
  const [on, setOn] = useState(false);
  const [follow, setFollow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleFollowBroken = useCallback(() => setFollow(false), []);

  return (
    <>
      <CurrentLocationLayer
        enabled={on}
        follow={follow}
        onFollowBroken={handleFollowBroken}
        onPosition={onPosition}
        onMessage={setMessage}
      />
      <div className={CORNER_CLASS[corner]}>
        <div className="leaflet-control flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => {
              if (!on) {
                setOn(true);
                setFollow(true);
                return;
              }
              if (follow) {
                setFollow(false);
                return;
              }
              setOn(false);
              setMessage(null);
            }}
            title={
              !on
                ? "現在地を表示して追従する（位置情報の許可が要ります）"
                : follow
                  ? "追従をやめる（現在地の表示は残す）"
                  : "現在地の表示を消す"
            }
            aria-pressed={on}
            className={`rounded-lg border px-3 py-1.5 font-mono text-[9px] font-bold shadow-lg transition-colors active:scale-95 ${
              follow
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                : on
                  ? "border-blue-300 bg-white text-blue-600 hover:bg-blue-50"
                  : "border-stone-200 bg-white/80 text-stone-500 hover:bg-white"
            }`}
          >
            ◎ 現在地 {follow ? "追従中" : on ? "表示中" : "非表示"}
          </button>
          {/* 取れないときの 1 行。黙って消えると、押したのに何も起きて
              いないように見える。 */}
          {on && message && (
            <div className="max-w-56 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-[9px] leading-relaxed text-amber-800 shadow-lg">
              {message}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default CurrentLocationControl;
