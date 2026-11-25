/**
 * 同じ検索語を取り合う記事と頁のうち、**主役の頁**がある記事。
 *
 * 「今日の方位 時間別」は /houi/today（表）が主、記事は表の読み方の解説。
 * 記事は DB から出ることがあり（lib/blogStore）、Markdown の本文を直しても
 * DB 側が先に出て反映されない。冒頭の誘導は本文に書かず、slug から頁側で
 * 描く。301 で統合しないのは、記事が別の問い（日盤と時盤の関係、刻の境目が
 * 地域でずれる理由）に答えていて、他の記事から読み方として参照されている
 * ため。canonical も記事自身のまま。
 */
export type PrimaryPage = { href: string; label: string; lead: string };

const PRIMARY_PAGES: Record<string, PrimaryPage> = {
  "todays-lucky-direction-by-hour": {
    href: "/houi/today",
    label: "今日の吉方位 時間別一覧",
    lead: "今日の時間帯ごとの吉方位の表を見たい方は、",
  },
};

export function primaryPageFor(slug: string): PrimaryPage | null {
  return Object.hasOwn(PRIMARY_PAGES, slug) ? PRIMARY_PAGES[slug] : null;
}
