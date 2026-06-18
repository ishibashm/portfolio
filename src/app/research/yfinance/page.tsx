"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Activity,
  Shield,
  Zap,
  BarChart3,
  Search,
  Sparkles,
  Info,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Sliders,
  DollarSign,
  Target,
  Gauge,
  CheckCircle2
} from "lucide-react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface QuantMetrics {
  annualized_return: number;
  annualized_volatility: number;
  sharpe_ratio: number;
  max_drawdown: number;
  var_historical_95: number;
  var_parametric_95: number;
  skewness: number;
  kurtosis: number;
}

interface StockMeta {
  name: string;
  symbol: string;
  currency: string;
  sector: string;
  industry: string;
  website: string;
  summary: string;
  market_cap: number | null;
  pe_ratio: number | null;
  dividend_yield: number | null;
}

interface HistoryData {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  sma_25: number | null;
  sma_75: number | null;
  sma_200: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  bb_middle: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  per?: number | null;
  pbr?: number | null;
}

interface ForecastData {
  step: number;
  date: string;
  mean: number;
  lower_95: number;
  upper_95: number;
  lower_50: number;
  upper_50: number;
}

const sampleTickers = [
  { symbol: "7203", name: "Toyota", tone: "Core Japan" },
  { symbol: "6758", name: "Sony", tone: "Quality growth" },
  { symbol: "9984", name: "SoftBank G", tone: "High beta" },
];

