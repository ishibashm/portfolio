"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

interface QuoteData {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  longName: string;
  symbol: string;
  currency: string;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export function FinanceWidget({ symbol = "AAPL" }: { symbol?: string }) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState(symbol);
  const [inputTicker, setInputTicker] = useState("");

  const fetchQuote = async (targetTicker: string) => {
    if (!targetTicker) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/finance?ticker=${encodeURIComponent(targetTicker)}&type=quote`,
      );
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to fetch quote");
      }

      if (result.success && result.data) {
        setData(result.data);
        setTicker(targetTicker);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote(symbol);
  }, [symbol]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputTicker.trim()) {
      fetchQuote(inputTicker.trim().toUpperCase());
      setInputTicker("");
    }
  };

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return "N/A";
    if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    return num.toLocaleString();
  };

  return (
    <div className="flex flex-col w-full bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-2 text-zinc-100">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold tracking-tight text-sm">
            Market Intelligence
          </h2>
        </div>

        <form onSubmit={handleSearch} className="flex relative">
          <input
            type="text"
            value={inputTicker}
            onChange={(e) => setInputTicker(e.target.value)}
            placeholder="Symbol (e.g. MSFT)"
            className="w-28 sm:w-36 bg-zinc-900 border border-zinc-700 rounded-md py-1 px-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
          />
        </form>
      </div>

      <div className="p-4 relative min-h-[140px] flex flex-col justify-center">
        {loading && !data && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/20 p-3 rounded-lg border border-red-900/50">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {data && !error && (
          <div
            className={`transition-opacity duration-300 ${loading ? "opacity-50" : "opacity-100"}`}
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  {data.symbol}
                  <span className="text-xs font-normal text-zinc-500 tracking-normal px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900/50">
                    {data.currency}
                  </span>
                </h3>
                <p className="text-sm text-zinc-400 truncate max-w-[200px]">
                  {data.longName}
                </p>
              </div>

              <div className="text-right">
                <div className="text-3xl font-mono font-medium text-white flex items-center justify-end gap-1">
                  <DollarSign className="w-5 h-5 text-zinc-500" />
                  {data.regularMarketPrice?.toFixed(2)}
                </div>
                <div
                  className={`flex items-center justify-end gap-1 text-sm font-medium ${
                    data.regularMarketChange >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {data.regularMarketChange >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {data.regularMarketChange > 0 ? "+" : ""}
                  {data.regularMarketChange?.toFixed(2)}(
                  {data.regularMarketChangePercent?.toFixed(2)}%)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-zinc-800/50">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                  Market Cap
                </span>
                <span className="text-sm font-medium text-zinc-300">
                  {formatNumber(data.marketCap)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                  52W High
                </span>
                <span className="text-sm font-medium text-zinc-300">
                  ${data.fiftyTwoWeekHigh?.toFixed(2)}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                  52W Low
                </span>
                <span className="text-sm font-medium text-zinc-300">
                  ${data.fiftyTwoWeekLow?.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-3 text-right">
              <span className="text-[9px] text-zinc-600 font-mono">
                LIVE TELEMETRY ACTIVE
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
