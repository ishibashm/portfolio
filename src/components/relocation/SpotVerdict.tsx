"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Loader2 } from "lucide-react";
import {
  bearingBetween,
  directionFromBearing,
  distanceKmBetween,
} from "@/utils/directionGeo";
import { directionUnstableNote } from "@/lib/directionDistance";
import { TIER_BADGE_CLASS } from "@/utils/tierDisplay";
import { TIER_LABELS, type DayTier } from "@/utils/auspiciousDays";

/**
 * 指定した1地点の吉凶を、そのまま画面で見る。
 *
 * 物件一覧に載っているのは取り込み済みの賃貸だけで、他所で見つけた
 * 住所や、これから内見に行く場所は出てこない。これまではその判定を
 * 見るのに /relocation/simulator へ移り、出発地と日付を入れ直す必要が
 * あった。同じ盤を使っているのに画面を跨ぐ理由が無い。
 *
 * **判定は新しく作らない。**方位は物件・県の塗り分けとまったく同じ
 * 経路（bearingBetween → directionFromBearing）で出し、段階はページが
 * 既に組んだその日の盤（dirKigaku）から引くだけ。ここで別に計算すると、
 * 同じ地点なのに県の色と食い違う。
 */

/** 判定に要る 1 方位ぶん。ページが組む盤の 1 セルと同じ形。 */
export type DirectionCell = {
  direction: string;
  directionLabel: string;
  tier: string;
  blocked: boolean;
  /**
   * 土用殺が当たっている方位か。
   *
   * 土用殺は年盤・月盤・日盤のどれにも出ず、最終だけを NOISE_GOU
   * （＝どの画面でも「五黄殺」）にする。三盤とも大吉なのに段階が
   * X になり、理由が画面から分からない日ができていた。
   *
   * 段階だけを出していると「五大凶殺あり」と読めてしまうが、土用殺は
   * 五大凶殺（五黄殺・暗剣殺・破・本命殺・本命的殺）ではない。
   * 天中殺と同じく、理由の 1 行として別に出す。
   */
  doyouSatsu?: boolean;
};

export type SpotTarget = { lat: number; lon: number; name: string };

/**
 * 入力を座標として読めるか。
 *
 * 地図のクリックは座標をクリップボードへ入れるので、貼り付けたものが
 * そのまま使えないと一度住所へ直す手間が挟まる。「35.0116, 135.7681」
 * のような形をここで受ける。
 *
 * 日本の範囲に収まらない値は座標として扱わない。「1,2」のような
 * 住所の一部が座標として読まれると、地球のどこかを指したまま
 * それらしい方位が出てしまう。
 */
export function parseCoordinates(
  raw: string,
): { lat: number; lon: number } | null {
  const m = raw
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,、\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 20 || lat > 46 || lon < 122 || lon > 154) return null;
  return { lat, lon };
}

