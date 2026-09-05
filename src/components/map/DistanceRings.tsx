"use client";

import { Circle, Tooltip } from "react-leaflet";
import { ringsFor } from "@/lib/distanceRings";

/**
 * 出発地からの距離の輪。**縮尺の目盛り。**
 *
 * ## なぜ共有部品にするか
 *
 * 地図は 5 つある（`CLAUDE.md` 3 節）。距離の輪は arbitrage 以外でも
 * 要る見込みなので、最初から `components/map/` に置く。**同じものを
 * 写すと必ず食い違う**（扇形の縁で実際に 24km ずれた）。
 *
 * ## 気学的な意味は持たせない
 *
 * 半径の決め方は `lib/distanceRings`。距離で吉凶の強弱を変えるかは
 * 流派差があり、決まるまで実装しない（backlog の E）。輪は距離を
 * 示すだけで、5km だけは「方位が定まらない範囲」として意味を書く。
 *
 * ## 判定にも操作にも入らない
 *
 * `interactive={false}`。輪を押しても地点を選んだことにならない
 * （地図クリックの守りは `MapClickPicker` が持つ）。
 */

export interface DistanceRingsProps {
  /** 出発地。未設定なら描かない（起点のない距離に意味は無い）。 */
  baseLat: number | null | undefined;
  baseLon: number | null | undefined;
  /** 画面の中心から端までの距離。扇形と同じ値を渡す。 */
  visibleRadiusKm: number;
  /** 出すかどうか。 */
  enabled: boolean;
}

export function DistanceRings({
  baseLat,
  baseLon,
  visibleRadiusKm,
  enabled,
}: DistanceRingsProps) {
  if (!enabled) return null;
  /* 出発地が無いときは描かない。扇形と同じ考え方で、起点の無い距離を
     画面に出すと「何からの距離か」が言えない。 */
  if (typeof baseLat !== "number" || typeof baseLon !== "number") return null;

  const rings = ringsFor(visibleRadiusKm);
  if (rings.length === 0) return null;

  return (
    <>
      {rings.map((ring) => (
        <Circle
          key={`distance-ring-${ring.km}`}
          center={[baseLat, baseLon]}
          radius={ring.km * 1000}
          interactive={false}
          pathOptions={{
            /* 目盛りなので色を持たせない。扇形の 8 色・用途地域の 13 色と
               competing しないよう、灰色の破線だけにする。 */
            color: ring.meaning ? "#f59e0b" : "#78716c",
            weight: ring.meaning ? 1.2 : 1,
            opacity: ring.meaning ? 0.75 : 0.45,
            fill: false,
            dashArray: ring.meaning ? "2,4" : "6,8",
          }}
        >
          <Tooltip direction="top" opacity={0.9} sticky>
            {ring.km}km{ring.meaning ? `（${ring.meaning}）` : ""}
          </Tooltip>
        </Circle>
      ))}
    </>
  );
}
