import yahooFinanceModule from 'yahoo-finance2';

const yahooFinance = typeof yahooFinanceModule === 'function' ? new (yahooFinanceModule as any)() : yahooFinanceModule;

export interface MacroEconomicsData {
  vix: number;
  creditSpread: number;
  isMocked: boolean;
}

export async function fetchMacroEconomics(): Promise<MacroEconomicsData> {
  try {
    // Disable historical data notice console logs if yahoo-finance2 has any.
    // Fetch ^VIX quote
    const quote = await yahooFinance.quote('^VIX');
    
    if (quote && typeof quote.regularMarketPrice === 'number' && !Number.isNaN(quote.regularMarketPrice)) {
      const vix = quote.regularMarketPrice;
      const creditSpread = 1.5 + vix * 0.15;
      return {
        vix,
        creditSpread: parseFloat(creditSpread.toFixed(3)),
        isMocked: false
      };
    }

    throw new Error('Invalid VIX quote format');
  } catch (error) {
    console.error('Error fetching macro economics (VIX), falling back to offline defaults:', error);
    // Safe offline defaults: VIX = 18.0, Spread = 4.2
    return {
      vix: 18.0,
      creditSpread: 4.2,
      isMocked: true
    };
  }
}
