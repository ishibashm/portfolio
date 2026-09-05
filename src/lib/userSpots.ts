"use client";

import { useSyncExternalStore } from "react";

/**
 * 利用者が自分で登録した地点（localStorage）。
 *
 * ## なぜ端末に置くか
 *
 * 「実家」「候補の物件」「よく行く場所」のような地点は個人のもの。
 * サーバーに送らない（**送ると個人情報を増やす**。CLAUDE.md 6 節の
 * 「戻せないもの」）。端末の localStorage だけに置き、読む側は
 * `useUserSpots` で購読する。
 *
 * ## 形
 *
 * `useSyncExternalStore` で読む（map_theme と同じ作法。効果の中で
 * setState しない）。同じ端末の別タブには `storage`、同じタブの別部品
 * には独自イベントで伝える。**スナップショットは文字列が同じなら同じ
 * 参照を返す**（そうしないと毎描画で新しい配列になり無限に再描画する）。
 */

export const USER_SPOTS_STORAGE_KEY = "user_spots_v1";
export const USER_SPOTS_EVENT = "userSpotsChanged";
/** 上限。地図に出す数と、localStorage の大きさの両方の歯止め。 */
export const MAX_USER_SPOTS = 50;

export interface UserSpot {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 登録した日時（ISO）。並びに使う */
  createdAt: string;
}

const EMPTY: readonly UserSpot[] = Object.freeze([]);

/** 文字列から読む。壊れていれば空。**形の合わないものは 1 件ずつ捨てる。** */
export function parseUserSpots(raw: string | null): UserSpot[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: UserSpot[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const lat = o.lat;
    const lon = o.lon;
    if (
      typeof o.id !== "string" ||
      typeof o.name !== "string" ||
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    )
      continue;
    out.push({
      id: o.id,
      name: o.name,
      lat,
      lon,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    });
  }
  return out.slice(0, MAX_USER_SPOTS);
}

/** 同じ地点かどうか。座標を 5 桁（約 1m）で丸めて比べる */
export function sameSpot(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): boolean {
  return (
    a.lat.toFixed(5) === b.lat.toFixed(5) &&
    a.lon.toFixed(5) === b.lon.toFixed(5)
  );
}

/**
 * 1 件足した結果。純粋関数（テストのため）。
 * 同じ座標が既にあれば名前だけ更新して重ねない。上限を超えたら足さない。
 */
export function withUserSpot(
  list: readonly UserSpot[],
  spot: { name: string; lat: number; lon: number },
  now: Date = new Date(),
): { list: UserSpot[]; added: boolean; reason?: "full" | "renamed" } {
  const name =
    spot.name.trim().slice(0, 60) ||
    `${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)}`;
  const idx = list.findIndex((s) => sameSpot(s, spot));
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = { ...next[idx], name };
    return { list: next, added: false, reason: "renamed" };
  }
  if (list.length >= MAX_USER_SPOTS) {
    return { list: list.slice(), added: false, reason: "full" };
  }
  const id = `${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  return {
    list: [
      ...list,
      { id, name, lat: spot.lat, lon: spot.lon, createdAt: now.toISOString() },
    ],
    added: true,
  };
}

let cachedRaw: string | null | undefined;
let cachedList: readonly UserSpot[] = EMPTY;

function readSnapshot(): readonly UserSpot[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(USER_SPOTS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = raw ? parseUserSpots(raw) : EMPTY;
  }
  return cachedList;
}

function readServerSnapshot(): readonly UserSpot[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(USER_SPOTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(USER_SPOTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(list: readonly UserSpot[]): void {
  try {
    localStorage.setItem(USER_SPOTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 容量超過やプライベートモード。画面は現状のまま
  }
  window.dispatchEvent(new Event(USER_SPOTS_EVENT));
}

export function readUserSpots(): readonly UserSpot[] {
  if (typeof window === "undefined") return EMPTY;
  return readSnapshot();
}

export function addUserSpot(spot: { name: string; lat: number; lon: number }) {
  const r = withUserSpot(readUserSpots(), spot);
  write(r.list);
  return r;
}

export function removeUserSpot(id: string): void {
  write(readUserSpots().filter((s) => s.id !== id));
}

export function useUserSpots(): readonly UserSpot[] {
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
}
