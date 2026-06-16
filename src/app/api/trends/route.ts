import { NextResponse } from "next/server";

interface EconomicNewsItem {
  title: string;
  link: string;
  source: string;
  time: string;
  badge: string;
  badgeColor: string;
}

function formatJSTDate(pubDateStr: string): string {
  try {
    const date = new Date(pubDateStr);
    if (isNaN(date.getTime())) return "12:00";
    
    // Convert to JST (UTC+9)
    const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    
    const isToday = jstDate.getUTCFullYear() === nowJst.getUTCFullYear() &&
                    jstDate.getUTCMonth() === nowJst.getUTCMonth() &&
                    jstDate.getUTCDate() === nowJst.getUTCDate();
                    
    const hours = String(jstDate.getUTCHours()).padStart(2, '0');
    const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');
    
    if (isToday) {
      return `${hours}:${minutes}`;
    } else {
      const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(jstDate.getUTCDate()).padStart(2, '0');
      return `${month}/${day} ${hours}:${minutes}`;
    }
  } catch (e) {
    return "12:00";
  }
}

async function fetchEconomicNews(): Promise<EconomicNewsItem[]> {
  const url = "https://news.google.com/rss/search?q=%E3%83%9E%E3%82%AF%E3%83%AD%E7%B5%8C%E6%B8%88+OR+%E5%B8%82%E5%A0%B4%E3%82%A4%E3%83%B3%E3%83%86%E3%83%AA%E3%82%B8%E3%82%A7%E3%83%B3%E3%82%B9+OR+%E6%97%A5%E7%B5%8C%E5%B9%B3%E5%9D%87+OR+%E6%A0%AA%E6%8E%A2&hl=ja&gl=JP&ceid=JP:ja";
  
  try {
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: {
        Accept: "application/xml, text/xml, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Google News RSS: ${response.status}`);
    }

    const xmlText = await response.text();
    const items: EconomicNewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
      const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
      const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);

      if (titleMatch && linkMatch) {
        let title = titleMatch[1].trim();
        title = title.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")
                     .replace(/&amp;/g, "&")
                     .replace(/&lt;/g, "<")
                     .replace(/&gt;/g, ">")
                     .replace(/&quot;/g, '"')
                     .replace(/&#39;/g, "'");

        let link = linkMatch[1].trim();
        link = link.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1");

        let source = "経済ニュース";
        const sourceSeparatorIdx = title.lastIndexOf(" - ");
        if (sourceSeparatorIdx !== -1) {
          source = title.substring(sourceSeparatorIdx + 3).trim();
          title = title.substring(0, sourceSeparatorIdx).trim();
        }

        let badge = "マクロ経済";
        let badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
        const titleLower = title.toLowerCase();

        if (titleLower.includes("日経") || titleLower.includes("株") || titleLower.includes("平均") || titleLower.includes("ダウ") || titleLower.includes("決算") || titleLower.includes("東証")) {
          badge = "株式市場";
          badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
        } else if (titleLower.includes("円") || titleLower.includes("ドル") || titleLower.includes("為替") || titleLower.includes("ユーロ") || titleLower.includes("金利") || titleLower.includes("日銀") || titleLower.includes("fomc") || titleLower.includes("frb")) {
          badge = "為替・金利";
          badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
        } else if (titleLower.includes("半導体") || titleLower.includes("ai") || titleLower.includes("ハイテク") || titleLower.includes("注目") || titleLower.includes("急騰")) {
          badge = "注目銘柄";
          badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
        }

        const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : "";
        const time = formatJSTDate(pubDateStr);

        items.push({
          title,
          link,
          source,
          time,
          badge,
          badgeColor,
        });
      }
    }

    return items.slice(0, 10);
  } catch (error) {
    console.error("Error fetching or parsing economic news:", error);
    return [];
  }
}

export async function GET() {
  const gasUrl = process.env.GAS_WEBAPP_URL || process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    console.error(
      "GAS Web App URL is not configured in environment variables.",
    );
    return NextResponse.json(
      { error: "Backend server URL is not configured" },
      { status: 500 },
    );
  }

  try {
    // Fetch with cache revalidation of 60 seconds
    const response = await fetch(gasUrl, {
      method: "GET",
      next: { revalidate: 60 },
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`GAS returned error status: ${response.status}`);
      return NextResponse.json(
        { error: `Backend service returned error: ${response.status}` },
        { status: 502 },
      );
    }

    const data = await response.json();

    // Fetch and merge economic news
    try {
      const econNews = await fetchEconomicNews();
      data["マクロ経済・市場インテリジェンス"] = econNews;
    } catch (econError) {
      console.error("Failed to append economic news:", econError);
      data["マクロ経済・市場インテリジェンス"] = [];
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error proxying trends GET request:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
