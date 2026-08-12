"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicPractitioner } from "@/lib/practitioners";

/**
 * 記事の末尾に置く、鑑定士への導線。
 *
 * 記事は計算結果を出せるが「うちの事情だとどうか」には答えられない。
 * そこに応えられる人を並べておくと、読み手には次の行き先ができる。
 *
 * 公開中の掲載が 0 件のときは何も描かない。600 ページ以上に空の欄が
 * 並ぶと未完成のサイトに見える（審査でも不利に働く）。
 */
export function PractitionerStrip({ limit = 3 }: { limit?: number }) {
  const [rows, setRows] = useState<PublicPractitioner[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/practitioners?limit=${limit}`)
      .then((r) => r.json())
      .then((j) => {
        if (alive) setRows(j.success ? j.data : []);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [limit]);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="mt-10 rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
      <h2 className="text-sm font-bold text-stone-800">
        この方位について相談できる人
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        掲載は登録制です。内容は各鑑定士によるもので、当サイトが鑑定の結果を保証するものではありません。
      </p>
      <ul className="mt-4 space-y-3">
        {rows.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-stone-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-stone-800">
                {p.displayName}
              </span>
              <span className="text-[11px] text-stone-500">{p.area}</span>
            </div>
            <p className="mt-1 text-xs text-stone-600">{p.headline}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.specialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600"
                >
                  {s}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Link
        href="/practitioners"
        className="mt-4 inline-block text-xs text-emerald-700 underline underline-offset-2"
      >
        鑑定士の一覧を見る
      </Link>
    </section>
  );
}
