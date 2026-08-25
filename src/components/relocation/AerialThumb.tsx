"use client";

import { useState } from "react";

import { aerialPhotoUrl, tilePointOf } from "@/lib/tileCoords";

/**
 * その座標の**空中写真**を 1 枚だけ切り出して出す。
 *
 * 物件のポップアップに置く。引越し先を選ぶときに効くのは建物の外観より
 * 周りの様子——川・崖・幹線道路・空き地——なので、地図の絵ではなく
 * 実際の写真を出す。
 *
 * ## 掲載元の写真は使っていない
 *
 * `rental_properties` に画像の列は無い（あるのは掲載ページの url だけ）。
 * 掲載元の写真を持つには収集と著作権の判断が要るので、**まず出典の
 * はっきりした空中写真で組む。**実写真を足すなら、この部品を差し替える。
 *
 * ## 1 枚だけ
 *
 * 地理院タイルを 1 枚（256px）そのまま出す。地図をもう 1 つ埋め込むと、
 * ポップアップを開くたびに Leaflet の実体が増えて重くなる。
 * 写真は動かせなくてよく、**動かしたければ下地を「空中写真」に
 * 切り替えれば地図側で見られる。**
 *
 * 点は写真の真ん中には来ない。タイルの中のどこにいるかを
 * `tilePointOf` の fx / fy から出して、印を重ねる。
 */

export interface AerialThumbProps {
  lat: number;
  lon: number;
  /** 切り出すズーム。既定は 17（建物の並びが分かる粗さ）。 */
  zoom?: number;
  /** 表示の 1 辺（px）。 */
  size?: number;
}

export function AerialThumb({
  lat,
  lon,
  zoom = 17,
  size = 240,
}: AerialThumbProps) {
  /*
    タイルが無い場所（海外・配信の隙間）は 404 になる。img は壊れた絵に
    なるだけで何も言わないので、握って「写真なし」に倒す。
  */
  const [failed, setFailed] = useState(false);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const point = tilePointOf(lat, lon, zoom);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-stone-100 text-[10px] text-stone-500"
        style={{ width: size, height: size / 2 }}
      >
        この場所の空中写真はありません
      </div>
    );
  }

  return (
    <figure className="m-0">
      <div
        className="relative overflow-hidden rounded-lg border border-stone-200 bg-stone-100"
        style={{ width: size, height: size / 2 }}
      >
        {/* 256px のタイルを枠に合わせて伸ばす。上下は中央だけ見せる */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={aerialPhotoUrl(lat, lon, zoom)}
          alt="この地点の空中写真"
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute left-0 w-full"
          style={{ top: `${-(point.fy * size) + size / 4}px` }}
        />
        {/* 「ここ」の印。タイルの中の位置に置く */}
        <span
          aria-hidden
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-rose-600 shadow"
          style={{ left: `${point.fx * 100}%`, top: "50%" }}
        />
      </div>
      <figcaption className="mt-1 text-[9px] leading-tight text-stone-500">
        出典: 地理院タイル（国土地理院）／撮影時期は場所によって異なります
      </figcaption>
    </figure>
  );
}
