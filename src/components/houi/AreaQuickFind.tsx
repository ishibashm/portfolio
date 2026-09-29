"use client";

/**
 * エリア一覧（/houi/area）の「探す」部品。
 *
 * ## なぜ要るか（利用者の指摘、2026-09-30）
 *
 * 「スクロールして自分の居住都道府県を探すの大変かな」。一覧は 1,000 を
 * 超える市区町村を県ごとに縦に並べただけで、自分の県まで長くスクロール
 * するしかなかった。県への目次は頁（サーバー）の側に置き、ここでは
 *
 * - 市区町村名での絞り込み（「世田谷」と打てば世田谷区へ）
 * - 登録した出発地にいちばん近い市区町村への近道
 *
 * の 2 つだけを受け持つ。どちらも**外へは何も送らない**（一覧と出発地は
 * 手元にあるものだけを使う）。
 *
 * 出発地は端末の設定（tactical_config_v1）を useSyncExternalStore で読む。
 * サーバーでは空として描き、水和のあとに端末の値に替わる。
 */

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";
import { SETTINGS_KEY } from "@/lib/userSettings";
import { hasUsableBase } from "@/lib/japanBounds";

/** [市区町村コード, 県コード, 表示名（県＋市区町村）, 緯度, 経度] */
export type QuickFindArea = [string, string, string, number, number];

const MAX_RESULTS = 20;

/** 表記の揺れを畳む。全角・半角、空白、ヶ／ケ、ヵ／カ */
export function foldAreaName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/ヶ/g, "ケ")
    .replace(/ヵ/g, "カ");
}

export function matchAreas(
  areas: readonly QuickFindArea[],
  query: string,
): QuickFindArea[] {
  const q = foldAreaName(query);
  if (!q) return [];
  return areas.filter((a) => foldAreaName(a[2]).includes(q));
}

/**
 * いちばん近い市区町村。距離は緯度で経度を縮めた平面近似で足りる
 * （並べ替えに使うだけで、数 km の誤差で順位が入れ替わるほど近い
 * 候補どうしは、どちらを出しても用が足りる）。
 */
export function nearestArea(
  areas: readonly QuickFindArea[],
  lat: number,
  lon: number,
): QuickFindArea | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: QuickFindArea | null = null;
  let bestD = Infinity;
  for (const a of areas) {
    const d = (a[3] - lat) ** 2 + ((a[4] - lon) * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY || e.key === null) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
function snapshot(): string {
  try {
    return window.localStorage.getItem(SETTINGS_KEY) ?? "";
  } catch {
    return "";
  }
}

function baseFrom(raw: string): { lat: number; lon: number } | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Record<string, unknown>;
    const lat = s.base_lat;
    const lon = s.base_lon;
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    return hasUsableBase(lat, lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

export function AreaQuickFind({ areas }: { areas: QuickFindArea[] }) {
  const [query, setQuery] = useState("");
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const base = baseFrom(raw);
  const near = base ? nearestArea(areas, base.lat, base.lon) : null;
  const hits = matchAreas(areas, query);

  return (
    <div className="mt-6 space-y-3">
      {near && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-slate-700">
          <MapPin className="h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          登録した出発地にいちばん近い市区町村:
          <Link
            prefetch={false}
            href={`/houi/area/${near[0]}`}
            className="font-bold text-rose-700 underline"
          >
            {near[2]}
          </Link>
          <a
            href={`#pref-${near[1]}`}
            className="text-xs text-slate-600 underline"
          >
            この県の一覧へ
          </a>
        </p>
      )}

      <div>
        <label
          htmlFor="area-quick-find"
          className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          市区町村名で探す
        </label>
        <input
          id="area-quick-find"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: 世田谷、札幌市中央区、那覇"
          className="w-full max-w-md rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
        />
        {query.trim() !== "" && (
          <div className="mt-2" aria-live="polite">
            {hits.length === 0 ? (
              <p className="text-xs text-slate-600">
                一覧に「{query.trim()}
                」は見つかりませんでした。掲載を集計できた市区町村だけが並んでいます。下の県の目次からも探せます。
              </p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-2">
                  {hits.slice(0, MAX_RESULTS).map((a) => (
                    <li key={a[0]}>
                      <Link
                        prefetch={false}
                        href={`/houi/area/${a[0]}`}
                        className="inline-block rounded-full border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold hover:border-rose-500"
                      >
                        {a[2]}
                      </Link>
                    </li>
                  ))}
                </ul>
                {hits.length > MAX_RESULTS && (
                  <p className="mt-1 text-xs text-slate-500">
                    ほか {hits.length - MAX_RESULTS}{" "}
                    件。もう少し詳しく入れると絞れます。
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
