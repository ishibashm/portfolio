"use client";

import React, { useSyncExternalStore } from "react";
import { LocalNewsPanel } from "@/components/news/LocalNewsPanel";

/**
 * /news の県の選択欄。選んだ県の地名で見出しを絞る。
 *
 * ## URL は 1 つのまま、頁は静的のまま
 *
 * `?pref=13` で県を指すが、サーバ側では読まない。頁で searchParams を
 * 読むと dynamic になり、sitemap（prerender された頁しか拾わない）から
 * /news が消える（頁の註）。県ごとの別 URL（/news/pref/13 …）も作らない。
 * 全国の見出しを地名で絞っただけの頁が 47 枚できるのは、#379 で
 * noindex にした雛形の量産と同じ形になる。
 *
 * だからここは**開いてから**端末側で `?pref=` を読み、既存の
 * `/api/news/local`（6 時間キャッシュの取得結果を手元で絞るだけ。
 * 配信元へは行かない）に聞く。一覧の描画は県ページと同じ
 * LocalNewsPanel を使う（同じ欄を 2 か所に書かない）。
 *
 * ## 選択は URL に置く
 *
 * localStorage に覚えると「効果の中で読んで setState」になり、
 * set-state-in-effect に当たる（CLAUDE.md 4 節）。URL なら共有できるし、
 * useSyncExternalStore で読めばサーバ描画は「未選択」、端末では
 * `?pref=` の値、と水和のずれも React が面倒を見る（NewsCards と同じ）。
 *
 * ## 断り
 *
 * 出るのは地名の一致で拾った見出しで、方位の吉凶とは無関係。
 * 地元発の配信を取っているわけではない（取得先は増やさない。
 * lib/localNews の註）。
 */

export interface PrefOption {
  /** JIS 2 桁。 */
  code: string;
  /** 「東京都」のように接尾辞ごと。 */
  name: string;
}

/** 選択の変更を、同じ頁の中の購読者に知らせる行事名。 */
const CHANGE_EVENT = "cp:news-pref";

function subscribe(cb: () => void): () => void {
  window.addEventListener("popstate", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function readPrefFromUrl(): string {
  return new URLSearchParams(window.location.search).get("pref") ?? "";
}

/** サーバ描画と初回の水和は「未選択」。端末で `?pref=` を読んで揃う。 */
function serverSnapshot(): string {
  return "";
}

function writePrefToUrl(code: string) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("pref", code);
  else url.searchParams.delete("pref");
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function PrefNewsPicker({ options }: { options: PrefOption[] }) {
  const code = useSyncExternalStore(subscribe, readPrefFromUrl, serverSnapshot);
  /* 知らない値（打ち間違い・古いリンク）は未選択と同じに扱う */
  const selected = options.find((o) => o.code === code);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="news-pref" className="text-sm font-bold text-stone-800">
          県で絞る
        </label>
        <select
          id="news-pref"
          value={selected?.code ?? ""}
          onChange={(e) => writePrefToUrl(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-800"
        >
          <option value="">選択してください</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] leading-relaxed text-stone-500">
          {
            "配信元の見出しから、その県の地名に当たるものだけを出します。地元の配信を取っているわけではありません。"
          }
        </span>
      </div>
      {selected && (
        <LocalNewsPanel
          key={selected.code}
          prefCode={selected.code}
          placeName={selected.name}
          emptyText={`${selected.name}の地名に当たる見出しは、いまありません。県ページには相場の動きがあります。`}
        />
      )}
    </section>
  );
}
