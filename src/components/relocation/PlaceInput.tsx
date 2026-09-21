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
 *   2. 住所で決める 番地まで打って Enter か「この住所で決める」
 *                   （/api/geocode。国土地理院を先に引く。#40）
 *   3. 郵便番号     7 桁で引く（/api/postal）
 *   4. 緯度経度     畳んでおく。直したい人だけ開く
 *
 * 2 は 2026-09-21 に足した。それまで座標が入る経路は「候補をクリック」
 * と「郵便番号」しか無く、候補は町丁目までなので、**番地まで打っても
 * 確定する口が無かった。**番地まで当てる /api/geocode はシミュレータや
 * SpotVerdict からは呼んでいたのに、この欄だけ取り残されていた。
 * 緯度経度の欄は props に束縛されているので、決めた瞬間にそちらにも入る。
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
import { formatCoords } from "@/lib/profileCompletion";
import { geocodePrecisionNote, parseGeocodeSource } from "@/lib/geocodeSource";

export interface PlaceInputProps {
  /** 「生まれたところ」「いま住んでいるところ」など。 */
  label: string;
  lat: number | null;
  lon: number | null;
  /**
   * 決まった場所。
   *
   * `name` は**地名で選べたときだけ**入る（候補・郵便番号から拾った
   * 表示用の名前）。緯度経度を手で直したときは `undefined` になる。
   * **前の地名を残さないこと。**座標だけ変わって名前が残ると、
   * 別の場所に前の地名が付いたまま画面に出る。判定は座標で決まるので、
   * 名前は表示にしか使わない。
   */
  onChange: (lat: number, lon: number, name?: string) => void;
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
    optionalBadge: "ml-1.5 text-[10px] font-normal text-stone-600",
    currentLocation:
      "text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline shrink-0",
    input:
      "w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs text-stone-700 placeholder-stone-300 focus:outline-none focus:border-indigo-300",
    searching: "text-[10px] text-stone-600 animate-pulse",
    notice: "text-[10px] text-amber-600",
    resolve:
      "shrink-0 min-h-[36px] px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100",
    suggestion:
      "w-full text-left px-2.5 py-1.5 text-xs text-stone-700 hover:bg-indigo-50 transition-colors",
    picked: "flex items-center gap-1.5 text-[10px] text-stone-500",
    pinSize: 10,
    help: "text-xs text-stone-600 leading-relaxed",
    /* 押し所は 24px 角より小さくしない（WCAG 2.2 の Target Size
       (Minimum)）。実測 102 × 14px。字は変えず高さだけ確保する */
    coordsToggle:
      "inline-flex min-h-[24px] items-center self-start text-[10px] text-stone-600 hover:text-stone-800",
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
    resolve:
      "shrink-0 min-h-[42px] px-3 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700 hover:bg-rose-100",
    suggestion:
      "w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-rose-50 transition-colors",
    picked: "flex items-center gap-1.5 text-xs text-slate-500",
    pinSize: 12,
    help: "text-xs text-slate-500 leading-relaxed",
    coordsToggle:
      "inline-flex min-h-[24px] items-center self-start text-xs text-slate-400 hover:text-slate-600",
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
  /** 決めた点が粗いときの断り（/api/geocode の source から）。 */
  const [precisionNote, setPrecisionNote] = React.useState<string | null>(null);

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
        onChange(body.data.lat, body.data.lon, body.data.address);
        setPicked(body.data.address);
        setPrecisionNote(null);
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
    onChange(s.lat, s.lon, s.name);
    setPicked(s.name);
    setPrecisionNote(null);
    setQuery("");
    setSuggestions([]);
    setNotice(null);
  };

  /** 打った文字列をそのまま住所として決められるか（郵便番号は別の経路）。 */
  const canResolve = query.trim().length >= 2 && !normalizePostal(query);

  /**
   * 打った住所を番地まで当てて決める。候補（町丁目まで）を経由しない。
   *
   * `/api/geocode` は国土地理院を先に引き、番地を落とさない。粗い点
   * （source が normalize / nominatim）で返ったときは、その旨を出す。
   * 404 の文言は API のものをそのまま出す — URL を貼った人に住所の話を
   * 返さないため（SpotVerdict と同じ扱い）。
   */
  const resolveExact = async () => {
    const text = query.trim();
    if (!canResolve) return;
    setSearching(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const body = (await res.json()) as {
        lat?: unknown;
        lon?: unknown;
        name?: unknown;
        source?: unknown;
        error?: unknown;
      };
      if (
        !res.ok ||
        typeof body.lat !== "number" ||
        typeof body.lon !== "number"
      ) {
        setNotice(
          typeof body.error === "string" && body.error
            ? body.error
            : "その住所は見つかりませんでした。候補から選ぶか、緯度経度を直接入れてください。",
        );
        return;
      }
      const name =
        typeof body.name === "string" && body.name ? body.name : text;
      onChange(body.lat, body.lon, name);
      setPicked(name);
      setPrecisionNote(
        geocodePrecisionNote(parseGeocodeSource(body.source), "coords"),
      );
      setQuery("");
      setSuggestions([]);
    } catch {
      setNotice("住所を調べられませんでした。通信を確かめてください。");
    } finally {
      setSearching(false);
    }
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
          浮かないようにする。

          ラベルは min-w-fit。min-w-0 だと「ボタンを次の行へ落とす」より
          「ラベルを縮めて 2 行にする」が選ばれることがあり、直したはずの
          見え方に戻る（縮め方の判断はブラウザで差が出る）。縮まない
          下限を与えて、**先にボタンが落ちる**ようにする。 */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <label className={`${s.label} min-w-fit`}>
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

      <div className="flex min-w-0 items-stretch gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            /* 日本語入力の変換確定の Enter を拾わない（isComposing）。
               拾うと、変換の途中の綴りで住所を引いてしまう */
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void resolveExact();
          }}
          /* 何を入れる欄かはラベルが言っている。placeholder は**書き方の例**
             だけにする。以前は「市区町村・住所・郵便番号（例: …）」と説明を
             繰り返していて、3 列に並べたときに欄の幅を超えて途中で切れていた
             （利用者の報告 2026-08-28）。 */
          placeholder="例: 京都市南区 / 6018001"
          className={s.input}
        />
        {/* 番地まで打った人が「候補に無い」で止まらないための口。
            Enter と同じ。タッチ端末では Enter が見つけにくいので置く */}
        {canResolve && (
          <button
            type="button"
            onClick={() => void resolveExact()}
            disabled={searching}
            className={s.resolve}
          >
            この住所で決める
          </button>
        )}
      </div>

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
          <span>設定済み（{formatCoords(lat, lon)}）</span>
        ) : (
          <span className="text-stone-600">
            {optional ? "未設定でも判定は出ます" : "まだ設定されていません"}
          </span>
        )}
      </div>

      {precisionNote && <p className={s.notice}>{precisionNote}</p>}

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
              if (!Number.isFinite(v) || lon === null) return;
              /* 手で直したら地名は捨てる。座標だけ動いて名前が残ると、
                 別の場所に前の地名が付いたまま出る */
              setPicked(null);
              setPrecisionNote(null);
              onChange(v, lon);
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
              if (!Number.isFinite(v) || lat === null) return;
              setPicked(null);
              setPrecisionNote(null);
              onChange(lat, v);
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
