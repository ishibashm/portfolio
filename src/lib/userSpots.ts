"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  MAX_USER_SPOTS as SHARED_MAX,
  normalizeSpotName,
  pointKey,
} from "@/lib/userSpotKey";

/**
 * 利用者が自分で登録した地点。
 *
 * ## どこに置くか（2026-09-13 に変えた）
 *
 * 以前は **localStorage だけ**で、「サーバーに送らない」と書いてあった。
 * 端末を変える・履歴を消すと消えるため、利用者の依頼で DB にも置く
 * （`/api/spots`。表は `user_spots`）。**入るのは個人情報**なので、
 * 守りは API 側の註にまとめてある。
 *
 *   ログインしていない … 今までどおり端末の localStorage だけ
 *   ログインしている   … DB が正。端末には控えを置き、地図はそれを読む
 *
 * **初めてログインしたとき、端末に残っている地点は DB へ送る**（`syncUserSpots`）。
 * 端末だけにあった地点がサーバーへ移る、ということなので、利用者の依頼
 * 「お気に入りの場所も DB に保存してほしい」の範囲であることを明記しておく。
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
/**
 * 上限。地図に出す数と、保存の大きさの両方の歯止め。
 *
 * **API（サーバー）と同じ数字を使う。**2 か所に書くと、片方だけ増やした
 * ときに「端末には入るが DB に入らない」地点ができる。
 */
export const MAX_USER_SPOTS = SHARED_MAX;

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
  /* 整え方は API と同じ関数を通す（片方だけ緩い、という穴を作らない） */
  const name =
    normalizeSpotName(spot.name) ||
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
  /* 端末に書けたものだけ送る（上限で入らなかったものは送らない） */
  if (r.added || r.reason === "renamed") {
    const saved = r.list.find((s) => sameSpot(s, spot));
    void pushSpot({
      id: saved?.id,
      name: normalizeSpotName(spot.name),
      lat: spot.lat,
      lon: spot.lon,
    });
  }
  return r;
}

