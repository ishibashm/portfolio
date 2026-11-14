import type { Metadata } from "next";
import Link from "next/link";
import { pageOpenGraph } from "@/lib/siteUrl";
import { KENSHO_PLANNED_THEMES, KENSHO_PRINCIPLES } from "@/lib/kenshoPlan";

const PAGE_TITLE = "たしかめる｜占いや言い伝えを公的データで検証する";
const PAGE_DESCRIPTION =
  "占いや言い伝えの主張を、人口動態統計・交通事故統計・気象庁データベースなどの公開データで統計的に検証する計画の一覧です。現在はすべて計画中で、解析手順と閾値を先に定めてから順次公開します。";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/kensho" },
  openGraph: pageOpenGraph("/kensho", PAGE_TITLE, PAGE_DESCRIPTION),
};

export default function KenshoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900">
      <article className="mx-auto max-w-[1700px] px-5 py-12 space-y-10">
        <nav aria-label="パンくず" className="text-sm text-slate-600">
          <Link href="/" className="hover:underline">
            ホーム
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">たしかめる</span>
        </nav>

        <header className="space-y-3">
          <p className="inline-block rounded-full border border-amber-300 bg-amber-50 px-3.5 py-1 text-xs font-bold text-amber-900">
            すべて計画中（検証結果はまだありません）
          </p>
          <h1 className="text-2xl font-bold font-serif sm:text-3xl">
            たしかめる｜占いや言い伝えを公的データで検証する
          </h1>
          <p className="text-sm leading-relaxed text-slate-700 max-w-4xl">
            占いや言い伝えで語られる主張のうち、公的統計で確かめられるものと確かめられないものを整理し、公開データで検証する計画の一覧です。現時点では検証結果やグラフ・結論はまだ無く、すべて「計画中」です。
          </p>
        </header>

        {/* 検証の原則 */}
        <section
          aria-labelledby="kensho-principles-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <h2
            id="kensho-principles-heading"
            className="text-lg font-bold font-serif text-slate-900"
          >
            検証の原則
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {KENSHO_PRINCIPLES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  {item.title}
                </h3>
                <p className="text-xs leading-relaxed text-slate-700">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 計画中の検証テーマ一覧 */}
        <section
          aria-labelledby="kensho-themes-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <div>
            <h2
              id="kensho-themes-heading"
              className="text-lg font-bold font-serif text-slate-900"
            >
              計画中の検証テーマ一覧（全{KENSHO_PLANNED_THEMES.length}件）
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              すべてのテーマは現在「計画中」です。データ集計前のため、数値の結果や結論は掲載していません。
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-slate-700">
                  <th scope="col" className="py-2.5 pr-3 whitespace-nowrap">
                    番号
                  </th>
                  <th scope="col" className="py-2.5 pr-4 whitespace-nowrap">
                    テーマ
                  </th>
                  <th scope="col" className="py-2.5 pr-4">
                    主張
                  </th>
                  <th scope="col" className="py-2.5 pr-4">
                    使う公開データ
                  </th>
                  <th scope="col" className="py-2.5 pr-4">
                    方法
                  </th>
                  <th scope="col" className="py-2.5 pr-4 whitespace-nowrap">
                    実現性
                  </th>
                  <th scope="col" className="py-2.5 whitespace-nowrap">
                    状態
                  </th>
                </tr>
              </thead>
              <tbody>
                {KENSHO_PLANNED_THEMES.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-200 align-top"
                  >
                    <td className="py-3 pr-3 font-semibold text-slate-700">
                      {row.id}
                    </td>
                    <td className="py-3 pr-4 font-bold text-slate-900 whitespace-nowrap">
                      {row.theme}
                    </td>
                    <td className="py-3 pr-4 text-slate-800 leading-relaxed">
                      {row.claim}
                    </td>
                    <td className="py-3 pr-4 text-slate-700 leading-relaxed">
                      {row.publicData}
                    </td>
                    <td className="py-3 pr-4 text-slate-700 leading-relaxed">
                      {row.method}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-800 whitespace-nowrap">
                      {row.feasibility}
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <span className="inline-block rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 関連する道具への案内 */}
        <section
          aria-labelledby="kensho-related-heading"
          className="rounded-2xl border border-slate-300 bg-white p-6 shadow-sm space-y-4"
        >
          <h2
            id="kensho-related-heading"
            className="text-lg font-bold font-serif text-slate-900"
          >
            このサイトの計算道具を試す
          </h2>
          <p className="text-sm text-slate-700">
            サイト内の暦・九星気学・六曜・市区町村の方位計算は、ブラウザのフォームまたはMCPから直接呼び出して確かめられます。
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/annai"
              className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 hover:border-rose-500 hover:bg-white"
            >
              案内役に聞く（/annai）
            </Link>
            <Link
              href="/mcp"
              className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 hover:border-rose-500 hover:bg-white"
            >
              MCPで使う（/mcp）
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
