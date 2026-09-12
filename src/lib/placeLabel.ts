"use client";

/**
 * 場所を**地名で**見せる（利用者の指摘、2026-09-12）。
 *
 * これまで出発地・出生地は「35.689 / 139.692」のような座標と出ていて、
 * 自分が何を入れたのか読めなかった。出す順はこう。
 *
 *   1. 地名で選んだときの名前（端末にだけ残る `birth_label` / `base_label`）
 *   2. 無ければ、座標から一番近い市区町村（/api/geocode/reverse）に
 *      「付近」を付ける。代表点で引くので町名までは言わない
 *   3. それも引けなければ座標（従来の形）
 *
 * 判定は座標で決まる。ここは表示だけ。
 */

import { useEffect, useState } from "react";
import { formatCoords } from "./profileCompletion";

/** 同じ座標を何度も引かない（頁の中で同じ場所が数か所に出る）。 */
const cache = new Map<string, Promise<string | null>>();

function key(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/** 座標 → 「東京都千代田区」。引けなければ null。 */
export function resolvePlaceName(
  lat: number,
  lon: number,
): Promise<string | null> {
  const k = key(lat, lon);
  let p = cache.get(k);
  if (!p) {
    p = fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { data?: { name?: string } | null };
        return body.data?.name ?? null;
      })
      .catch(() => null);
    cache.set(k, p);
  }
  return p;
}

/** 表示の 1 行を組む（純粋関数）。 */
export function describePlace(
  lat: number | null | undefined,
  lon: number | null | undefined,
  label?: string | null,
  municipality?: string | null,
): string {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return "未設定";
  }
  if (label) return label;
  if (municipality) return `${municipality} 付近`;
  return formatCoords(lat, lon);
}

/**
 * 画面で使う形。最初は地名か座標を返し、市区町村が引けたら差し替える。
 * 端末に地名があるときは引かない（そのほうが正確で、外に出ない）。
 */
export function usePlaceName(
  lat: number | null | undefined,
  lon: number | null | undefined,
  label?: string | null,
): string {
  const [municipality, setMunicipality] = useState<string | null>(null);
  const hasCoords =
    lat !== null && lat !== undefined && lon !== null && lon !== undefined;

  useEffect(() => {
    if (!hasCoords || label) return;
    let alive = true;
    resolvePlaceName(lat, lon).then((name) => {
      if (alive) setMunicipality(name);
    });
    return () => {
      alive = false;
    };
  }, [hasCoords, lat, lon, label]);

  return describePlace(lat, lon, label, municipality);
}
