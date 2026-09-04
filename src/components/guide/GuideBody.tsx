import Link from "next/link";
import type { ReactNode } from "react";
import { GUIDE_INLINE, type GuideBlock } from "@/lib/guideContent";

/**
 * ガイド本文の描画。
 *
 * 本文は src/lib/guideContent.ts に構造化して持たせ、ここは見た目だけを持つ。
 * 強調とリンクだけは文中に置きたいので、その2つに限った記法を解釈する。
 * HTML をそのまま流し込む形にはしない（本文が増えたときに崩れ方が読めなくなる）。
 *
 * 記法そのもの（GUIDE_INLINE）は本文と同じ guideContent.ts に置いてある。
 * 構造化データ用の平文化が同じ規則を要るので、写しを作らない。
 */

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;

  GUIDE_INLINE.lastIndex = 0;
  while ((m = GUIDE_INLINE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <b key={`b${n++}`} className="font-bold text-slate-900">
          {m[1]}
        </b>,
      );
    } else {
      nodes.push(
        <Link
          key={`l${n++}`}
          href={m[3]}
          className="font-bold text-rose-600 hover:underline"
        >
          {m[2]}
        </Link>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.k) {
    case "h":
      return (
        <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2 mt-12 mb-1 scroll-mt-6">
          {block.t}
        </h2>
      );

    case "p":
      return (
        <p className="mt-4 text-sm leading-relaxed text-slate-700">
          {inline(block.t)}
        </p>
      );

    case "list":
      return (
        <ul className="mt-4 space-y-2">
          {block.items.map((it, i) => (
            <li
              key={i}
              className="relative pl-5 text-sm leading-relaxed text-slate-700"
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-[0.65em] w-1.5 h-1.5 rounded-full bg-rose-400"
              />
              {inline(it)}
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="mt-5 space-y-3">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center font-mono">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-slate-700 pt-0.5">
                {inline(it)}
              </span>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        // 列が多い表はスマホで必ずはみ出す。ページ全体を横スクロールさせず、
        // 表の中だけで収める。
        <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-300 bg-white/90">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100/80">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="text-left font-bold text-slate-700 px-3 py-2.5 whitespace-nowrap border-b border-slate-300"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate-200 last:border-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="px-3 py-2.5 align-top text-slate-700 leading-relaxed"
                    >
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "note":
      return (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50/80 p-4">
          <p className="text-xs font-bold text-amber-900">{block.t}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-700">
            {inline(block.body)}
          </p>
        </div>
      );

    case "cta":
      return (
        <div className="mt-8">
          <Link
            href={block.href}
            className="inline-flex px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
          >
            {block.label}を開く →
          </Link>
        </div>
      );
  }
}

export function GuideBody({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}
