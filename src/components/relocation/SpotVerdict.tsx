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
/* 段階の名前は dayTier（暦エンジンを引かない葉）から。auspiciousDays を
   値で import すると、この部品を載せる頁にエンジン一式が乗る。 */
import { TIER_LABELS, type DayTier } from "@/utils/dayTier";
import { addUserSpot } from "@/lib/userSpots";
import { hasUsableBase, isInJapan } from "@/lib/japanBounds";
import {
  geocodePrecisionNote,
  parseGeocodeSource,
  type GeocodeSource,
} from "@/lib/geocodeSource";

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

export type SpotTarget = {
  lat: number;
  lon: number;
  name: string;
  /**
   * 点の出どころ。**座標を直接入れた・地図をクリックしたときは付かない**
   * （利用者が指した点そのものなので、粗さの断りが要らない）。
   */
  source?: GeocodeSource | null;
};

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
  if (!isInJapan(lat, lon)) return null;
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
  /* 「保存」の結果。端末に置いただけなので、成否を 1 行返せば足りる */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  /*
    物件ページへの印（2026-09-15。利用者の依頼）。

    **畳んでおく。**大半の保存は名前だけで足りるので、欄を常に出すと
    「★ この地点を保存」の 1 押しが 3 つの空欄に変わる。押してから開く。

    **取りに行かない。**URL は控えとして持つだけで、中身は取得しない
    （取りに行けばスクレイピングで、nifty の特約が名指しで禁じている。
    backlog 29 節。見張りは `userSpotUrlNeverFetched`）。
  */
  const [showMark, setShowMark] = useState(false);
  const [markUrl, setMarkUrl] = useState("");
  const [markMemo, setMarkMemo] = useState("");

  /*
    **`Number.isFinite` では足りない。**呼び出し側は `Number(baseLat)` で
    渡してくるが、`baseLat` の初期値は空文字で `Number("")` は `NaN` では
    なく **`0`**。有限なので素通りし、緯度 0・経度 0（ギニア湾）から方位と
    距離を出していた（実機で「愛知県名古屋市中区 NE 約14083.5km」）。

    距離が桁違いなのは目で分かるが、**方位は一見それらしく気付けない。**
    日本の範囲で見る（`lib/japanBounds`）。
  */
  const hasBase = hasUsableBase(baseLat, baseLon);

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
        /*
          **API の文言を捨てない。**以前はどんな失敗でも「その住所は
          見つかりませんでした」に丸めていたので、URL を貼った人にも
          住所の話が返っていた（何を直せばよいか分からない）。
          文言を持って返す口だけ、そのまま出す。
        */
        setError(
          typeof body?.error === "string" && body.error
            ? body.error
            : "その住所は見つかりませんでした。市区町村から入れてみてください。",
        );
        return;
      }
      setTarget({
        lat: body.lat,
        lon: body.lon,
        name: body.name || text,
        source: parseGeocodeSource(body.source),
      });
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
  /*
    点の粗さ。**距離の注意（unstableNote）とは別の話。**あちらは「近すぎて
    方位が定まらない」、こちらは「そもそも指した点が住所の点ではない」。
    どちらも出うるので、畳まずに並べる。
  */
  const precisionNote = geocodePrecisionNote(target?.source ?? null);

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
          placeholder="住所、物件サイトの一覧の URL、または 35.0116, 135.7681"
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
      <p className="text-xs text-stone-600 leading-relaxed">
        一覧に無い場所でも、出発地から見た方位とその日の吉凶を出します。地図をクリックすると、その地点がここに入ります。
        <br />
        SUUMO で市区町村を絞った一覧の URL を貼ると、その街として調べます（
        <b>URL は開きに行きません。</b>
        綴りに入っている市区町村だけを読みます）。HOME&apos;S の URL
        と物件ごとのページの URL
        には市区町村が入っていないので、そのときは市区町村名でお願いします。
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

          {/* 点そのものが粗いとき。方位は出発地からこの座標への方角で
              決まるので、市の中心に潰れていると同じ市のどこを指しても
              同じ答えになる。**判定の答えが変わるのに画面は何も変わらない**
              ので、黙って出さない（lib/geocodeSource）。 */}
          {precisionNote && (
            <p className="text-[10px] text-amber-700 leading-relaxed">
              {precisionNote}
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

          <div className="flex flex-wrap items-center gap-3">
            {onFocus && (
              <button
                type="button"
                onClick={() => onFocus(target.lat, target.lon)}
                className="text-[10px] font-bold text-indigo-600 hover:underline"
              >
                地図でこの地点を見る →
              </button>
            )}
            {/* 端末の localStorage に置き、ログイン中はクラウドにも同期する
                （lib/userSpots。#25 で DB 保存を足した）。地図の
                UserSpotLayer が購読して ★ で出す。 */}
            <button
              type="button"
              onClick={() => {
                const r = addUserSpot({
                  name: target.name,
                  lat: target.lat,
                  lon: target.lon,
                  url: markUrl,
                  memo: markMemo,
                });
                setSavedNote(
                  r.added
                    ? "保存しました（地図に ★ で出ます）"
                    : r.reason === "full"
                      ? "保存できる地点は 50 件までです"
                      : "同じ地点が保存済みです（内容を更新しました）",
                );
              }}
              className="min-h-[24px] text-[10px] font-bold text-violet-700 hover:underline"
            >
              ★ この地点を保存
            </button>
            <button
              type="button"
              onClick={() => setShowMark((v) => !v)}
              aria-expanded={showMark}
              className="min-h-[24px] text-[10px] font-bold text-stone-600 hover:underline"
            >
              {showMark ? "物件の印を閉じる" : "物件のページを控える"}
            </button>
            {savedNote && (
              <span className="text-[10px] text-stone-500">{savedNote}</span>
            )}
          </div>

          {/* 物件のページを控える欄。**入れてから「★ この地点を保存」を
              押す。**保存の押し口を増やすと、どちらを押せばよいか分からない
              （同じ地点をもう一度保存すれば内容は差し替わる）。 */}
          {showMark && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2">
              <label className="block text-[10px] font-bold text-stone-700">
                物件のページ（https のみ）
                <input
                  type="url"
                  inputMode="url"
                  value={markUrl}
                  onChange={(e) => setMarkUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-[11px] font-normal"
                />
              </label>
              <label className="block text-[10px] font-bold text-stone-700">
                覚え書き
                <textarea
                  value={markMemo}
                  onChange={(e) => setMarkMemo(e.target.value)}
                  rows={2}
                  placeholder="2LDK / 8.5万円 / 駅8分 など"
                  className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-[11px] font-normal"
                />
              </label>
              <p className="text-[10px] leading-relaxed text-stone-500">
                {
                  "貼った URL は控えとして残すだけで、こちらから中身を読みに行くことはありません。家賃や間取りは手で書いてください。入れたら「★ この地点を保存」を押します。"
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
