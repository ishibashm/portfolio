import Link from "next/link";
import type { ReactNode } from "react";
import { FaqJsonLd } from "@/components/JsonLd";
import type { HousingSnapshotData } from "@/lib/housingSnapshot";
import {
  RENT_AVERAGE_NOTE,
  RENT_METHOD_NOTE,
  rentComparison,
  rentSummary,
  type RentRow,
} from "@/lib/rentOverview";

export function RentOverview({
  snapshot,
  code,
  name,
  rank,
  count,
  source,
}: {
  snapshot: HousingSnapshotData;
  code?: string;
  name: string;
  rank?: number;
  count: number;
  /** 出典・加工の明記・API クレジット。e-Stat の規約の文言は頁ごとに
      書く決まり（__tests__/estatApiCredit.test.ts）なので、頁から渡す */
  source: ReactNode;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-300 bg-white/90 p-5">
      <h2 className="text-base font-bold font-serif">家賃相場の要点</h2>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {snapshot.year}年 住宅・土地統計調査。データ生成日時：
        <time dateTime={snapshot.generatedAt}>
          {new Date(snapshot.generatedAt).toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
        （当サイトで集計し直した日。調査日とは異なります）。
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {code
          ? rentSummary(snapshot, code, name)
          : `${name}では、当サイトで頁があり家賃の公表値がある${count}市区町村を比較できます。`}
      </p>
      {rank !== undefined && (
        <p className="mt-2 text-sm text-slate-700">
          1㎡あたり家賃は、県内の比較対象{count}市区町村中、安い順で{rank}
          位です（同額は同順位）。
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {RENT_AVERAGE_NOTE}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {RENT_METHOD_NOTE}
      </p>
      {source}
    </section>
  );
}

export function RentComparisonTable({
  title,
  rows,
  origin,
}: {
  title: string;
  rows: (RentRow & { rank?: number })[];
  origin?: RentRow["figures"];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-bold font-serif">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-600">
          比較できる市区町村がありません。
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-300 bg-white/90">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="p-3">
                  市区町村
                </th>
                <th scope="col" className="p-3">
                  家賃（円/㎡・月）
                </th>
                <th scope="col" className="p-3">
                  空き家率
                </th>
                {origin !== undefined && (
                  <th scope="col" className="p-3">
                    この街との家賃差
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-slate-200">
                  <th scope="row" className="p-3 font-normal">
                    {r.rank !== undefined && `${r.rank}位 `}
                    <Link
                      prefetch={false}
                      href={`/houi/area/${r.code}`}
                      className="hover:text-rose-600 underline"
                    >
                      {r.city}
                    </Link>
                  </th>
                  <td className="p-3 font-mono">
                    {r.figures?.rentPerSqm?.toLocaleString("ja-JP") ??
                      "公表値なし"}
                  </td>
                  <td className="p-3 font-mono">
                    {r.figures?.vacancyRate != null
                      ? `${(r.figures.vacancyRate * 100).toFixed(1)}%`
                      : "公表値なし"}
                  </td>
                  {origin !== undefined && (
                    <td className="p-3">{rentComparison(origin, r.figures)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RentFaq({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  return (
    <section className="mt-10">
      <FaqJsonLd items={items} />
      <h2 className="text-xl font-bold font-serif border-b border-slate-300 pb-2">
        家賃相場についてよくある質問
      </h2>
      <dl className="mt-4 space-y-4">
        {items.map((item) => (
          <div key={item.question}>
            <dt className="text-sm font-bold">{item.question}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-slate-700">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
