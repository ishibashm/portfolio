import { OfficialSource } from "./macroFetcher";

export interface TrendArticle {
  title: string;
  link: string;
  source?: string;
  time?: string;
  badge?: string;
  badgeColor?: string;
  desc?: string;
}

export function decodeHtml(value: string): string {
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

export function absoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

export function formatJSTDate(pubDateStr?: string): string {
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

export async function fetchText(url: string): Promise<string> {
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

export function parseRss(xml: string, source: { name: string; baseUrl: string; badge: string; badgeColor: string; description: string }): TrendArticle[] {
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

export function parseOfficialHtml(html: string, source: OfficialSource): TrendArticle[] {
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