export function SpotVerdict({
  baseLat,
  baseLon,
  useClassical,
  dirKigaku,
  kigakuUnavailableReason,
  requestedPoint,
  onFocus,
}: {
  baseLat: number;
  baseLon: number;
  useClassical: boolean;
  /** 8方位 → その日の段階。ページが 1 回だけ組んだ盤を借りる */
  dirKigaku?: Record<string, DirectionCell>;
  /** 盤を出せない理由（生年月日が未入力など）。そのまま出す */
  kigakuUnavailableReason?: string;
  /**
   * 地図のクリックで指された地点。
   *
   * seq は「同じ座標をもう一度クリックした」を区別するための連番。
   * 座標だけを見ていると、同じ場所を押し直したときに何も起きない。
   */
  requestedPoint?: { lat: number; lon: number; seq: number } | null;
  /** 地図をその地点へ寄せる */
  onFocus?: (lat: number, lon: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<SpotTarget | null>(null);

  const hasBase = Number.isFinite(baseLat) && Number.isFinite(baseLon);

  // 地図でクリックされたら、住所を引かずにそのまま判定へ入れる。
  // 座標は既に分かっているので、ジオコーディングを挟む理由が無い。
  // 入力欄にも書き戻して、何を見ているかを画面に残す。
  const requestedSeq = requestedPoint?.seq ?? 0;
  const requestedLat = requestedPoint?.lat;
  const requestedLon = requestedPoint?.lon;
  useEffect(() => {
    if (requestedLat === undefined || requestedLon === undefined) return;
    const text = `${requestedLat.toFixed(6)}, ${requestedLon.toFixed(6)}`;
    setQuery(text);
    setError(null);
    setTarget({ lat: requestedLat, lon: requestedLon, name: text });
  }, [requestedSeq, requestedLat, requestedLon]);

  const lookup = async () => {
    const text = query.trim();
    if (!text) return;
    setError(null);

    const coords = parseCoordinates(text);
    if (coords) {
      setTarget({ ...coords, name: `${coords.lat}, ${coords.lon}` });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const body = await res.json();
      if (!res.ok || typeof body?.lat !== "number") {
        setTarget(null);
        setError(
          "その住所は見つかりませんでした。市区町村から入れてみてください。",
        );
        return;
      }
      setTarget({ lat: body.lat, lon: body.lon, name: body.name || text });
    } catch {
      setTarget(null);
      setError("住所を調べられませんでした。通信を確かめてください。");
    } finally {
      setBusy(false);
    }
  };

  // 方位は物件・県の塗り分けと同じ経路で出す。判定の基準は真北。
  const bearing =
    target && hasBase
      ? bearingBetween(baseLat, baseLon, target.lat, target.lon)
      : null;
  const direction =
    bearing === null
      ? null
      : directionFromBearing(
          bearing,
          useClassical ? "traditional" : "physical",
        );
  const distanceKm =
    target && hasBase
      ? distanceKmBetween(baseLat, baseLon, target.lat, target.lon)
      : null;
  const cell = direction ? dirKigaku?.[direction] : undefined;
  const unstableNote =
    distanceKm === null ? null : directionUnstableNote(distanceKm);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="arb-spot-query"
        className="text-[10px] font-semibold text-stone-600 dark:text-stone-500 block"
      >
        この地点を調べる
      </label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-600" />
        <input
          id="arb-spot-query"
          type="text"
          placeholder="住所、または 35.0116, 135.7681"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup();
            }
          }}
          className="w-full pl-9 pr-16 py-2 bg-emerald-50/40 dark:bg-white border border-emerald-200/70 dark:border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={busy}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-stone-800 text-white text-[10px] font-bold hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "調べる"}
        </button>
      </div>
      <p className="text-[9px] text-stone-600 leading-relaxed">
        一覧に無い場所でも、出発地から見た方位とその日の吉凶を出します。地図をクリックすると、その地点がここに入ります。
      </p>

      {error && <p className="text-[10px] text-rose-600">{error}</p>}

      {/* 出発地が無いと方位が決まらない。判定を出さずに理由を言う。
          ここで既定の座標に落とすと、他人の出発地から見た方位を
          「自分の吉方位」として読ませることになる。 */}
      {target && !hasBase && (
        <p className="text-[10px] text-amber-700">
          出発地を入れると、この地点の方位と吉凶を出します。
        </p>
      )}

      {target && hasBase && direction && (
        <div className="rounded-xl border border-stone-200 bg-white/80 dark:bg-stone-50 p-2.5 space-y-1.5">
          <div className="text-[10px] text-stone-500 leading-snug">
            {target.name}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-stone-800">
              {cell?.directionLabel ?? direction}
            </span>
            {distanceKm !== null && (
              <span className="text-[10px] font-mono text-stone-500">
                約{distanceKm.toFixed(1)}km
              </span>
            )}
            {cell ? (
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                  TIER_BADGE_CLASS[cell.tier as DayTier] ??
                  "bg-stone-100 border-stone-300 text-stone-600"
                }`}
              >
                {TIER_LABELS[cell.tier as DayTier] ?? cell.tier}
              </span>
            ) : (
              <span className="text-[10px] text-stone-500">
                {kigakuUnavailableReason ?? "条件が揃うと吉凶を出します"}
              </span>
            )}
          </div>

          {cell?.blocked && (
            <p className="text-[10px] text-rose-600">
              天中殺により、この期間の移動は避ける扱いになっています。
            </p>
          )}

          {cell?.doyouSatsu && (
            <p className="text-[10px] text-rose-600">
              {
                "土用殺の方位です。土用の期間中はこの方位が塞がります（間日を除く）。年盤・月盤・日盤が吉でも避ける扱いです。"
              }
            </p>
          )}

          {/* 近すぎる移動は方位がピンの置き方で変わる。判定は出したまま、
              どれだけ当てになるかを添える（lib/directionDistance）。 */}
          {unstableNote && (
            <p className="text-[10px] text-amber-700 leading-relaxed">
              {unstableNote}{" "}
              <Link
                href="/blog/how-much-does-distance-matter"
                className="font-semibold underline"
              >
                近場の引越しで方位をどう扱うか
              </Link>
            </p>
          )}

          {onFocus && (
            <button
              type="button"
              onClick={() => onFocus(target.lat, target.lon)}
              className="text-[10px] font-bold text-indigo-600 hover:underline"
            >
              地図でこの地点を見る →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
