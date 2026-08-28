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
  /**
   * 見た目の縮尺。既定の "compact" は設定バー（MetaphysicalConfigBar）用の
   * 小さい字。"form" はホーム上部の「まずここを入れる」用で、隣に並ぶ
   * 生年月日の欄（ラベル text-sm・入力 py-2.5）と同じ縮尺にする。
   * 縮尺が混ざると、同じ段に並べたときに欄の高さと字の大きさが
   * 食い違って崩れて見える（利用者の指摘）。
   */
  variant?: "compact" | "form";
}

/** 縮尺ごとの class。構造は同じで、字の大きさと余白だけが違う。 */
const VARIANT_STYLES = {
  compact: {
    label: "text-[10px] uppercase font-bold text-stone-500",
    optionalBadge: "ml-1.5 text-[9px] font-normal text-stone-600",
    currentLocation:
      "text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline shrink-0",
    input:
      "w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-700 placeholder-stone-300 focus:outline-none focus:border-indigo-300",
    searching: "text-[10px] text-stone-600 animate-pulse",
    notice: "text-[10px] text-amber-600",
    suggestion:
      "w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:bg-indigo-50 transition-colors",
    picked: "flex items-center gap-1.5 text-[10px] text-stone-500",
    pinSize: 10,
    help: "text-[9px] text-stone-600 leading-relaxed",
    coordsToggle: "self-start text-[9px] text-stone-600 hover:text-stone-800",
    coordInput:
      "px-2 py-1.5 bg-white border border-stone-200 rounded-lg text-[11px] font-mono text-stone-700",
  },
  form: {
    label: "text-sm font-bold text-slate-800",
    optionalBadge: "ml-1.5 text-xs font-normal text-slate-400",
    currentLocation:
      "text-xs text-emerald-600 hover:text-emerald-700 hover:underline shrink-0",
    input:
      "w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-300 outline-none focus:border-rose-400 transition-colors",
    searching: "text-xs text-slate-400 animate-pulse",
    notice: "text-xs text-amber-600",
    suggestion:
      "w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-rose-50 transition-colors",
    picked: "flex items-center gap-1.5 text-xs text-slate-500",
    pinSize: 12,
    help: "text-xs text-slate-500 leading-relaxed",
    coordsToggle: "self-start text-xs text-slate-400 hover:text-slate-600",
    coordInput:
      "px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono text-slate-700",
  },
} as const;

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
  variant = "compact",
}: PlaceInputProps) {
  const s = VARIANT_STYLES[variant];
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
    /* この部品自体が grid の項目になる（ホームの 3 列など）。既定の
       min-width: auto だと、中の入力欄の既定幅（size 属性ぶん）より
       枠を狭くできず、隣の列へはみ出す。min-w-0 で縮めるようにする。 */
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* ラベルが長い県・欄では、ボタンが幅を取ってラベルが不自然な位置で
          折り返す（「いま住んでいると／ころ（出発地）」。利用者の報告
          2026-08-28）。**折り返しを許して、狭いときはボタンを次の行へ
          落とす。**広い画面ではこれまでどおり同じ行に並ぶ。
          縦は items-baseline にして、2 行になってもボタンが行間に
          浮かないようにする。 */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <label className={`${s.label} min-w-0`}>
          {label}
          {optional && <span className={s.optionalBadge}>（任意）</span>}
        </label>
        {onUseCurrentLocation && (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            className={s.currentLocation}
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
        /* 何を入れる欄かはラベルが言っている。placeholder は**書き方の例**
           だけにする。以前は「市区町村・住所・郵便番号（例: …）」と説明を
           繰り返していて、3 列に並べたときに欄の幅を超えて途中で切れていた
           （利用者の報告 2026-08-28）。 */
        placeholder="例: 京都市南区 / 6018001"
        className={s.input}
      />

      {searching && <p className={s.searching}>探しています…</p>}

      {notice && <p className={s.notice}>{notice}</p>}

      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-0.5 border border-stone-200 rounded-lg overflow-hidden">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.name}-${suggestion.lat}-${suggestion.lon}`}>
              <button
                type="button"
                onClick={() => pick(suggestion)}
                className={s.suggestion}
              >
                {suggestion.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 決まった場所。座標そのものではなく、地名で確かめられるようにする */}
      <div className={s.picked}>
        <MapPin size={s.pinSize} className="text-stone-600 shrink-0" />
        {picked ? (
          <span className="truncate">{picked}</span>
        ) : hasCoords ? (
          <span>
            設定済み（北緯 {lat.toFixed(3)} / 東経 {lon.toFixed(3)}）
          </span>
        ) : (
          <span className="text-stone-600">
            {optional ? "未設定でも判定は出ます" : "まだ設定されていません"}
          </span>
        )}
      </div>

      {help && <p className={s.help}>{help}</p>}

      {/*
        緯度経度は畳んでおく。地図で拾った値を手で微調整している人が
        いるので消しはしない。
      */}
      <button
        type="button"
        onClick={() => setShowCoords(!showCoords)}
        className={s.coordsToggle}
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
            className={s.coordInput}
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
            className={s.coordInput}
          />
        </div>
      )}
    </div>
  );
}

export default PlaceInput;
