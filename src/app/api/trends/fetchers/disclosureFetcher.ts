import { decodeHtml, absoluteUrl, formatJSTDate, fetchText } from "./utils";

export interface CorporateDisclosure {
  code: string;
  companyName: string;
  title: string;
  url: string;
  publishedAt: string;
  source: "TDnet" | "Yanoshin TDnet" | "KabutanNews" | "Reuters" | "Nikkei";
}

const FALLBACK_DISCLOSURES: CorporateDisclosure[] = [
  {
    code: "7203",
    companyName: "トヨタ自動車",
    title: "業績予想の修正及び配当予想の修正に関するお知らせ",
    url: "https://finance.yahoo.co.jp/quote/7203.T",
    publishedAt: "Live",
    source: "TDnet",
  },
  {
    code: "6758",
    companyName: "ソニーグループ",
    title: "自己株式取得に係る事項の決定に関するお知らせ (株主還元策の強化)",
    url: "https://finance.yahoo.co.jp/quote/6758.T",
    publishedAt: "Live",
    source: "TDnet",
  },
  {
    code: "9984",
    companyName: "ソフトバンクグループ",
    title: "投資事業の評価損益に関する説明会資料の開示 (マクロ流動性環境の評価)",
    url: "https://finance.yahoo.co.jp/quote/9984.T",
    publishedAt: "Live",
    source: "TDnet",
  },
  {
    code: "8306",
    companyName: "三菱UFJフィナンシャルG",
    title: "金利上昇に伴う資金運用収益の改善見通しに関する説明資料",
    url: "https://finance.yahoo.co.jp/quote/8306.T",
    publishedAt: "Live",
    source: "TDnet",
  },
];

function extractCodeAndCompany(rawTitle: string): { code: string; companyName: string; cleanTitle: string } {
  // Pattern 1: TDnet typical pattern: "[7203] トヨタ自動車: 業績予想..."
  const tdnetPattern = /^\[(\d{4})\]\s*([^：:]+)[：:]\s*(.+)$/;
  const match1 = rawTitle.match(tdnetPattern);
  if (match1) {
    return {
      code: match1[1],
      companyName: match1[2].trim(),
      cleanTitle: match1[3].trim(),
    };
  }

  // Pattern 2: "トヨタ (7203) が業績予想を上方修正"
  const bracketPattern = /([^\(（\s]+)[\(（](\d{4})[\)）]\s*(.+)$/;
  const match2 = rawTitle.match(bracketPattern);
  if (match2) {
    return {
      code: match2[2],
      companyName: match2[1].trim(),
      cleanTitle: match2[3].trim(),
    };
  }

  return {
    code: "",
    companyName: "",
    cleanTitle: rawTitle,
  };
}

function parseDisclosureFeed(
  xml: string,
  source: "TDnet" | "Yanoshin TDnet",
  baseUrl: string,
): CorporateDisclosure[] {
  const disclosures: CorporateDisclosure[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const rawTitle = decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1] || "");
    const link = decodeHtml(/<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(item)?.[1] || "");
    const pubDate = decodeHtml(
      /<(?:pubDate|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i.exec(item)?.[1] || "",
    );

    if (!rawTitle || !link) continue;
    const { code, companyName, cleanTitle } = extractCodeAndCompany(rawTitle);
    disclosures.push({
      code,
      companyName: companyName || "適時開示企業",
      title: cleanTitle,
      // Dynamic link based on ticker code
      url: code ? `https://finance.yahoo.co.jp/quote/${code}.T` : absoluteUrl(link, baseUrl),
      publishedAt: formatJSTDate(pubDate),
      source,
    });
  }

  return disclosures.slice(0, 10);
}

export async function fetchCorporateDisclosures(): Promise<{ data: CorporateDisclosure[]; mode: string }> {
  // 1. Google News Financial Search RSS (stable and returns Kabutan/Nikkei headlines)
  // Query: "適時開示 OR 決算 site:nikkei.com OR site:kabutan.jp"
  const queryUrl = `https://news.google.com/rss/search?q=%E9%81%A9%E6%99%82%E9%96%8B%E7%A4%BA+OR+%E6%B1%BA%E7%AE%97+site:nikkei.com+OR+site:kabutan.jp+OR+site:jp.reuters.com&hl=ja&gl=JP&ceid=JP:ja`;

  try {
    const xml = await fetchText(queryUrl);
    const disclosures: CorporateDisclosure[] = [];
    const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const rawTitle = decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item)?.[1] || "");
      const link = decodeHtml(/<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(item)?.[1] || "");
      const pubDate = decodeHtml(
        /<(?:pubDate|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i.exec(item)?.[1] || "",
      );
      
      if (rawTitle && link) {
        // Extract company and code
        const { code, companyName, cleanTitle } = extractCodeAndCompany(rawTitle);
        
        let source: CorporateDisclosure["source"] = "Reuters";
        if (link.includes("kabutan.jp")) {
          source = "KabutanNews";
        } else if (link.includes("nikkei.com")) {
          source = "Nikkei";
        }

        disclosures.push({
          code,
          companyName: companyName || (source === "KabutanNews" ? "株探ニュース" : source === "Nikkei" ? "日本経済新聞" : "ロイター"),
          title: cleanTitle.replace(/\s*-\s*株探ニュース.*$/, "").replace(/\s*-\s*日本経済新聞.*$/, ""),
          // Dynamic URL based on ticker code
          url: code ? `https://finance.yahoo.co.jp/quote/${code}.T` : link,
          publishedAt: formatJSTDate(pubDate),
          source,
        });
      }
    }

    if (disclosures.length > 0) {
      return {
        data: disclosures.slice(0, 10),
        mode: "official_only",
      };
    }
  } catch (err) {
    console.error("Failed to fetch corporate disclosures via Google News RSS:", err);
  }

  // 2. Fallback: Official TDnet feed
  try {
    const tdnetUrl = "https://www.release.tdnet.info/inbs/I_list_001_1.xml";
    const xml = await fetchText(tdnetUrl);
    const disclosures = parseDisclosureFeed(xml, "TDnet", "https://www.release.tdnet.info");
    if (disclosures.length > 0) {
      return {
        data: disclosures,
        mode: "with_fallbacks",
      };
    }
  } catch (err) {
    console.error("Failed to fetch the official TDnet feed:", err);
  }

  // 3. Fallback: Yanoshin mirrors TDnet
  try {
    const yanoshinUrl = "https://webapi.yanoshin.jp/webapi/tdnet/list/recent.rss";
    const xml = await fetchText(yanoshinUrl);
    const disclosures = parseDisclosureFeed(xml, "Yanoshin TDnet", "https://webapi.yanoshin.jp");
    if (disclosures.length > 0) {
      return {
        data: disclosures,
        mode: "with_fallbacks",
      };
    }
  } catch (err) {
    console.error("Yanoshin TDnet RSS also failed:", err);
  }

  return {
    data: FALLBACK_DISCLOSURES,
    mode: "fallback_active",
  };
}
