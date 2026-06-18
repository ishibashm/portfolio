import { NextResponse } from "next/server";

interface TrendArticle {
  title: string;
  link: string;
  source?: string;
  time?: string;
  badge?: string;
  badgeColor?: string;
  desc?: string;
}

interface OfficialSource {
  name: string;
  url: string;
  baseUrl: string;
  type: "rss" | "html";
  badge: string;
  badgeColor: string;
  description: string;
}

const ECON_SOURCE_NAME = "マクロ経済・市場インテリジェンス";

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

const OFFICIAL_FALLBACK: TrendArticle[] = [
  {
    title: "JPXマーケットニュースを確認: 取引所公式の市場・売買停止・注意喚起情報",
    link: "https://www.jpx.co.jp/rss/index.html",
    source: "JPX公式RSS",
    time: "Fallback",
    badge: "市場公式",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    desc: "公式フィードが一時的に取得できない場合の導線です。JPXのRSS一覧から市場ニュースと注意喚起を確認できます。",
  },
  {
    title: "日本銀行 公表資料を確認: 金融政策・オペ・統計の最新発表",
    link: "https://www.boj.or.jp/announcements/release_2026/index.htm",
    source: "日本銀行",
    time: "Fallback",
    badge: "金融政策",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    desc: "日銀の公式公表資料ページへの導線です。政策金利、金融市場調節、統計発表を確認します。",
  },
  {
    title: "内閣府 月例経済報告を確認: 政府公式の景気判断と主要経済指標",
    link: "https://www5.cao.go.jp/keizai3/getsurei/getsurei-index.html",
    source: "内閣府",
    time: "Fallback",
    badge: "景気判断",
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    desc: "政府公式の月例経済報告です。景気判断、雇用、物価、生産、海外経済の見方を確認できます。",
  },
];

function decodeHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function formatJSTDate(pubDateStr?: string): string {
  if (!pubDateStr) return "Official";
  const date = new Date(pubDateStr);
  if (Number.isNaN(date.getTime())) return "Official";

  const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = String(jstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jstDate.getUTCDate()).padStart(2, "0");
  const hours = String(jstDate.getUTCHours()).padStart(2, "0");
  const minutes = String(jstDate.getUTCMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 },
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, text/html, */*",
        "User-Agent": "my-portfolio-market-intelligence/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml: string, source: OfficialSource): TrendArticle[] {
  const items: TrendArticle[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1] || "");
    const link = decodeHtml(/<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(item)?.[1] || "");
    const pubDate = decodeHtml(/<pubDate\b[^>]*>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1] || "");
    const desc = decodeHtml(/<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(item)?.[1] || "");

    if (title && link) {
      items.push({
        title,
        link: absoluteUrl(link, source.baseUrl),
        source: source.name,
        time: formatJSTDate(pubDate),
        badge: source.badge,
        badgeColor: source.badgeColor,
        desc: desc || source.description,
      });
    }
  }

  return items;
}

function parseOfficialHtml(html: string, source: OfficialSource): TrendArticle[] {
  const items: TrendArticle[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];
    const title = decodeHtml(match[2]);
    const link = absoluteUrl(href, source.baseUrl);

    if (
      title.length < 8 ||
      seen.has(link) ||
      link.includes("#") ||
      /\.(css|js|png|jpg|gif|svg)$/i.test(link)
    ) {
      continue;
    }

    seen.add(link);
    items.push({
      title,
      link,
      source: source.name,
      time: "Official",
      badge: source.badge,
      badgeColor: source.badgeColor,
      desc: source.description,
    });

    if (items.length >= 6) break;
  }

  return items;
}

async function fetchOfficialSource(source: OfficialSource): Promise<TrendArticle[]> {
  try {
    const text = await fetchText(source.url);
    const items =
      source.type === "rss"
        ? parseRss(text, source)
        : parseOfficialHtml(text, source);
    return items.slice(0, 6);
  } catch (error) {
    console.error(`Failed to fetch official source: ${source.name}`, error);
    return [];
  }
}

async function fetchOfficialEconomicNews(): Promise<TrendArticle[]> {
  const settled = await Promise.allSettled(
    OFFICIAL_SOURCES.map((source) => fetchOfficialSource(source)),
  );

  const articles = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((article) => article.title && article.link);

  const seen = new Set<string>();
  const uniqueArticles = articles.filter((article) => {
    const key = `${article.source}:${article.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueArticles.length > 0
    ? uniqueArticles.slice(0, 16)
    : OFFICIAL_FALLBACK;
}

async function fetchGasArticles(): Promise<Record<string, unknown> | null> {
  const gasUrl = process.env.GAS_WEBAPP_URL || process.env.GAS_WEB_APP_URL;
  if (!gasUrl) return null;

  try {
    const response = await fetch(gasUrl, {
      method: "GET",
      next: { revalidate: 300 },
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`GAS returned ${response.status}`);
    }

    const data = await response.json();
    return data && typeof data === "object" ? data : null;
  } catch (error) {
    console.error("GAS article source failed; continuing with official feeds.", error);
    return null;
  }
}

export async function GET() {
  const [gasData, officialEconomicNews] = await Promise.all([
    fetchGasArticles(),
    fetchOfficialEconomicNews(),
  ]);

  return NextResponse.json({
    ...(gasData || {}),
    [ECON_SOURCE_NAME]: officialEconomicNews,
    _meta: {
      economicSourceMode: "official-multi-source",
      officialSources: OFFICIAL_SOURCES.map((source) => source.name),
      generatedAt: new Date().toISOString(),
    },
  });
}
