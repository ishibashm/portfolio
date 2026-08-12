import Link from "next/link";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import type { Metadata } from "next";
import { areasByPref } from "@/lib/areaContent";
import { AdBanner } from "@/components/ads/AdBanner";

export const metadata: Metadata = {
  alternates: { canonical: "/houi/area" },
  title: "エリア別の方位と家賃相場",
  description:
    "出発地の市区町村を選ぶと、八方位それぞれにどの市区町村があり、家賃相場がいくらかを確認できます。吉方位が分かっても、その方位に何があるか分からないと引越し先は決められません。",
};

export default function Page() {
  // 県ごとにまとめる。掲載数の多い順だと県が入り混じって探しにくい。
  const byPref = areasByPref();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <article className="max-w-[860px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            方位の早見表
          </Link>
          <span className="mx-2">/</span>
          <span>エリア別</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          エリア別の方位と家賃相場
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          吉方位が分かっても、その方位に実際どんな街があっていくらなのかが分からないと引越し先は決められません。
          <b>いま住んでいる市区町村</b>を選ぶと、そこから見た八方位それぞれのエリアと家賃相場を確認できます。
        </p>

        <div className="mt-8 space-y-6">
          {[...byPref.entries()].map(([pref, list]) => (
            <section key={pref}>
              <h2 className="text-base font-bold font-serif border-b border-slate-300 pb-2">
                {pref}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {list.length}エリア
                </span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {list.map((a) => (
                  <Link prefetch={false}
                    key={a.code}
                    href={`/houi/area/${a.code}`}
                    className="px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                  >
                    {a.city}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10">
          <AdBanner />
        </div>

        <ContentDisclaimer />
      </article>
    </div>
  );
}
