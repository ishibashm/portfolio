import Link from "next/link";
import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { ContentDisclaimer } from "@/components/houi/ContentDisclaimer";
import { AdBanner } from "@/components/ads/AdBanner";
import { HOUI_BREADCRUMB_LABEL } from "@/lib/kigakuContent";
import { PREF_EDITORIAL } from "@/lib/prefEditorial";
import { PREF_REGION, prefNameByCode } from "@/lib/prefContent";
import { pageOpenGraph } from "@/lib/siteUrl";

/**
 * 都道府県ページのハブ。県の個別頁は /houi/pref/[code] として
 * 公開していたが、一覧ルート /houi/pref が無く 404 になっていた。
 * 47 県への入口と、各頁が何をまとめているかの説明を置く。
 */

const TITLE = "都道府県別の家賃相場と方位｜県の重心から見た引越し先";
const DESCRIPTION =
  "47都道府県について、県の面積重心から見た八方位の市区町村と、住宅・土地統計調査に基づく借家の家賃水準をまとめています。県ごとの解説から、市区町村の頁へ進めます。";

export const metadata: Metadata = {
  alternates: { canonical: "/houi/pref" },
  title: TITLE,
  description: DESCRIPTION,
  openGraph: pageOpenGraph("/houi/pref", TITLE, DESCRIPTION),
};

export default function PrefIndexPage() {
  const regions = new Map<string, { code: string; name: string }[]>();
  for (const code of Object.keys(PREF_EDITORIAL).sort()) {
    const name = prefNameByCode(code);
    if (!name) continue;
    const region = PREF_REGION[code] ?? "その他";
    if (!regions.has(region)) regions.set(region, []);
    regions.get(region)!.push({ code, name });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <BreadcrumbJsonLd
        items={[
          { name: HOUI_BREADCRUMB_LABEL, path: "/houi" },
          { name: "エリア別", path: "/houi/area" },
          { name: "都道府県", path: "/houi/pref" },
        ]}
      />
      <article className="max-w-[1700px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/houi" className="hover:text-rose-600">
            {HOUI_BREADCRUMB_LABEL}
          </Link>
          <span className="mx-2">/</span>
          <Link href="/houi/area" className="hover:text-rose-600">
            エリア別
          </Link>
          <span className="mx-2">/</span>
          <span>都道府県</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          都道府県別の家賃相場と方位
        </h1>
        <p className="mt-5 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          県ごとの頁では、その県の面積重心を起点に市区町村を八方位へ分け、住宅・土地統計調査（2023
          年、e-Stat）の公表値から借家の家賃水準と空き家率を見比べます。文章が担当するのは地理の構造で、額そのものは表が公表値を出します。いま募集中の部屋の一覧ではありません。
        </p>
        <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-slate-700">
          出発地の市区町村から見た街の並びは、
          <Link href="/houi/area" className="underline hover:text-rose-600">
            エリア別の一覧
          </Link>
          から選べます。本命星と年盤の早見は
          <Link href="/houi" className="underline hover:text-rose-600">
            引越しの方位
          </Link>
          にあります。地域ページの書き方は
          <Link href="/editorial" className="underline hover:text-rose-600">
            編集方針
          </Link>
          にまとめています。
        </p>

        <div className="mt-10 space-y-8">
          {[...regions.entries()].map(([region, prefs]) => (
            <section key={region}>
              <h2 className="text-base font-bold font-serif border-b border-slate-300 pb-2">
                {region}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {prefs.map((p) => (
                  <li key={p.code}>
                    <Link
                      prefetch={false}
                      href={`/houi/pref/${p.code}`}
                      className="inline-block px-3 py-1.5 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
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
