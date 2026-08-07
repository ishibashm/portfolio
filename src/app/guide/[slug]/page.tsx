import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import { AdBanner } from "@/components/ads/AdBanner";
import { GuideBody } from "@/components/guide/GuideBody";
import { GUIDE_INDEX, GUIDE_PAGES, findGuidePage } from "@/lib/guideContent";
import { SITE_NAME } from "@/lib/siteStructure";

/**
 * ガイドの各章。本文は guideContent.ts 側に持たせている。
 *
 * 章は固定なので静的生成し、定義に無い slug は 404 にする。
 * dynamicParams を開けると、打ち間違いの URL が薄い内容のページとして
 * 生成されてしまう。
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findGuidePage(slug);
  if (!page) return {};

  const path = `/guide/${page.slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      images: ["/ogp.png"],
      title: `${page.title} | ${SITE_NAME}`,
      description: page.description,
      url: `https://cloud-palette.com${path}`,
      type: "article",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findGuidePage(slug);
  if (!page) notFound();

  const path = `/guide/${page.slug}`;
  const index = GUIDE_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = index > 0 ? GUIDE_PAGES[index - 1] : null;
  const next =
    index < GUIDE_PAGES.length - 1 ? GUIDE_PAGES[index + 1] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf7f5] via-[#f5efe9] to-[#f0e9e1] text-slate-900 font-sans">
      <ArticleJsonLd
        headline={page.title}
        description={page.description}
        path={path}
        keywords={["使い方", page.nav, "引越し", "吉方位"]}
      />
      <BreadcrumbJsonLd
        items={[
          { name: GUIDE_INDEX.title, path: "/guide" },
          { name: page.nav, path },
        ]}
      />

      <article className="max-w-[820px] mx-auto px-5 py-12">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/guide" className="hover:text-rose-600">
            {GUIDE_INDEX.title}
          </Link>
          <span className="mx-2">/</span>
          <span>{page.nav}</span>
        </nav>

        <h1 className="text-3xl md:text-4xl font-bold font-serif tracking-tight leading-snug">
          {page.title}
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          {page.lead}
        </p>

        {page.target && (
          <Link
            href={page.target.href}
            className="mt-6 inline-flex px-5 py-2.5 rounded-full border border-slate-300 bg-white text-xs font-bold hover:border-rose-400 transition-colors"
          >
            {page.target.label}を開く →
          </Link>
        )}

        <GuideBody blocks={page.blocks} />

        <div className="mt-12">
          <AdBanner />
        </div>

        {/* 前後の章。通しで読む人がいるので順路を残す */}
        <nav className="mt-10 pt-6 border-t border-slate-300 flex flex-wrap gap-3 justify-between">
          {prev ? (
            <Link
              href={`/guide/${prev.slug}`}
              className="px-4 py-2 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
            >
              ← {prev.nav}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/guide/${next.slug}`}
              className="px-4 py-2 rounded-full border border-slate-300 bg-white text-xs font-semibold hover:border-rose-400 transition-colors"
            >
              {next.nav} →
            </Link>
          ) : (
            <span />
          )}
        </nav>

        <div className="mt-6">
          <Link href="/guide" className="text-xs font-bold text-rose-600 hover:underline">
            使い方ガイドの目次へ戻る
          </Link>
        </div>
      </article>
    </div>
  );
}
