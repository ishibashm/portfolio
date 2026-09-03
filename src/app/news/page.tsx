import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper, ExternalLink, Library } from "lucide-react";
import { fetchAllFeeds, mergeLatest } from "@/lib/fetchNews";
import { NEWS_LINKS } from "@/data/newsSources";
import { SITE_NAME } from "@/lib/siteStructure";
import { SITE_URL } from "@/lib/siteUrl";

const TITLE = "不動産・建築の情報を集める";
const DESCRIPTION =
  "不動産と建築の動きを追うための情報収集ページ。専門メディア・官公庁・UR 都市機構の新着見出しに、建築雑誌・競売・統計など一次情報への入り口をまとめました。";

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
 * ISR。sitemap（next-sitemap）は prerender された頁しか拾わないので、
 * force-dynamic にすると索引から消える。ビルド時（CI は外に出られない）の
 * 取得は fetchNews が 5 秒で諦めて空を返すため、初回だけ見出し無しの
 * HTML になるが、本番で再生成された時点で埋まる。
 *
 * 値は 60 だが、見出しの取得はそれと独立に fetch キャッシュ 6 時間
 * （fetchNews の revalidate）で守られる。頁の再生成は手元のキャッシュを
 * 読み直すだけで、配信元へは行かない。60 より大きくしても、ルート
 * レイアウトの revalidate 60 に切り下げられる（/blog の注記と同じ）。
 */
export const revalidate = 60;

/** 新着一覧に出す件数。媒体ごとの札は別に全部出るので、ここは頭出し。 */
const LATEST_COUNT = 24;

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
  const down = feeds.filter((f) => !f.ok);
  /* 全配信元の新着をまとめた一覧。媒体ごとの札より上に置く */
  const latest = mergeLatest(feeds, LATEST_COUNT);

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
              "不動産と建築の動きを追うための入り口です。見出しと要約の冒頭は配信元の RSS から 6 時間ごとに取得し、"
            }
            <b>続きはリンク先（配信元）で読む</b>
            {
              "形にしています。本文の転載はしません。並びは新着順のみで、当サイトの評価や吉凶とは無関係です。"
            }
          </p>
        </header>

        {/* 全配信元の新着。媒体をまたいで日付順に見たいのが最初の
            要求（「1 ページで情報密度を高く」）なので、媒体ごとの
            札より前に置く */}
        {latest.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-bold text-stone-800">
              新着（全{alive.length}媒体）
            </h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
              {
                "取得できた配信元の見出しを日付順にまとめたものです。媒体ごとに読むなら下の一覧へ。"
              }
            </p>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-stone-100 pt-3 lg:grid-cols-2 xl:grid-cols-3">
              {latest.map(({ item, source }) => {
                const date = jstDate(item.publishedAt);
                return (
                  <li
                    key={`${source.id}:${item.link}`}
                    className="flex gap-2 text-xs"
                  >
                    <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
                      {date ?? ""}
                    </span>
                    <span className="min-w-0">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium leading-snug text-stone-700 hover:text-rose-600 hover:underline"
                      >
                        {item.title}
                      </a>
                      {/* 出典は必ず添える。どこの記事か分からないまま
                          並べない */}
                      <span className="ml-1 whitespace-nowrap text-[10px] text-stone-400">
                        {source.name}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 配信元ごとの見出し。取得できた配信元だけ出す */}
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
                <ul className="mt-2 space-y-2 border-t border-stone-100 pt-2">
                  {feed.items.map((item) => {
                    const date = jstDate(item.publishedAt);
                    return (
                      <li key={item.link} className="flex gap-2 text-xs">
                        <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-stone-400">
                          {date ?? ""}
                        </span>
                        <div className="min-w-0">
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium leading-snug text-stone-700 hover:text-rose-600 hover:underline"
                          >
                            {item.title}
                          </a>
                          {/* 要約は配信元の description の先頭 120 字。
                              引用の範囲に収め、続きはリンク先で読む */}
                          {item.summary && (
                            <p className="mt-0.5 text-[10px] leading-relaxed text-stone-500">
                              {item.summary}
                            </p>
                          )}
                        </div>
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

        {/* 取れなかった配信元。以前は黙って消していたので、載せた
            はずの媒体が出ないとき、URL が違うのか一時的な失敗なのか
            画面から分からなかった（BUILT が出ない、と実際に報告が
            来た）。名前だけは必ず出す */}
        {down.length > 0 && alive.length > 0 && (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-3 text-[10px] leading-relaxed text-stone-500">
            {"いま見出しを取得できていない配信元: "}
            {down.map((feed, i) => (
              <span key={feed.source.id}>
                {i > 0 && "、"}
                <a
                  href={feed.source.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-stone-600 underline"
                >
                  {feed.source.name}
                </a>
              </span>
            ))}
            {
              "。配信の一時的な停止か、配信元が RSS をやめた可能性があります。リンクから直接どうぞ。"
            }
          </section>
        )}

        {/* リンク集。フィードの無い媒体・データベース */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-stone-800">
            <Library className="h-4 w-4 text-stone-500" aria-hidden />
            一次情報への入り口
          </h2>
          <p className="mt-0.5 max-w-[70ch] text-[10px] leading-relaxed text-stone-500">
            {
              "新着配信の無い媒体とデータベースです。競売・統計・雑誌はここから。"
            }
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
