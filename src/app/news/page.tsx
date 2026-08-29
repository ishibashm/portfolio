import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper, ExternalLink, Library } from "lucide-react";
import { fetchAllFeeds } from "@/lib/fetchNews";
import { NEWS_LINKS } from "@/data/newsSources";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

const TITLE = "不動産・建築の情報を集める";
const DESCRIPTION =
  "不動産と建築の動きを追うための情報収集ページ。専門メディアと官公庁の新着見出しに、建築雑誌・競売・URなど一次情報への入り口をまとめました。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/news" },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/news`,
    type: "website",
    images: ["/ogp.png"],
  },
};

/**
 * 見出しの取得はサーバ側で 6 時間キャッシュされる（fetchNews）。
 * 頁自体は動的に描く。ビルド時に焼くと、外に出られない CI で
 * 全フィードが空のまま HTML に固まるため。
 */
export const dynamic = "force-dynamic";

/** 見出しの日付。日本の媒体なので日本時間で丸める。 */
function jstDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).format(t);
}

export default async function Page() {
  const feeds = await fetchAllFeeds();
  const alive = feeds.filter((f) => f.ok);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 p-4 font-sans text-stone-800 md:p-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Newspaper className="h-5 w-5 text-rose-500" aria-hidden />
            {TITLE}
          </h1>
          <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-stone-500">
            {
              "不動産と建築の動きを追うための入り口です。見出しは配信元の RSS から 6 時間ごとに取得し、"
            }
            <b>リンク先（配信元）で読む</b>
            {
              "形にしています。本文の転載はしません。並びは新着順のみで、当サイトの評価や吉凶とは無関係です。"
            }
          </p>
        </header>

        {/* 新着見出し。取得できた配信元だけ出す */}
        {alive.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {alive.map((feed) => (
              <div
                key={feed.source.id}
                className="rounded-2xl border border-stone-200 bg-white p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-bold text-stone-800">
                    {feed.source.name}
                  </h2>
                  <a
                    href={feed.source.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[10px] font-semibold text-indigo-600 underline"
                  >
                    配信元を開く
                  </a>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
                  {feed.source.note}
                </p>
                <ul className="mt-2 space-y-1.5 border-t border-stone-100 pt-2">
                  {feed.items.map((item) => {
                    const date = jstDate(item.publishedAt);
                    return (
                      <li key={item.link} className="flex gap-2 text-xs">
                        <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
                          {date ?? ""}
                        </span>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="leading-snug text-stone-700 hover:text-rose-600 hover:underline"
                        >
                          {item.title}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-stone-200 bg-white p-6 text-xs text-stone-500">
            いま新着見出しを取得できていません。時間をおいて開き直すか、下の情報源へ直接どうぞ。
          </section>
        )}

        {/* リンク集。フィードの無い媒体・データベース */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800">
            <Library className="h-4 w-4 text-stone-500" aria-hidden />
            一次情報への入り口
          </h2>
          <p className="mt-0.5 max-w-[70ch] text-[10px] leading-relaxed text-stone-500">
            {"新着配信の無い媒体とデータベースです。競売・UR・雑誌はここから。"}
          </p>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
            {NEWS_LINKS.map((link) => (
              <li key={link.url} className="text-xs leading-relaxed">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-stone-800 hover:text-rose-600 hover:underline"
                >
                  {link.name}
                  <ExternalLink
                    className="h-3 w-3 text-stone-400"
                    aria-hidden
                  />
                </a>
                <span className="block text-[10px] text-stone-500">
                  {link.note}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 当サイトの道具への橋。ここだけが内部リンク */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4 text-xs leading-relaxed text-stone-600">
          {"記事で気になった地域は、当サイトの "}
          <Link
            href="/relocation/purchase"
            className="font-semibold text-indigo-600 underline"
          >
            購入相場
          </Link>
          {" と "}
          <Link
            href="/relocation/market"
            className="font-semibold text-indigo-600 underline"
          >
            家賃相場
          </Link>
          {" で実際の成約データと突き合わせられます。土地の見方は "}
          <Link
            href="/blog/how-to-choose-land"
            className="font-semibold text-indigo-600 underline"
          >
            土地の選び方
          </Link>
          {" にまとめてあります。"}
        </section>
      </div>
    </div>
  );
}
