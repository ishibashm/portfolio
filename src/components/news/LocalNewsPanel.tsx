"use client";

import React from "react";
import Link from "next/link";

/**
 * その地域のニュース。市区町村ページと県ページの下に置く。
 *
 * ## 頁の中で取らない
 *
 * 市区町村ページは 1,022 枚あって静的に焼いている。頁の中で取りに行くと
 * ビルドで 1,022 回ぶん試すことになる（CI は外に出られないので、待った
 * うえで空になる）。ここは開いてから `/api/news/local` に聞く。
 *
 * ## 出るものが無ければ何も出さない
 *
 * 地方の市区町村では 0 件のほうが普通。「ニュースはありません」の枠を
 * 常に置くと、頁の下に空の箱が並ぶだけになる。**0 件なら丸ごと消す。**
 *
 * ## 県で当たったものは断る
 *
 * 市の名前で拾えなかった頁（同名の区が複数ある場合）は県名で拾う。
 * その行には「県内」と添えて、市の話ではないことを分かるようにする。
 */

interface LocalNewsItem {
  title: string;
  link: string;
  publishedAt: string | null;
  source: string;
  scope: "city" | "pref";
  matched: string;
}

export interface LocalNewsPanelProps {
  /** 市区町村コード。県ページでは渡さない。 */
  areaCode?: string;
  /** 県コード。市区町村ページでは渡さない。 */
  prefCode?: string;
  /** 見出しに出す地域の名前。 */
  placeName: string;
}

/** 見出しの日付。日本の媒体なので日本時間で丸める。 */
function jstDate(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(t);
}

export function LocalNewsPanel({
  areaCode,
  prefCode,
  placeName,
}: LocalNewsPanelProps) {
  const [items, setItems] = React.useState<LocalNewsItem[]>([]);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    const query = areaCode
      ? `area=${encodeURIComponent(areaCode)}`
      : prefCode
        ? `pref=${encodeURIComponent(prefCode)}`
        : null;
    if (!query) {
      setDone(true);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/news/local?${query}`);
        if (!alive) return;
        const body = (await res.json()) as { data?: LocalNewsItem[] };
        setItems(Array.isArray(body.data) ? body.data : []);
      } catch {
        /* 取れなくても頁は壊さない。何も出さないだけ */
        if (alive) setItems([]);
      } finally {
        if (alive) setDone(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [areaCode, prefCode]);

  /* 読み込み中も 0 件も、何も出さない。空の箱を置かない */
  if (!done || items.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-bold text-stone-800">
        {placeName}に関するニュース
      </h2>
      <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
        {
          "不動産・建築の配信元から、地名の一致で拾った見出しです。方位の吉凶とは関係ありません。"
        }
      </p>
      <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
        {items.map((n) => (
          <li key={n.link} className="flex gap-2 text-xs">
            <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
              {jstDate(n.publishedAt)}
            </span>
            <span className="min-w-0">
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium leading-snug text-stone-700 hover:text-rose-600 hover:underline"
              >
                {n.title}
              </a>
              <span className="ml-1 whitespace-nowrap text-[10px] text-stone-400">
                {n.source}
              </span>
              {/* 市の名前で拾えなかったものは、市の話とは限らない */}
              {n.scope === "pref" && (
                <span className="ml-1 whitespace-nowrap text-[10px] text-stone-400">
                  （県内）
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-stone-500">
        {"ほかの見出しは "}
        <Link href="/news" className="text-indigo-600 underline">
          不動産・建築の情報
        </Link>
        {" にまとめてあります。"}
      </p>
    </section>
  );
}
