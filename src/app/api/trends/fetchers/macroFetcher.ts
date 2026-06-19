import { decodeHtml, absoluteUrl, formatJSTDate, fetchText, parseRss, parseOfficialHtml } from "./utils";

export interface MacroIndicator {
  source: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  badge?: string;
  badgeColor?: string;
}

export interface OfficialSource {
  name: string;
  url: string;
  baseUrl: string;
  type: "rss" | "html";
  badge: string;
  badgeColor: string;
  description: string;
}

const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    name: "JPXマーケットニュース",
    url: "https://www.jpx.co.jp/rss/markets_news.xml",
    baseUrl: "https://www.jpx.co.jp",
    type: "rss",
    badge: "市場公式",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    description: "日本取引所グループ公式RSSから取得したマーケット関連情報です。",
  },
  {
    name: "JPXからのお知らせ",
    url: "https://www.jpx.co.jp/rss/jpx_news.xml",
    baseUrl: "https://www.jpx.co.jp",
    type: "rss",
    badge: "取引所",
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    description: "日本取引所グループ公式RSSから取得した制度・市場運営情報です。",
  },
  {
    name: "日本銀行",
    url: "https://www.boj.or.jp/announcements/release_2026/index.htm",
    baseUrl: "https://www.boj.or.jp",
    type: "html",
    badge: "金融政策",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    description: "日本銀行の公表資料ページから取得した金融政策・統計関連情報です。",
  },
  {
    name: "内閣府 月例経済報告",
    url: "https://www5.cao.go.jp/keizai3/getsurei/getsurei-index.html",
    baseUrl: "https://www5.cao.go.jp",
    type: "html",
    badge: "景気判断",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    description: "内閣府の月例経済報告ページから取得した景気判断・主要経済指標情報です。",
  },
  {
    name: "総務省統計局 CPI",
    url: "https://www.stat.go.jp/data/cpi/",
    baseUrl: "https://www.stat.go.jp",
    type: "html",
    badge: "公的統計",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    description: "総務省統計局の消費者物価指数ページから取得した物価統計情報です。",
  },
];

const OFFICIAL_FALLBACK: MacroIndicator[] = [
  {
    title: "JPXマーケットニュースを確認: 取引所公式の市場・売買停止・注意喚起情報",
    url: "https://www.jpx.co.jp/rss/index.html",
    source: "JPX公式RSS",
    publishedAt: "Official",
    badge: "市場公式",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    summary: "公式フィードが一時的に取得できない場合の導線です。JPXのRSS一覧から市場ニュースと注意喚起を確認できます。",
  },
  {
    title: "日本銀行 公表資料を確認: 金融政策・オペ・統計の最新発表",
    url: "https://www.boj.or.jp/announcements/release_2026/index.htm",
    source: "日本銀行",
    publishedAt: "Official",
    badge: "金融政策",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    summary: "日銀の公式公表資料ページへの導線です。政策金利、金融市場調節、統計発表を確認します。",
  },
  {
    title: "内閣府 月例経済報告を確認: 政府公式の景気判断と主要経済指標",
    url: "https://www5.cao.go.jp/keizai3/getsurei/getsurei-index.html",
    source: "内閣府",
    publishedAt: "Official",
    badge: "景気判断",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    summary: "政府公式の月例経済報告です。景気判断、雇用、物価、生産、海外経済の見方を確認できます。",
  },
];

async function fetchOfficialSource(source: OfficialSource): Promise<MacroIndicator[]> {
  try {
    const text = await fetchText(source.url);
    const items =
      source.type === "rss"
        ? parseRss(text, source).map(item => ({
            source: item.source || source.name,
            title: item.title,
            url: item.link,
            publishedAt: item.time || "Official",
            summary: item.desc,
            badge: item.badge,
            badgeColor: item.badgeColor
          }))
        : parseOfficialHtml(text, source).map(item => ({
            source: item.source || source.name,
            title: item.title,
            url: item.link,
            publishedAt: item.time || "Official",
            summary: item.desc,
            badge: item.badge,
            badgeColor: item.badgeColor
          }));
    return items.slice(0, 6);
  } catch (error) {
    console.error(`Failed to fetch official source: ${source.name}`, error);
    return [];
  }
}

export async function fetchMacroIndicators(): Promise<{ data: MacroIndicator[]; mode: string; sources: string[] }> {
  const settled = await Promise.allSettled(
    OFFICIAL_SOURCES.map((source) => fetchOfficialSource(source)),
  );

  const indicators = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((ind) => ind.title && ind.url);

  const seen = new Set<string>();
  const uniqueIndicators = indicators.filter((ind) => {
    const key = `${ind.source}:${ind.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const hasData = uniqueIndicators.length > 0;
  return {
    data: hasData ? uniqueIndicators.slice(0, 16) : OFFICIAL_FALLBACK,
    mode: hasData ? "official_only" : "fallback_active",
    sources: OFFICIAL_SOURCES.map(s => s.name)
  };
}
