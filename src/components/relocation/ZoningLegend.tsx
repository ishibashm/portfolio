"use client";

import { useState } from "react";

import {
  ZONING_DISCLAIMER,
  ZONING_FILL,
  ZONING_ORDER,
  ZONING_SUMMARY,
  type ZoningName,
} from "@/utils/zoning";

/**
 * 用途地域の凡例。**押すと 1 区分だけ残る。**
 *
 * 色だけで 13 区分は見分けられない。`dataviz` の検証にかけた実測で、
 * 総当たりの最悪が ΔE 6.8（読みやすさの下限は 15）。地図では商業地域と
 * 工業地域が実際に隣接するので、効くのは総当たりのほう。色相を入れ替えて
 * 何通りか試したが、**13 色を総当たりで見分けられる配色は作れない。**
 *
 * だから色に区分を背負わせない。ここに名前を並べ、押した区分だけを地図に
 * 残す。全表示は「この辺は商業／この辺は住宅」を大づかみに見るためのもの。
 *
 * 詳しくは `utils/zoning` の `ZONING_FILL` のコメント。
 */

export interface ZoningLegendProps {
  selected: ZoningName | null;
  onSelect: (name: ZoningName | null) => void;
  /** 縮尺が足りない・全部は出せていない、などの断り。 */
  notice?: string | null;
}

export function ZoningLegend({
  selected,
  onSelect,
  notice,
}: ZoningLegendProps) {
  /*
    13 区分の一覧と説明をたためるようにする。**狭い画面では既定で閉じる。**

    スマホの実機で、この凡例だけで画面幅の半分・高さの 3 分の 2 を覆って
    いた（利用者の指摘）。区分を選んでいるあいだは開いたままにしたいので、
    選択中は閉じられても見出しに残す。
  */
  const [open, setOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-baseline gap-1.5 text-xs font-bold text-stone-700"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <span>用途地域</span>
          {/* たたんでいても、いま何で絞っているかは見えるようにする */}
          {!open && selected && (
            <span className="text-[10px] font-normal text-indigo-700">
              {selected}
            </span>
          )}
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-[10px] text-indigo-700 underline"
          >
            全部を出す
          </button>
        )}
      </div>

      {!open ? null : (
        <>
          <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
            押すとその区分だけ残ります。区画を押すと建蔽率・容積率が出ます。
          </p>

          {notice && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-relaxed text-amber-900">
              {notice}
            </p>
          )}

          <ul className="mt-2 space-y-0.5">
            {ZONING_ORDER.map((name) => {
              const active = selected === name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onSelect(active ? null : name)}
                    aria-pressed={active}
                    title={ZONING_SUMMARY[name]}
                    className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors ${
                      active ? "bg-indigo-50" : "hover:bg-stone-50"
                    }`}
                  >
                    {/* 色の札。名前が必ず隣にあるので、色だけで読ませない */}
                    <span
                      className="h-3 w-3 shrink-0 rounded-[2px] border border-stone-300"
                      style={{ background: ZONING_FILL[name] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-stone-700">
                      {name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <p className="mt-2 border-t border-stone-100 pt-2 text-[10px] leading-relaxed text-stone-600">
              {ZONING_SUMMARY[selected]}
            </p>
          )}

          <div className="mt-2 border-t border-stone-100 pt-2">
            {ZONING_DISCLAIMER.map((line) => (
              <p
                key={line}
                className="text-[10px] leading-relaxed text-stone-500"
              >
                {line}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
