import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper, ExternalLink, Library } from "lucide-react";
import { fetchAllFeeds, mergeLatest } from "@/lib/fetchNews";
import { groupFeeds } from "@/lib/newsGrouping";
import { topicOf } from "@/lib/newsTopics";
import { NewsCards, type NewsCardEntry } from "@/components/news/NewsCards";
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
/**
 * まとめた札で、1 区分に出す見出しの件数。
 *
 * UR の入札は 10 本のフィードから来るので、全部並べると 1 枚の札が
 * 200 行になる。頭出しにして、続きは配信元で読む形にする。
 */
const PER_SECTION_COUNT = 6;

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
  /*
    札は「フィード 1 本 = 1 枚」ではなく「発信元 1 つ = 1 枚」。
    配信を何本にも分けている発信元（UR 都市機構は 12 本）が札を
    占めて、他の媒体を押し出さないようにする。
  */
  const layout = groupFeeds(feeds, PER_SECTION_COUNT);
  /* 数えるのは発信元。フィードの本数ではない */
  const sourceCount = layout.groups.length + layout.singles.length;
  /*
    カードに渡すのは素の値だけ。FeedSource をそのまま渡すと台帳の全項目が
    クライアントへ流れる。色分けの鍵は束があれば束（UR の 12 本を 1 色に）。
  */
  const cardEntries: NewsCardEntry[] = latest.map((entry) => ({
    title: entry.item.title,
    link: entry.item.link,
    publishedAt: entry.item.publishedAt,
    dateLabel: jstDate(entry.item.publishedAt),
    summary: entry.item.summary,
    sourceId: entry.source.id,
    sourceName: entry.source.name,
    sourceKey: entry.source.group ?? entry.source.id,
    topic: topicOf(entry),
  }));

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
            札より前に置く。カードと一覧の切り替えは NewsCards 側 */}
        {cardEntries.length > 0 && (
          <NewsCards entries={cardEntries} sourceCount={sourceCount} />
        )}

        {/* まとめた札。配信を何本にも分けている発信元は、区分ごとに
            1 枚へたたむ。フィードの本数ぶん札を並べると、他の媒体が
            画面から押し出される（UR 都市機構は配信が 12 本） */}
        {layout.groups.map((card) => {
          /* 束に入っているフィードのうち、見出しが取れたもの。
             site-audit がこの印を数えるので、たたんでも 1 本ずつ
             外から見えるようにしておく */
          const members = alive.filter((f) => f.source.group === card.group.id);
          return (
            <section
              key={card.group.id}
              className="rounded-2xl border border-indigo-200 bg-white p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-stone-800">
                  {card.group.name}
                  <span className="ml-2 text-[10px] font-normal text-stone-400">
                    {card.feedCount}
                    {"本の配信をまとめています"}
                  </span>
                </h2>
                <a
                  href={card.group.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[10px] font-semibold text-indigo-600 underline"
                >
                  配信元を開く
                </a>
              </div>
              <p className="mt-0.5 max-w-[70ch] text-[10px] leading-relaxed text-stone-500">
                {card.group.note}
              </p>
              {members.map((f) => (
                <span key={f.source.id} hidden data-feed-source={f.source.id} />
              ))}
              <div className="mt-2 grid gap-4 border-t border-stone-100 pt-3 lg:grid-cols-2 xl:grid-cols-3">
                {card.sections.map((section) => (
                  <div key={section.name}>
                    <h3 className="text-xs font-bold text-indigo-900">
                      {section.name}
                      {section.feedCount > 1 && (
                        <span className="ml-1 text-[10px] font-normal text-stone-400">
                          {"（"}
                          {section.feedCount}
                          {"本ぶんを日付順）"}
                        </span>
                      )}
                    </h3>
                    <ul className="mt-1.5 space-y-1.5">
                      {section.items.map(({ item, source }) => {
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
                              {/* どの配信から来たかは消さない。区分に
                                  複数の配信が混ざっているときだけ添える */}
                              {section.feedCount > 1 && (
                                <span className="ml-1 whitespace-nowrap text-[10px] text-stone-400">
                                  {source.name}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {/* 配信元ごとの見出し。取得できた配信元だけ出す */}
        {layout.singles.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {layout.singles.map((feed) => (
              <div
                key={feed.source.id}
                /* 毎朝の site-audit がこの印を数えて、いくつの配信元から
                   見出しが出ているかを見る。台帳の URL は本番でしか
                   生存確認できないので、外から数えられるようにしておく。 */
                data-feed-source={feed.source.id}
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
        ) : null}

        {/* 全滅したときだけ出す。まとめた札が出ていれば「取得できて
            いない」ではない（束のぶんを数え落とさないこと） */}
        {alive.length === 0 && (
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
              /* 毎朝の site-audit がこの印で「どれが落ちているか」を拾う */
              <span key={feed.source.id} data-feed-down={feed.source.id}>
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