export default function YFinanceQuantPage() {
  const [tickerInput, setTickerInput] = useState("7203"); // Default to Toyota
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quant Results
  const [meta, setMeta] = useState<StockMeta | null>(null);
  const [metrics, setMetrics] = useState<QuantMetrics | null>(null);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [forecast, setForecast] = useState<ForecastData[]>([]);

  // AI Report
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Save Note States
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [savedKbId, setSavedKbId] = useState<string | null>(null);

  // UI States
  const [chartMode, setChartMode] = useState<"price" | "rsi" | "macd" | "valuation">("price");
  const [showBB, setShowBB] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [inputMode, setInputMode] = useState<"api" | "html">("api");
  const [htmlInput, setHtmlInput] = useState("");

  // Format big numbers
  const formatMarketCap = (num: number | null, currency: string) => {
    if (num === null) return "N/A";
    const bill = num / 1e9;
    if (bill >= 1000) {
      const trill = bill / 1000;
      return `${trill.toFixed(2)}T ${currency}`;
    }
    return `${bill.toFixed(2)}B ${currency}`;
  };

  const signalBrief = React.useMemo(() => {
    if (!metrics || history.length === 0) return null;

    const latest = history[history.length - 1];
    const forecastEnd = forecast[forecast.length - 1];
    const projectedMove =
      latest.close && forecastEnd
        ? ((forecastEnd.mean - latest.close) / latest.close) * 100
        : null;

    const riskState =
      metrics.max_drawdown <= -0.25 || metrics.var_historical_95 <= -0.035
        ? "High"
        : metrics.max_drawdown <= -0.12 || metrics.var_historical_95 <= -0.02
          ? "Medium"
          : "Controlled";

    const momentumState =
      metrics.annualized_return > 0.12 && metrics.sharpe_ratio >= 1
        ? "Constructive"
        : metrics.annualized_return > 0
          ? "Neutral"
          : "Defensive";

    const action =
      momentumState === "Constructive" && riskState !== "High"
        ? "ウォッチリスト上位。押し目と出来高確認を優先。"
        : riskState === "High"
          ? "ポジションサイズを抑え、下落耐性を先に検証。"
          : "AIレポートとバリュエーション推移で追加材料を確認。";

    return {
      riskState,
      momentumState,
      projectedMove,
      action,
      latestClose: latest.close,
    };
  }, [forecast, history, metrics]);

  const handleExecute = async () => {
    if (inputMode === "api" && !tickerInput.trim()) return;
    if (inputMode === "html" && !htmlInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setMeta(null);
    setMetrics(null);
    setHistory([]);
    setForecast([]);
    setAiReport(null);
    setSavedKbId(null);

    let requestBody: any = {};
    if (inputMode === "html") {
      requestBody = { html: htmlInput };
    } else {
      let ticker = tickerInput.trim();
      if (/^\d{4}$/.test(ticker)) {
        ticker = `${ticker}.T`;
      }
      requestBody = { ticker };
    }

    try {
      const res = await fetch("/api/research/yfinance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch quant data");
      }

      setMeta(data.meta);
      setMetrics(data.metrics);
      setHistory(data.history);
      setForecast(data.forecast);

      // Trigger AI Analysis
      generateAIReport(data.meta, data.metrics, data.history.slice(-5));
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const generateAIReport = async (
    metaInfo: StockMeta,
    quantMetrics: QuantMetrics,
    recentHist: HistoryData[]
  ) => {
    setIsGeneratingReport(true);
    setAiReport(null);
    try {
      const res = await fetch("/api/research/yfinance/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: metaInfo,
          metrics: quantMetrics,
          recentHistory: recentHist.map(h => ({ date: h.date, close: h.close })),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAiReport(data.report);
      } else {
        setAiReport("AI インサイトレポートの生成に失敗しました。");
      }
    } catch (e) {
      console.error(e);
      setAiReport("AI 接続中にネットワークエラーが発生しました。");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleSaveNote = async () => {
    if (!meta || !metrics) return;
    setIsSavingNote(true);
    try {
      const res = await fetch("/api/research/yfinance/save-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta,
          metrics,
          aiReport,
          history,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSavedKbId(data.kb_id);
      } else {
        alert("ノートの保存に失敗しました: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("ノート保存中にネットワークエラーが発生しました。");
    } finally {
      setIsSavingNote(false);
    }
  };

  // Combine history and forecast for a continuous projection chart
  const combinedForecastData = React.useMemo(() => {
    if (history.length === 0 || forecast.length === 0) return [];
    
    // Last 30 days of history
    const recentHistory = history.slice(-30).map(h => ({
      date: h.date,
      actual: h.close,
      mean: null as number | null,
      lower_95: null as number | null,
      upper_95: null as number | null,
      lower_50: null as number | null,
      upper_50: null as number | null,
    }));

    // Connect forecast. We want the first forecast step to align with last history price for continuity
    const lastHistoryPrice = history[history.length - 1].close;

    const forecastData = forecast.map((f, idx) => ({
      date: f.date,
      actual: null as number | null,
      // Draw line from last close
      mean: idx === 0 && lastHistoryPrice ? lastHistoryPrice : f.mean,
      lower_95: idx === 0 && lastHistoryPrice ? lastHistoryPrice : f.lower_95,
      upper_95: idx === 0 && lastHistoryPrice ? lastHistoryPrice : f.upper_95,
      lower_50: idx === 0 && lastHistoryPrice ? lastHistoryPrice : f.lower_50,
      upper_50: idx === 0 && lastHistoryPrice ? lastHistoryPrice : f.upper_50,
    }));

    return [...recentHistory, ...forecastData];
  }, [history, forecast]);

  return (
    <div className="min-h-screen bg-[#030604] text-zinc-100 selection:bg-emerald-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* GS Glow Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-emerald-950/10 rounded-full blur-[140px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-cyan-950/10 rounded-full blur-[160px] -z-10 pointer-events-none" />

      {/* Navigation */}
      <nav className="w-full px-6 py-5 border-b border-emerald-900/20 relative z-10 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link
            href="/research"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Research Hub
          </Link>
          <div className="h-4 w-px bg-emerald-950"></div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-xs tracking-wider uppercase text-emerald-100">
              GS-Quant Analytics Suite & yfinance
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/20 border border-emerald-800/30">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-[9px] font-mono tracking-widest text-emerald-400 uppercase">
            Quant Engine Active
          </span>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1 w-full mx-auto px-6 py-6 relative z-10 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-70px)] custom-scrollbar">
        {/* Row 1: Search Console & Ticker Header */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Console */}
          <div className="lg:col-span-4 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/50 backdrop-blur-xl shadow-2xl flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-4 h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-mono text-emerald-400 uppercase tracking-widest">
                    Quant Engine Inputs
                  </h2>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  分析データを取得するソース形式を選択し、入力してください。
                </p>
              </div>
              
              <div className="flex rounded-lg bg-black/60 p-0.5 border border-emerald-950/40">
                <button
                  onClick={() => setInputMode("api")}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-wider transition-colors ${inputMode === "api" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  API AUTO FETCH
                </button>
                <button
                  onClick={() => setInputMode("html")}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-wider transition-colors ${inputMode === "html" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                >
                  PASTE HTML
                </button>
              </div>

              {inputMode === "api" ? (
                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider">
                    Ticker Code / 銘柄コード
                  </label>
                  <input
                    type="text"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value)}
                    placeholder="7203 (Toyota) or 7203.T"
                    className="w-full bg-black/60 border border-emerald-900/40 rounded-xl px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                    onKeyDown={(e) => e.key === "Enter" && handleExecute()}
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-[140px]">
                  <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase tracking-wider">
                    Yahoo Finance JP Table HTML
                  </label>
                  <textarea
                    value={htmlInput}
                    onChange={(e) => setHtmlInput(e.target.value)}
                    placeholder="<table class=... id='histlist'> ... </table> などをここにペースト"
                    className="w-full flex-1 min-h-[120px] bg-black/60 border border-emerald-900/40 rounded-xl px-4 py-2.5 text-[9px] text-zinc-300 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono custom-scrollbar resize-none"
                  />
                </div>
              )}

              <button
                onClick={handleExecute}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-900/30 hover:bg-emerald-900/60 disabled:bg-zinc-900 border border-emerald-800/30 text-emerald-400 font-mono text-xs py-3 rounded-xl transition-all disabled:opacity-50 shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>EXECUTING ANALYTICS...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>RUN QUANT SUITE</span>
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-900/30 text-rose-400 text-xs font-mono">
                Error: {error}
              </div>
            )}

              <div className="pt-4 border-t border-emerald-950/50 flex flex-wrap gap-2 text-[10px] text-zinc-500 font-mono">
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">GBM simulation</span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Volatility</span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Value at Risk</span>
                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">Sharpe Ratio</span>
              </div>

              {!meta && inputMode === "api" && (
                <div className="pt-4 border-t border-emerald-950/50">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
                    Quick Start
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                    {sampleTickers.map((item) => (
                      <button
                        key={item.symbol}
                        type="button"
                        onClick={() => setTickerInput(item.symbol)}
                        className="group flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-left transition-colors hover:border-emerald-800/60 hover:bg-emerald-950/20"
                      >
                        <span>
                          <span className="block text-xs font-mono text-zinc-200">{item.symbol}</span>
                          <span className="block text-[10px] text-zinc-500">{item.name}</span>
                        </span>
                        <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-zinc-600 group-hover:text-emerald-400">
                          {item.tone}
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          {/* Right: Meta Information Header */}
          <div className="lg:col-span-8 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/50 backdrop-blur-xl flex flex-col justify-between gap-4 min-h-[170px]">
            {meta ? (
              <div className="flex flex-col h-full justify-between gap-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {meta.name}
                      </h1>
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-800/40 text-xs font-mono text-emerald-400 font-bold uppercase">
                        {meta.symbol}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 font-mono mt-1">
                      {meta.sector} • {meta.industry}
                    </p>
                  </div>
                  {meta.website && (
                    <a
                      href={meta.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium font-mono"
                    >
                      Official Web <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-emerald-950/50">
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Market Cap</p>
                    <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                      {formatMarketCap(meta.market_cap, meta.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">P/E Ratio</p>
                    <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                      {meta.pe_ratio ? meta.pe_ratio.toFixed(2) : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Dividend Yield</p>
                    <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                      {meta.dividend_yield ? `${(meta.dividend_yield * 100).toFixed(2)}%` : "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-zinc-500 uppercase">Base Currency</p>
                    <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                      {meta.currency}
                    </p>
                  </div>
                </div>

                {signalBrief && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-emerald-950/50">
                    <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-3">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        Risk Posture
                        <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <p className="mt-1 text-lg font-semibold text-white">{signalBrief.riskState}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-900/30 bg-cyan-950/10 p-3">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        Momentum
                        <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <p className="mt-1 text-lg font-semibold text-white">{signalBrief.momentumState}</p>
                    </div>
                    <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-3">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        30D Mean
                        <Target className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {signalBrief.projectedMove === null
                          ? "N/A"
                          : `${signalBrief.projectedMove >= 0 ? "+" : ""}${signalBrief.projectedMove.toFixed(2)}%`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-800/30 bg-emerald-950/20">
                  <Info className="w-7 h-7 text-emerald-400" />
                </div>
                <p className="text-sm font-mono tracking-widest uppercase text-zinc-300">
                  銘柄コードを入力し、分析を実行してください。
                </p>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-zinc-500">
                  価格推移、リスク指標、30日予測、AIレポートを一画面で確認できます。左のショートカットから代表銘柄を選ぶとすぐに始められます。
                </p>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                  {[
                    ["Data", "OHLC・PER・PBRを取得"],
                    ["Risk", "VaR・歪度・尖度を計算"],
                    ["Note", "AIレポートをKB保存"],
                  ].map(([label, text]) => (
                    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {label}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {meta && metrics && history.length > 0 && (
          <>
            {signalBrief && (
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 rounded-2xl border border-emerald-900/30 bg-emerald-950/[0.08] p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                        <Sparkles className="h-3.5 w-3.5" />
                        Signal Brief
                      </div>
                      <p className="mt-2 text-lg font-semibold text-white">
                        {meta.symbol} は {signalBrief.momentumState.toLowerCase()} / {signalBrief.riskState.toLowerCase()} 判定です。
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {signalBrief.action}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center md:min-w-[360px]">
                      <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Close</p>
                        <p className="mt-1 text-sm font-mono text-zinc-100">
                          {signalBrief.latestClose ? signalBrief.latestClose.toLocaleString() : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Sharpe</p>
                        <p className="mt-1 text-sm font-mono text-amber-300">{metrics.sharpe_ratio.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl bg-black/30 border border-white/5 p-3">
                        <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">VaR 95</p>
                        <p className="mt-1 text-sm font-mono text-rose-300">
                          {(metrics.var_historical_95 * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    Valuation Cue
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                    PER/PBRはチャートの <span className="font-mono text-zinc-200">VALUATION</span> タブで時系列確認できます。AIレポート保存前に、直近の倍率変化と予測レンジをセットで見るのが次の確認ポイントです。
                  </p>
                </div>
              </section>
            )}

            {/* Row 2: Metrics Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {/* Metric 1 */}
              <div className="p-5 rounded-xl bg-white/[0.01] border border-emerald-950/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Annualized Return</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <p className={`text-xl font-semibold font-mono ${metrics.annualized_return >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                    {metrics.annualized_return >= 0 ? "+" : ""}{(metrics.annualized_return * 100).toFixed(2)}%
                  </p>
                </div>
                <p className="text-[9px] text-zinc-500 font-mono mt-3">Geometric mean (252d scaling)</p>
              </div>

              {/* Metric 2 */}
              <div className="p-5 rounded-xl bg-white/[0.01] border border-emerald-950/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Annualized Volatility</span>
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <p className="text-xl font-semibold font-mono text-cyan-400">
                    {(metrics.annualized_volatility * 100).toFixed(2)}%
                  </p>
                </div>
                <p className="text-[9px] text-zinc-500 font-mono mt-3">Daily standard deviation scale</p>
              </div>

              {/* Metric 3 */}
              <div className="p-5 rounded-xl bg-white/[0.01] border border-emerald-950/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Sharpe Ratio</span>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <p className={`text-xl font-semibold font-mono ${metrics.sharpe_ratio >= 1 ? "text-emerald-400" : metrics.sharpe_ratio >= 0 ? "text-amber-400" : "text-rose-500"}`}>
                    {metrics.sharpe_ratio.toFixed(2)}
                  </p>
                </div>
                <p className="text-[9px] text-zinc-500 font-mono mt-3">Risk adjusted efficiency (Rfr = 0)</p>
              </div>

              {/* Metric 4 */}
              <div className="p-5 rounded-xl bg-white/[0.01] border border-emerald-950/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Max Drawdown</span>
                    <Shield className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <p className="text-xl font-semibold font-mono text-rose-500">
                    {(metrics.max_drawdown * 100).toFixed(2)}%
                  </p>
                </div>
                <p className="text-[9px] text-zinc-500 font-mono mt-3">Historical peak-to-trough loss</p>
              </div>
            </div>

            {/* Row 3: Risk Metrics Detailed Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Detailed Metrics Table */}
              <div className="lg:col-span-4 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/40 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-4 border-b border-emerald-950/40 pb-3">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-mono text-zinc-300 uppercase tracking-wider">GS-Quant Risk Analysis</h3>
                  </div>

                  <div className="flex flex-col gap-4 font-mono text-xs">
                    <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
                      <span className="text-zinc-500">Historical VaR (95%)</span>
                      <span className="text-zinc-300 font-semibold">{(metrics.var_historical_95 * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
                      <span className="text-zinc-500">Parametric VaR (95%)</span>
                      <span className="text-zinc-300 font-semibold">{(metrics.var_parametric_95 * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-zinc-900">
                      <span className="text-zinc-500">Distribution Skewness (歪度)</span>
                      <span className={`font-semibold ${metrics.skewness >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{metrics.skewness.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-zinc-500">Distribution Kurtosis (尖度)</span>
                      <span className="text-zinc-300 font-semibold">{metrics.kurtosis.toFixed(3)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-emerald-950/10 border border-emerald-900/20 text-[11px] leading-relaxed text-zinc-400 font-sans">
                  <span className="font-mono text-emerald-400 font-bold block mb-1">Risk Insight:</span>
                  歪度（Skewness）が {metrics.skewness < 0 ? "負" : "正"} の値を示すため、分布のテールは {metrics.skewness < 0 ? "左側（下落リスク）" : "右側（上昇トレンド）"} に伸びています。尖度（Kurtosis）は {metrics.kurtosis.toFixed(2)} であり、正規分布よりも {metrics.kurtosis > 0 ? "テールリスク（極端な変動）に警戒が必要" : "値動きが穏やか"} な特性があります。
                </div>
              </div>

              {/* Historical Interactive Chart */}
              <div className="lg:col-span-8 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/40 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-950/40 pb-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-mono text-zinc-300 uppercase tracking-wider">Historical Market Chart</span>
                    <div className="flex rounded-lg bg-black/60 p-0.5 border border-zinc-800">
                      <button
                        onClick={() => setChartMode("price")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${chartMode === "price" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        PRICE / BB
                      </button>
                      <button
                        onClick={() => setChartMode("rsi")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${chartMode === "rsi" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        RSI
                      </button>
                      <button
                        onClick={() => setChartMode("macd")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${chartMode === "macd" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        MACD
                      </button>
                      <button
                        onClick={() => setChartMode("valuation")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono tracking-wider transition-colors ${chartMode === "valuation" ? "bg-emerald-900/40 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        VALUATION
                      </button>
                    </div>
                  </div>

                  {chartMode === "price" && (
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showBB}
                          onChange={() => setShowBB(!showBB)}
                          className="accent-emerald-500"
                        />
                        Bollinger Bands
                      </label>
                      <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showSMA}
                          onChange={() => setShowSMA(!showSMA)}
                          className="accent-emerald-500"
                        />
                        SMA (25/75)
                      </label>
                    </div>
                  )}
                </div>

                <div className="h-[300px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartMode === "price" ? (
                      <ComposedChart data={history} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f1911" vertical={false} />
                        <XAxis dataKey="date" stroke="#4b5563" fontSize={9} className="font-mono" />
                        <YAxis stroke="#4b5563" fontSize={9} className="font-mono" domain={["auto", "auto"]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#060a07", border: "1px solid #10b981", borderRadius: 8 }}
                          labelStyle={{ color: "#10b981", fontFamily: "monospace", fontSize: 11 }}
                          itemStyle={{ color: "#d1d5db", fontSize: 11 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", paddingTop: 10 }} />
                        {showBB && (
                          <Area
                            name="BB Width (2σ)"
                            dataKey="bb_upper"
                            stroke="transparent"
                            fill="rgba(16,185,129,0.03)"
                            activeDot={false}
                          />
                        )}
                        {showBB && (
                          <Line
                            name="BB Lower"
                            type="monotone"
                            dataKey="bb_lower"
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            strokeWidth={0.8}
                            dot={false}
                            legendType="none"
                          />
                        )}
                        {showBB && (
                          <Line
                            name="BB Upper"
                            type="monotone"
                            dataKey="bb_upper"
                            stroke="#10b981"
                            strokeDasharray="3 3"
                            strokeWidth={0.8}
                            dot={false}
                            legendType="none"
                          />
                        )}
                        {showSMA && (
                          <Line
                            name="SMA 25"
                            type="monotone"
                            dataKey="sma_25"
                            stroke="#3b82f6"
                            strokeWidth={1}
                            dot={false}
                          />
                        )}
                        {showSMA && (
                          <Line
                            name="SMA 75"
                            type="monotone"
                            dataKey="sma_75"
                            stroke="#f97316"
                            strokeWidth={1}
                            dot={false}
                          />
                        )}
                        <Line
                          name="Close Price"
                          type="monotone"
                          dataKey="close"
                          stroke="#e4e4e7"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </ComposedChart>
                    ) : chartMode === "rsi" ? (
                      <ComposedChart data={history} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f1911" vertical={false} />
                        <XAxis dataKey="date" stroke="#4b5563" fontSize={9} className="font-mono" />
                        <YAxis stroke="#4b5563" fontSize={9} className="font-mono" domain={[0, 100]} ticks={[30, 50, 70]} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#060a07", border: "1px solid #10b981", borderRadius: 8 }}
                          labelStyle={{ color: "#10b981", fontFamily: "monospace", fontSize: 11 }}
                          itemStyle={{ color: "#d1d5db", fontSize: 11 }}
                        />
                        <Line
                          name="RSI (14)"
                          type="monotone"
                          dataKey="rsi_14"
                          stroke="#a855f7"
                          strokeWidth={1.2}
                          dot={false}
                        />
                        {/* Overbought (70) and Oversold (30) reference lines */}
                        <Line type="monotone" dataKey={() => 70} stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Overbought (70)" />
                        <Line type="monotone" dataKey={() => 30} stroke="#10b981" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Oversold (30)" />
                      </ComposedChart>
                    ) : chartMode === "macd" ? (
                      <ComposedChart data={history} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f1911" vertical={false} />
                        <XAxis dataKey="date" stroke="#4b5563" fontSize={9} className="font-mono" />
                        <YAxis stroke="#4b5563" fontSize={9} className="font-mono" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#060a07", border: "1px solid #10b981", borderRadius: 8 }}
                          labelStyle={{ color: "#10b981", fontFamily: "monospace", fontSize: 11 }}
                          itemStyle={{ color: "#d1d5db", fontSize: 11 }}
                        />
                        <Line name="MACD" type="monotone" dataKey="macd" stroke="#eab308" strokeWidth={1} dot={false} />
                        <Line name="Signal" type="monotone" dataKey="macd_signal" stroke="#f43f5e" strokeWidth={1} dot={false} />
                      </ComposedChart>
                    ) : (
                      <ComposedChart data={history} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0f1911" vertical={false} />
                        <XAxis dataKey="date" stroke="#4b5563" fontSize={9} className="font-mono" />
                        <YAxis yAxisId="left" stroke="#3b82f6" fontSize={9} className="font-mono" label={{ value: 'PER', angle: -90, position: 'insideLeft', style: { fill: '#3b82f6', fontSize: 10, fontFamily: 'monospace' } }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={9} className="font-mono" label={{ value: 'PBR', angle: 90, position: 'insideRight', style: { fill: '#f59e0b', fontSize: 10, fontFamily: 'monospace' } }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#060a07", border: "1px solid #10b981", borderRadius: 8 }}
                          labelStyle={{ color: "#10b981", fontFamily: "monospace", fontSize: 11 }}
                          itemStyle={{ color: "#d1d5db", fontSize: 11 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", paddingTop: 10 }} />
                        <Line yAxisId="left" name="PER" type="monotone" dataKey="per" stroke="#3b82f6" strokeWidth={1.5} dot={true} activeDot={{ r: 4 }} connectNulls={true} />
                        <Line yAxisId="right" name="PBR" type="monotone" dataKey="pbr" stroke="#f59e0b" strokeWidth={1.5} dot={true} activeDot={{ r: 4 }} connectNulls={true} />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 4: GBM Projection & AI Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Monte Carlo Chart */}
              <div className="lg:col-span-6 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/40 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-emerald-950/40 pb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-mono text-zinc-300 uppercase tracking-wider">Monte Carlo GBM Forecast (30D)</h3>
                </div>

                <div className="h-[300px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={combinedForecastData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0f1911" vertical={false} />
                      <XAxis dataKey="date" stroke="#4b5563" fontSize={9} className="font-mono" />
                      <YAxis stroke="#4b5563" fontSize={9} className="font-mono" domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#060a07", border: "1px solid #10b981", borderRadius: 8 }}
                        labelStyle={{ color: "#10b981", fontFamily: "monospace", fontSize: 11 }}
                        itemStyle={{ color: "#d1d5db", fontSize: 11 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace", paddingTop: 10 }} />
                      <Area
                        name="95% Confidence Interval"
                        dataKey="upper_95"
                        stroke="transparent"
                        fill="rgba(16,185,129,0.03)"
                        activeDot={false}
                      />
                      <Area
                        name="50% Confidence Interval"
                        dataKey="upper_50"
                        stroke="transparent"
                        fill="rgba(16,185,129,0.08)"
                        activeDot={false}
                      />
                      <Line
                        name="Actual Close"
                        type="monotone"
                        dataKey="actual"
                        stroke="#e4e4e7"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        name="Forecast Mean"
                        type="monotone"
                        dataKey="mean"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        dot={false}
                      />
                      <Line
                        name="95% Lower Bound"
                        type="monotone"
                        dataKey="lower_95"
                        stroke="rgba(16,185,129,0.2)"
                        strokeDasharray="3 3"
                        strokeWidth={0.8}
                        dot={false}
                        legendType="none"
                      />
                      <Line
                        name="95% Upper Bound"
                        type="monotone"
                        dataKey="upper_95"
                        stroke="rgba(16,185,129,0.2)"
                        strokeDasharray="3 3"
                        strokeWidth={0.8}
                        dot={false}
                        legendType="none"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AI Quant Report */}
              <div className="lg:col-span-6 p-6 rounded-2xl bg-white/[0.01] border border-emerald-950/40 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-emerald-950/40 pb-3 justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-mono text-zinc-300 uppercase tracking-wider">AI Quant Analyst Insights</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {isGeneratingReport && (
                      <span className="flex items-center gap-1.5 text-[10px] font-mono text-amber-400">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Generating...
                      </span>
                    )}
                    {aiReport && !isGeneratingReport && (
                      <>
                        {savedKbId ? (
                          <Link
                            href="/knowledge"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/50 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <span>Saved: {savedKbId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <button
                            onClick={handleSaveNote}
                            disabled={isSavingNote}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:text-zinc-200 transition-colors disabled:opacity-50"
                          >
                            {isSavingNote ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                              </>
                            ) : (
                              <>
                                <span>Save to KB Note</span>
                              </>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar font-sans text-xs text-zinc-300 leading-relaxed prose prose-invert prose-xs">
                  {aiReport ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiReport}
                    </ReactMarkdown>
                  ) : isGeneratingReport ? (
                    <div className="flex flex-col gap-3 py-4">
                      <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse"></div>
                      <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse"></div>
                      <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse"></div>
                      <div className="h-4 bg-white/5 rounded w-2/3 animate-pulse"></div>
                      <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse"></div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-650 italic py-8">
                      データ分析後に自動生成されます。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
