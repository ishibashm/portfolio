"use client";

/**
 * 場所を入れる欄。地名・郵便番号・緯度経度の 3 通りを 1 つにまとめる。
 *
 * これまでは緯度経度をそのまま並べていた。画面には
 * `34.99126158901555` のような 14 桁が 4 つ出ていて、**人が読み書きする
 * 値ではない**。とくに出生地は、自分の生まれた場所の座標を知っている人
 * のほうが少ない。ここが入力の一番の壁になっていた。
 *
 * 出す順を「やさしい順」にする。
 *
 *   1. 地名で探す   打ちながら候補が出る（/api/geocode/suggest）
 *   2. 郵便番号     7 桁で引く（/api/postal）
 *   3. 緯度経度     畳んでおく。直したい人だけ開く
 *
 * 座標は「結果」として小さく出すだけにする。**消しはしない。**
 * 地図で拾った値を手で微調整している人がいるため。
 *
 * 郵便番号は対応表（postal_codes）が要る。**表がまだ無くても
 * 画面は壊さない。**その欄だけ使えない旨を出して、他の入れ方は
 * そのまま使えるようにする。適用の時期を運用側が選べるようにするため。
 */

import React from "react";
import { MapPin } from "lucide-react";

export interface PlaceInputProps {
  /** 「生まれたところ」「いま住んでいるところ」など。 */
  label: string;
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
  /** 任意の入力か。出生地は未入力でも方位の吉凶が出る。 */
  optional?: boolean;
  /** 欄の下に出す説明。何に使う値かを書く。 */
  help?: string;
  /** 「いまいる場所を使う」を出すか。現在地の欄でだけ true。 */
  onUseCurrentLocation?: () => void;
}

interface Suggestion {
  name: string;
  lat: number;
  lon: number;
}

/** 郵便番号らしき入力か（ハイフンや全角を許す）。 */
function normalizePostal(raw: string): string | null {
  const digits = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");
  return digits.length === 7 ? digits : null;
}

export function PlaceInput({
  label,
  lat,
  lon,
  onChange,
  optional,
  help,
  onUseCurrentLocation,
}: PlaceInputProps) {
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [showCoords, setShowCoords] = React.useState(false);

  /**
   * 打っている途中で候補を引く。1 文字ごとに外へ出すと公共の口を
   * 叩きすぎるので、止まってから引く。
   */
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    // 郵便番号は候補ではなく確定で引く。下の効果が受け持つ。
    if (normalizePostal(q)) {
      setSuggestions([]);
      return;
    }

    let alive = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/geocode/suggest?q=${encodeURIComponent(q)}`,
        );
        if (!alive) return;
        const body = (await res.json()) as { data?: Suggestion[] };
        setSuggestions(Array.isArray(body.data) ? body.data : []);
      } catch {
        if (alive) setSuggestions([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 400);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  /** 郵便番号が 7 桁そろったら引く。 */
  React.useEffect(() => {
    const code = normalizePostal(query);
    if (!code) return;

    let alive = true;
    setSearching(true);
    setNotice(null);

    (async () => {
      try {
        const res = await fetch(`/api/postal?code=${code}`);
        if (!alive) return;
        if (res.status === 503) {
          // 対応表がまだ入っていない。他の入れ方は使える。
          setNotice("郵便番号での検索はいま使えません。地名で探してください。");
          return;
        }
        const body = (await res.json()) as {
          data?: { address: string; lat: number; lon: number } | null;
        };
        if (!alive) return;
        if (!body.data) {
          setNotice("その郵便番号が見つかりませんでした。");
          return;
        }
        onChange(body.data.lat, body.data.lon);
        setPicked(body.data.address);
        setQuery("");
      } catch {
        if (alive) setNotice("郵便番号を調べられませんでした。");
      } finally {
        if (alive) setSearching(false);
      }
    })();

    return () => {
      alive = false;
    };
    // onChange は呼び出し側で作り直されることがある。code だけを見る。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const pick = (s: Suggestion) => {
    onChange(s.lat, s.lon);
    setPicked(s.name);
    setQuery("");
    setSuggestions([]);
    setNotice(null);
  };

  const hasCoords = lat !== null && lon !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] uppercase font-bold text-stone-500">
          {label}
          {optional && (
            <span className="ml-1.5 text-[9px] font-normal text-stone-400">
              （任意）
            </span>
          )}
        </label>
        {onUseCurrentLocation && (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className="text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline shrink-0"
          >
            いまいる場所を使う
          </button>
        )}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNotice(null);
        }}
        placeholder="市区町村・住所・郵便番号（例: 京都市南区 / 6018001）"
        className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-700 placeholder-stone-300 focus:outline-none focus:border-indigo-300"
      />

      {searching && (
        <p className="text-[10px] text-stone-400 animate-pulse">
          探しています…
        </p>
      )}

      {notice && <p className="text-[10px] text-amber-600">{notice}</p>}

      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-0.5 border border-stone-200 rounded-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={`${s.name}-${s.lat}-${s.lon}`}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:bg-indigo-50 transition-colors"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 決まった場所。座標そのものではなく、地名で確かめられるようにする */}
      <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
        <MapPin size={10} className="text-stone-400 shrink-0" />
        {picked ? (
          <span className="truncate">{picked}</span>
        ) : hasCoords ? (
          <span>
            設定済み（北緯 {lat.toFixed(3)} / 東経 {lon.toFixed(3)}）
          </span>
        ) : (
          <span className="text-stone-400">
            {optional ? "未設定でも判定は出ます" : "まだ設定されていません"}
          </span>
        )}
      </div>

      {help && (
        <p className="text-[9px] text-stone-400 leading-relaxed">{help}</p>
      )}

      {/*
        緯度経度は畳んでおく。地図で拾った値を手で微調整している人が
        いるので消しはしない。
      */}
      <button
        type="button"
        onClick={() => setShowCoords(!showCoords)}
        className="self-start text-[9px] text-stone-400 hover:text-stone-600"
      >
        {showCoords ? "▲ 緯度経度を隠す" : "▼ 緯度経度を直接入れる"}
      </button>

      {showCoords && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.000001"
            value={lat ?? ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && lon !== null) onChange(v, lon);
            }}
            placeholder="緯度"
            className="px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[11px] font-mono text-stone-700"
          />
          <input
            type="number"
            step="0.000001"
            value={lon ?? ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && lat !== null) onChange(lat, v);
            }}
            placeholder="経度"
            className="px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[11px] font-mono text-stone-700"
          />
        </div>
      )}
    </div>
  );
}

export default PlaceInput;