export function removeUserSpot(id: string): void {
  write(readUserSpots().filter((s) => s.id !== id));
  if (remote === "off") return;
  void fetch(`/api/spots?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {
    /* 通信の失敗。端末からは消えている */
  });
}

/* ------------------------------------------------------------------ *
 * DB との同期
 *
 * 画面の呼び出し口（`addUserSpot` / `removeUserSpot`）は変えない。
 * **端末の値を先に書いてから**サーバーへ送る（送信の失敗で画面が
 * 固まらない）。サーバーが正になるのは読み出しのときだけ。
 * ------------------------------------------------------------------ */

/** サーバーに置けるか。最初の読み出しで分かるまでは unknown。 */
let remote: "unknown" | "on" | "off" = "unknown";
let pulled: Promise<void> | null = null;

/**
 * 端末の一覧とサーバーの一覧を合わせる。**純粋関数**（テストのため）。
 *
 * - 同じ地点（5 桁で丸めた鍵）は 1 件にする。**名前はサーバー側を採る**
 *   （そちらが後から意図して保存された値）
 * - 端末にしか無い地点は「送る」側に入れる。上限を超える分は送らない
 * - 並びは登録した順
 */
export function mergeUserSpots(
  local: readonly UserSpot[],
  server: readonly UserSpot[],
  max: number = MAX_USER_SPOTS,
): { list: UserSpot[]; toPush: UserSpot[] } {
  const byKey = new Map<string, UserSpot>();
  for (const s of server) byKey.set(pointKey(s.lat, s.lon), s);

  const toPush: UserSpot[] = [];
  for (const s of local) {
    const key = pointKey(s.lat, s.lon);
    if (byKey.has(key)) continue;
    if (byKey.size >= max) break;
    byKey.set(key, s);
    toPush.push(s);
  }

  const list = [...byKey.values()].sort((a, b) =>
    (a.createdAt || "").localeCompare(b.createdAt || ""),
  );
  return { list: list.slice(0, max), toPush };
}

interface ServerSpot {
  id: unknown;
  name: unknown;
  lat: unknown;
  lon: unknown;
  createdAt: unknown;
}

/** 応答を読む。**形の合わないものは 1 件ずつ捨てる**（保存と同じ作法）。 */
function parseServerSpots(data: unknown): UserSpot[] {
  const rows = (data as { spots?: unknown })?.spots;
  if (!Array.isArray(rows)) return [];
  return parseUserSpots(
    JSON.stringify(
      rows
        /* null や配列が混じっても落ちない。**1 件ずつ捨てる**（欄を
           読む前に形を見る。以前ここで null の `.id` を読んで
           同期ごと落ちた） */
        .filter((r): r is ServerSpot => typeof r === "object" && r !== null)
        .map((o) => ({
          id: o.id,
          name: o.name,
          lat: o.lat,
          lon: o.lon,
          createdAt: o.createdAt,
        })),
    ),
  );
}

/**
 * 1 件をサーバーへ。保存された行（id はサーバーが決める）を返す。
 *
 * **戻ってきた id で端末側の id を差し替える。**端末で作る id は
 * その端末だけのもので、これをしないと**消しても DB に残る**
 * （DELETE は id で指すため）。
 */
async function pushSpot(spot: {
  id?: string;
  name: string;
  lat: number;
  lon: number;
}): Promise<UserSpot | null> {
  if (remote === "off") return null;
  try {
    const res = await fetch("/api/spots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: spot.name, lat: spot.lat, lon: spot.lon }),
    });
    if (res.status === 401) {
      remote = "off";
      return null;
    }
    if (!res.ok) return null;
    remote = "on";
    const data = (await res.json()) as { spot?: unknown };
    const [saved] = parseServerSpots({ spots: [data.spot] });
    if (saved && spot.id && saved.id !== spot.id)
      replaceLocalId(spot.id, saved);
    return saved ?? null;
  } catch {
    /* 通信の失敗。端末の値は書けているので画面はそのまま */
    return null;
  }
}

/** 端末側の 1 件を、サーバーが決めた id と作成時刻に差し替える。 */
function replaceLocalId(localId: string, saved: UserSpot): void {
  const list = readUserSpots();
  if (!list.some((s) => s.id === localId)) return;
  write(
    list.map((s) =>
      s.id === localId
        ? { ...s, id: saved.id, createdAt: saved.createdAt || s.createdAt }
        : s,
    ),
  );
}

/**
 * サーバーから読み、端末にしか無い地点を送る。**1 回だけ走る。**
 *
 * ログインしていなければ 401 が返り、以後はサーバーへ行かない。
 */
export function syncUserSpots(): Promise<void> {
  if (pulled) return pulled;
  pulled = (async () => {
    try {
      const res = await fetch("/api/spots", {
        headers: { accept: "application/json" },
      });
      if (res.status === 401) {
        remote = "off";
        return;
      }
      if (!res.ok) return;
      remote = "on";
      const server = parseServerSpots(await res.json());
      const { list, toPush } = mergeUserSpots(readUserSpots(), server);
      write(list);
      /* 端末にしか無かった地点を上げる。1 件ずつ順に送る（まとめて
         投げると、上限に当たったときにどれが入ったか分からない） */
      for (const s of toPush) {
        await pushSpot({ id: s.id, name: s.name, lat: s.lat, lon: s.lon });
      }
    } catch {
      /* 通信の失敗。端末の値だけで動く */
    }
  })();
  return pulled;
}

/** テスト用。**本番の経路では呼ばない。** */
export function resetUserSpotsSyncForTest(): void {
  pulled = null;
  remote = "unknown";
}

export function useUserSpots(): readonly UserSpot[] {
  /* 読み出しは外の仕組み（サーバー）との同期なので効果で行う。
     ここで setState はしない（書き込みは store 側で、購読者に伝わる）。 */
  useEffect(() => {
    void syncUserSpots();
  }, []);
  return useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);
}
