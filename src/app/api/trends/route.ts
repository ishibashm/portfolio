import { NextResponse } from "next/server";
import { fetchMacroIndicators } from "./fetchers/macroFetcher";
import { fetchMarketPrices } from "./fetchers/marketPriceFetcher";
import { fetchCorporateDisclosures } from "./fetchers/disclosureFetcher";

const ECON_SOURCE_NAME = "マクロ経済・市場インテリジェンス";

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
  const [gasData, macroRes, marketRes, disclosureRes] = await Promise.all([
    fetchGasArticles(),
    fetchMacroIndicators(),
    fetchMarketPrices(),
    fetchCorporateDisclosures(),
  ]);

  // Map macroRes to legacy TrendArticle shape for backward compatibility
  const legacyEconomicNews = macroRes.data.map(ind => ({
    title: ind.title,
    link: ind.url,
    source: ind.source,
    time: ind.publishedAt,
    badge: ind.badge,
    badgeColor: ind.badgeColor,
    desc: ind.summary
  }));

  // Determine global meta mode
  let metaMode: "official_only" | "with_fallbacks" | "fallback_active" = "official_only";
  if (macroRes.mode === "fallback_active" || marketRes.mode === "fallback_active" || disclosureRes.mode === "fallback_active") {
    metaMode = "fallback_active";
  } else if (macroRes.mode === "with_fallbacks" || marketRes.mode === "with_fallbacks" || disclosureRes.mode === "with_fallbacks") {
    metaMode = "with_fallbacks";
  }

  return NextResponse.json({
    ...(gasData || {}),
    [ECON_SOURCE_NAME]: legacyEconomicNews,
    macroIndicators: macroRes.data.map(ind => ({ ...ind, link: ind.url })), // support both link and url
    marketIndices: marketRes.data,
    corporateDisclosures: disclosureRes.data.map(disc => ({ ...disc, link: disc.url })), // support both link and url
    _meta: {
      mode: metaMode,
      sources: [...macroRes.sources, "Yahoo Finance", "TDnet", "Yanoshin TDnet RSS"],
      generatedAt: new Date().toISOString(),
    },
  });
}
