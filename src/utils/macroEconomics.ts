export interface MacroEconomicsData {
  vix: number;
  creditSpread: number;
  isMocked: boolean;
}

export async function fetchMacroEconomics(): Promise<MacroEconomicsData> {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 300 },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      }
    });

    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const meta = result?.meta;
    
    if (!meta || typeof meta.regularMarketPrice !== "number" || Number.isNaN(meta.regularMarketPrice)) {
      throw new Error("Invalid VIX quote format");
    }

    const vix = meta.regularMarketPrice;
    const creditSpread = 1.5 + vix * 0.15;
    return {
      vix,
      creditSpread: parseFloat(creditSpread.toFixed(3)),
      isMocked: false,
    };
  } catch (error) {
    console.error(
      "Error fetching macro economics (VIX), falling back to offline defaults:",
      error,
    );
    // Safe offline defaults: VIX = 18.0, Spread = 4.2
    return {
      vix: 18.0,
      creditSpread: 4.2,
      isMocked: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
