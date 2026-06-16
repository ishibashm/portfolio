"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  Search,
  Activity,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  BrainCircuit,
  Crosshair,
  DollarSign,
  PieChart,
  ShieldAlert,
  RefreshCcw,
  MessageSquare,
  Sliders,
  Play,
  Layers,
  HelpCircle,
  Cpu,
  TrendingDown,
  ChevronRight,
  Globe,
  Settings,
  Flame,
  Award,
  Sparkles,
  ArrowUpRight
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell
} from "recharts";

import IRAnalysisWidget from "@/components/widgets/IRAnalysisWidget";
import { EconomicBbsAnalyzer } from "@/components/finance/EconomicBbsAnalyzer";
import { FinancialStatementVisualizer } from "@/components/finance/FinancialStatementVisualizer";

// Mock financial database for peers and simulation baseline
const STOCK_DATABASE: Record<string, {
  name: string;
  sector: string;
  price: number;
  marketCap: number;
  beta: number;
  roe: number;
  peRatio: number;
  revenue: number;
  operatingMargin: number;
  history: { date: string; close: number; roe: number; margin: number; sentiment: number; jobs: number }[];
  peers: { name: string; symbol: string; growth: number; pe: number; marketCap: number }[];
}> = {
  "7203": {
    name: "トヨタ自動車",
    sector: "輸送用機器",
    price: 3420,
    marketCap: 42100000000000,
    beta: 1.15,
    roe: 0.125,
    peRatio: 11.2,
    revenue: 43000000000000,
    operatingMargin: 0.118,
    history: Array.from({ length: 30 }).map((_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      close: 3100 + Math.sin(i * 0.3) * 150 + i * 12 + Math.random() * 50,
      roe: 0.115 + Math.sin(i * 0.1) * 0.01,
      margin: 0.112 + Math.cos(i * 0.2) * 0.008,
      sentiment: 0.2 + Math.sin(i * 0.4) * 0.5 + Math.random() * 0.1,
      jobs: 120 + i * 2 + Math.sin(i * 0.5) * 5
    })),
    peers: [
      { name: "トヨタ (7203)", symbol: "7203", growth: 12.5, pe: 11.2, marketCap: 42.1 },
      { name: "ホンダ (7267)", symbol: "7267", growth: 8.2, pe: 8.5, marketCap: 9.8 },
      { name: "日産 (7201)", symbol: "7201", growth: -2.1, pe: 6.2, marketCap: 2.1 },
      { name: "スバル (7270)", symbol: "7270", growth: 15.4, pe: 9.1, marketCap: 3.5 },
      { name: "マツダ (7261)", symbol: "7261", growth: 6.8, pe: 5.5, marketCap: 1.2 }
    ]
  },
  "9984": {
    name: "ソフトバンクグループ",
    sector: "情報・通信業",
    price: 9280,
    marketCap: 13500000000000,
    beta: 1.45,
    roe: 0.082,
    peRatio: 22.4,
    revenue: 6800000000000,
    operatingMargin: 0.085,
    history: Array.from({ length: 30 }).map((_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      close: 8500 + Math.cos(i * 0.4) * 400 + i * 25 + Math.random() * 100,
      roe: 0.075 + Math.cos(i * 0.1) * 0.015,
      margin: 0.078 + Math.sin(i * 0.2) * 0.012,
      sentiment: -0.1 + Math.cos(i * 0.3) * 0.6 + Math.random() * 0.15,
      jobs: 310 + i * 5 + Math.cos(i * 0.6) * 12
    })),
    peers: [
      { name: "SBG (9984)", symbol: "9984", growth: 18.5, pe: 22.4, marketCap: 13.5 },
      { name: "KDDI (9433)", symbol: "9433", growth: 4.2, pe: 13.8, marketCap: 10.2 },
      { name: "NTT (9432)", symbol: "9432", growth: 2.1, pe: 11.5, marketCap: 15.4 },
      { name: "楽天G (4755)", symbol: "4755", growth: 22.1, pe: 45.0, marketCap: 1.8 }
    ]
  },
  "6758": {
    name: "ソニーグループ",
    sector: "電気機器",
    price: 13850,
    marketCap: 17200000000000,
    beta: 1.22,
    roe: 0.142,
    peRatio: 18.5,
    revenue: 12500000000000,
    operatingMargin: 0.098,
    history: Array.from({ length: 30 }).map((_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      close: 12800 + Math.sin(i * 0.2) * 300 + i * 35 + Math.random() * 80,
      roe: 0.135 + Math.sin(i * 0.1) * 0.008,
      margin: 0.092 + Math.cos(i * 0.2) * 0.005,
      sentiment: 0.4 + Math.sin(i * 0.3) * 0.4 + Math.random() * 0.1,
      jobs: 450 + i * 4 + Math.sin(i * 0.4) * 8
    })),
    peers: [
      { name: "ソニーG (6758)", symbol: "6758", growth: 14.2, pe: 18.5, marketCap: 17.2 },
      { name: "パナソニック (6752)", symbol: "6752", growth: 5.5, pe: 9.8, marketCap: 3.8 },
      { name: "キーエンス (6861)", symbol: "6861", growth: 12.1, pe: 38.5, marketCap: 15.6 },
      { name: "日立 (6501)", symbol: "6501", growth: 18.2, pe: 16.4, marketCap: 12.8 }
    ]
  }
};

export default function AegisAnalyticsPage() {
  const [searchTicker, setSearchTicker] = useState("7203");
  const [activeTicker, setActiveTicker] = useState("7203");
  const [activeTab, setActiveTab] = useState<"aegis" | "ir_analysis" | "bbs" | "finance_paste">("aegis");

  // Multi-Analytic Chart Toggle States
  const [chartToggles, setChartToggles] = useState({
    price: true,
    roe: false,
    sentiment: false,
    alternative: false
  });

  // DCF Simulation State Variables
  const [dcfGrowth, setDcfGrowth] = useState(6.5); // Revenue Growth %
  const [dcfWacc, setDcfWacc] = useState(7.5); // WACC %
  const [dcfTerminal, setDcfTerminal] = useState(1.5); // Terminal Growth %

  // Quant Backtest State Variables
  const [backtestRules, setBacktestRules] = useState({
    peFilter: true,
    roeFilter: true,
    rsiFilter: false,
    goldenCross: false
  });
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any | null>(null);

  // MPT State Variables
  const [mptSelectedPeriod, setMptSelectedPeriod] = useState<"30" | "90" | "365">("90");
  const [mptSimulation, setMptSimulation] = useState<any[]>([]);

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ sender: "user" | "ai"; text: string }[]>([
    {
      sender: "ai",
      text: "Aegis AI 共同研究者へようこそ。この銘柄（トヨタ）の財務構造や有報リスク差分についてのご質問にリアルタイムで回答します。"
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Fetch / Get Stock Data
  const stock = useMemo(() => {
    return STOCK_DATABASE[activeTicker] || STOCK_DATABASE["7203"];
  }, [activeTicker]);

  // Handle stock change
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTicker = searchTicker.trim().replace(".T", "").replace(".t", "");
    if (STOCK_DATABASE[cleanTicker]) {
      setActiveTicker(cleanTicker);
    } else {
      alert("該当の銘柄コードが見つかりません。デモ用として「7203」「9984」「6758」に対応しています。");
    }
  };

  // Run MPT Monte Carlo Simulation
  const runMptSimulation = () => {
    const portfolioPoints = [];
    for (let i = 0; i < 200; i++) {
      // Randomly allocate weights to assets: Toyota, SBG, Sony, TOPIX
      const w1 = Math.random();
      const w2 = Math.random();
      const w3 = Math.random();
      const w4 = Math.random();
      const sum = w1 + w2 + w3 + w4;
      const weightToyota = w1 / sum;
      const weightSbg = w2 / sum;
      const weightSony = w3 / sum;
      const weightTopix = w4 / sum;

      // Simulated returns & risk
      const expectedReturn = (weightToyota * 12.5) + (weightSbg * 18.5) + (weightSony * 14.2) + (weightTopix * 6.5);
      const volatility = Math.sqrt(
        (weightToyota * 15) + (weightSbg * 28) + (weightSony * 18) + (weightTopix * 8) + 
        (weightToyota * weightSbg * 5) + (weightToyota * weightSony * 4) + (weightSbg * weightSony * 6)
      );

      const sharpe = (expectedReturn - 1.5) / volatility; // 1.5% Risk Free Rate

      portfolioPoints.push({
        id: i,
        risk: parseFloat(volatility.toFixed(2)),
        return: parseFloat(expectedReturn.toFixed(2)),
        sharpe: parseFloat(sharpe.toFixed(2)),
        weights: {
          Toyota: weightToyota,
          Sbg: weightSbg,
          Sony: weightSony,
          Topix: weightTopix
        }
      });
    }
    setMptSimulation(portfolioPoints);
  };

  useEffect(() => {
    runMptSimulation();
  }, [mptSelectedPeriod]);

  // Perform DCF calculation dynamically
  const dcfResult = useMemo(() => {
    const freeCashFlows = [];
    const baseFcf = stock.revenue * stock.operatingMargin * 0.6; // Proxy Free Cash Flow (NOPAT base)
    let totalPV = 0;
    const g = dcfGrowth / 100;
    const r = dcfWacc / 100;
    const tg = dcfTerminal / 100;

    for (let year = 1; year <= 5; year++) {
      const fcf = baseFcf * Math.pow(1 + g, year);
      const pv = fcf / Math.pow(1 + r, year);
      totalPV += pv;
      freeCashFlows.push({
        year: `${2026 + year} (E)`,
        FCF: Math.round(fcf / 1e8) / 100, // Billion Yen
        PV: Math.round(pv / 1e8) / 100
      });
    }

    const terminalFCF = baseFcf * Math.pow(1 + g, 5) * (1 + tg);
    const terminalValue = terminalFCF / (r - tg);
    const terminalPV = terminalValue / Math.pow(1 + r, 5);
    const enterpriseValue = totalPV + terminalPV;

    // Simulated net debt subtraction to get Equity Value
    const netDebt = stock.marketCap * 0.15;
    const equityValue = enterpriseValue - netDebt;
    const simulatedShares = stock.marketCap / stock.price;
    const calculatedFairPrice = equityValue / simulatedShares;

    const discountRatio = ((calculatedFairPrice - stock.price) / stock.price) * 100;

    return {
      freeCashFlows,
      fairValue: Math.round(calculatedFairPrice),
      discountRatio: parseFloat(discountRatio.toFixed(1)),
      enterpriseValue: Math.round(enterpriseValue / 1e8) / 100, // Billion Yen
      totalPV: Math.round(totalPV / 1e8) / 100,
      terminalPV: Math.round(terminalPV / 1e8) / 100
    };
  }, [stock, dcfGrowth, dcfWacc, dcfTerminal]);

  // Backtest run trigger
  const handleRunBacktest = () => {
    setIsRunningBacktest(true);
    setTimeout(() => {
      // Mathematical backtest result generation based on parameters selected
      let totalReturn = 45.2;
      let winRate = 0.52;
      let sharpe = 1.05;
      let maxDrawdown = -18.5;

      if (backtestRules.peFilter && backtestRules.roeFilter) {
        totalReturn = 145.2;
        winRate = 0.68;
        sharpe = 1.42;
        maxDrawdown = -12.5;
      } else if (backtestRules.rsiFilter && backtestRules.goldenCross) {
        totalReturn = 88.4;
        winRate = 0.61;
        sharpe = 1.21;
        maxDrawdown = -15.2;
      } else if (backtestRules.peFilter || backtestRules.roeFilter) {
        totalReturn = 62.1;
        winRate = 0.55;
        sharpe = 1.11;
        maxDrawdown = -16.8;
      }

      // Generate 20-period performance data
      const performanceData = Array.from({ length: 20 }).map((_, idx) => {
        const factor = totalReturn / 20;
        const randomness = Math.sin(idx * 0.5) * 10 + (Math.random() - 0.5) * 15;
        return {
          period: `Yr ${idx + 1}`,
          Strategy: Math.round(100 + idx * factor + randomness),
          Benchmark: Math.round(100 + idx * 4.5 + Math.sin(idx * 0.3) * 8)
        };
      });

      setBacktestResults({
        totalReturn,
        winRate,
        sharpe,
        maxDrawdown,
        chartData: performanceData
      });
      setIsRunningBacktest(false);
    }, 2500);
  };

  // AI Chat Submit Action
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput;
    setChatHistory(prev => [...prev, { sender: "user", text: userMessage }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      // Dynamic response generation simulating LLM analysis of the active stock
      setTimeout(() => {
        let aiReply = "";
        const msgLower = userMessage.toLowerCase();
        if (msgLower.includes("リスク") || msgLower.includes("risk")) {
          aiReply = `${stock.name} (${activeTicker}) の有価証券報告書「事業等のリスク」セクションでは、今年度に入り「地政学的対立に伴う半導体サプライチェーンの分断リスク」が前年比で42%加筆されています。また、原材料費高騰への耐性に関して、現在のマージンは ${ (stock.operatingMargin * 100).toFixed(1) }% を維持していますが、DCFシミュレーションの通りWACCが0.5%上昇すると理論株価に約8%の引下げ圧力がかかります。`;
        } else if (msgLower.includes("roe") || msgLower.includes("財務") || msgLower.includes("ファンダ")) {
          aiReply = `デュポン分析によると、${stock.name} のROEは ${ (stock.roe * 100).toFixed(1) }% です。これは純利益率、総資産回転率、及び財務レバレッジの積として分解されます。同業他社のバブルチャートが示す通り、現在のPERは ${stock.peRatio}倍 となっており、成長性 ${ stock.peers.find(p => p.symbol === activeTicker)?.growth }% に対し、セクター対比で極めて合理的なバリュエーション位置（PEGレシオ換算）にあります。`;
        } else if (msgLower.includes("dcf") || msgLower.includes("目標株価") || msgLower.includes("理論株価")) {
          aiReply = `現在のDCFシナリオ（売上成長率 ${dcfGrowth}%、WACC ${dcfWacc}%）では、理論株価は ¥${dcfResult.fairValue} と算出され、現在価格 (¥${stock.price}) に対し ${dcfResult.discountRatio >= 0 ? `${dcfResult.discountRatio}%の割安` : `${Math.abs(dcfResult.discountRatio)}%の割高`} を示しています。売上利益成長の安定度を考慮すると、割引率をさらに絞ることが可能かもしれません。`;
        } else {
          aiReply = `${stock.name} についてのクエリを受信しました。Aegis Analyticsのインテリジェンス・レイヤーは、TimesFM株価予測モデル（予測値Close平均）及び同業他社との財務スプレッドを複合解析しています。具体的なリスク要素、DCF計算時のパラメータ設定による理論価格のブレ幅など、どのような詳細を計算しますか？`;
        }

        setChatHistory(prev => [...prev, { sender: "ai", text: aiReply }]);
        setIsChatLoading(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      setIsChatLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#050508] text-zinc-100 font-sans p-4 md:p-6 overflow-x-hidden selection:bg-emerald-500/25 relative">
      {/* Background Liquid Glass Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none -z-10 animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none -z-10 animate-pulse" />

      <div className="max-w-[1500px] mx-auto space-y-6">
        {/* Header Console */}
        <header className="p-5 rounded-3xl bg-white/[0.01] border border-white/5 backdrop-blur-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Crosshair className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2 text-white">
                AEGIS ANALYTICS
                <span className="text-[9px] font-mono font-normal tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md uppercase">PRO PLATFORM</span>
              </h1>
              <p className="text-[10px] text-zinc-400 font-mono tracking-wider">
                MULTI-DIMENSIONAL QUANT & NLP DATAENGINE • EST. 2026
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <form onSubmit={handleSearchSubmit} className="relative flex-grow lg:flex-grow-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                placeholder="コード検索 (e.g. 7203, 9984)"
                className="w-full lg:w-56 pl-10 pr-24 py-2.5 bg-black/60 border border-white/5 rounded-2xl text-xs font-mono focus:outline-none focus:border-emerald-500/50 text-white placeholder:text-zinc-600 transition-colors"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl transition-colors font-mono"
              >
                RUN_ANALYSIS
              </button>
            </form>

            {/* Platform Level Toggles */}
            <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 text-[11px] font-medium">
              <button
                onClick={() => setActiveTab("aegis")}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === "aegis" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" /> Aegis ダッシュボード
              </button>
              <button
                onClick={() => setActiveTab("ir_analysis")}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === "ir_analysis" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                <PieChart className="w-3.5 h-3.5" /> 有報・IR分析
              </button>
              <button
                onClick={() => setActiveTab("bbs")}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === "bbs" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> 掲示板分析
              </button>
              <button
                onClick={() => setActiveTab("finance_paste")}
                className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === "finance_paste" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> コピペ可視化
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Tab Panels */}
        <AnimatePresence mode="wait">
          {activeTab === "aegis" && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {/* Ticker Quick Spec Strip */}
              <div className="p-4 px-6 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold font-mono text-emerald-400">{activeTicker}</span>
                  <div className="h-4 w-px bg-white/10" />
                  <span className="text-base font-extrabold text-white">{stock.name}</span>
                  <span className="text-xs text-zinc-500 bg-white/5 border border-white/5 px-2 py-0.5 rounded-lg">{stock.sector}</span>
                </div>
                <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500 mr-2 uppercase text-[9px] tracking-wider font-bold">Price</span>
                    <span className="text-emerald-400 font-bold">¥{stock.price.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 mr-2 uppercase text-[9px] tracking-wider font-bold">Beta</span>
                    <span className="text-white font-bold">{stock.beta}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 mr-2 uppercase text-[9px] tracking-wider font-bold">Market Cap</span>
                    <span className="text-white font-bold">¥{(stock.marketCap / 1e12).toFixed(1)}兆</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 mr-2 uppercase text-[9px] tracking-wider font-bold">Financial Score</span>
                    <span className="text-emerald-300 font-bold font-sans">AA-</span>
                  </div>
                </div>
              </div>

              {/* Bento Grid Configuration */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* [Panel A] Integrated Chart */}
                <section className="lg:col-span-2 p-5 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[420px]">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" /> [A] 統合マルチアナリティクス・チャート
                    </h2>
                    
                    {/* Layer Toggles */}
                    <div className="flex flex-wrap gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                      <button
                        onClick={() => setChartToggles(prev => ({ ...prev, price: !prev.price }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all border ${
                          chartToggles.price ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "border-transparent text-zinc-500"
                        }`}
                      >
                        PRC_株価
                      </button>
                      <button
                        onClick={() => setChartToggles(prev => ({ ...prev, roe: !prev.roe }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all border ${
                          chartToggles.roe ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "border-transparent text-zinc-500"
                        }`}
                      >
                        ROE_推移
                      </button>
                      <button
                        onClick={() => setChartToggles(prev => ({ ...prev, sentiment: !prev.sentiment }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all border ${
                          chartToggles.sentiment ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "border-transparent text-zinc-500"
                        }`}
                      >
                        SEN_センチメント
                      </button>
                      <button
                        onClick={() => setChartToggles(prev => ({ ...prev, alternative: !prev.alternative }))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all border ${
                          chartToggles.alternative ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "border-transparent text-zinc-500"
                        }`}
                      >
                        ALT_求人・トラフィック
                      </button>
                    </div>
                  </div>

                  {/* Recharts Container */}
                  <div className="w-full h-[320px] flex-grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stock.history}>
                        <defs>
                          <linearGradient id="chartCloseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#3f3f46" fontSize={9} tickFormatter={(d) => d.substring(8)} />
                        <YAxis yAxisId="price" stroke="#3f3f46" fontSize={9} domain={['auto', 'auto']} hide={!chartToggles.price} />
                        <YAxis yAxisId="percentage" stroke="#3f3f46" orientation="right" fontSize={9} domain={[0, 'auto']} hide={!chartToggles.roe} />
                        <YAxis yAxisId="sentiment" stroke="#3f3f46" orientation="right" fontSize={9} domain={[-1, 1]} hide={!chartToggles.sentiment} />
                        <YAxis yAxisId="alternative" stroke="#3f3f46" orientation="right" fontSize={9} domain={['auto', 'auto']} hide={!chartToggles.alternative} />
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#09090c", borderColor: "#1f1f23", borderRadius: "12px", fontSize: "11px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "10px" }} />
                        {chartToggles.price && (
                          <Area yAxisId="price" type="monotone" dataKey="close" name="株価 (Close)" stroke="#10b981" fill="url(#chartCloseGrad)" strokeWidth={2} />
                        )}
                        {chartToggles.roe && (
                          <Line yAxisId="percentage" type="monotone" dataKey="roe" name="ROE" stroke="#818cf8" strokeWidth={1.5} dot={false} />
                        )}
                        {chartToggles.sentiment && (
                          <Bar yAxisId="sentiment" dataKey="sentiment" name="感情指数" fill="#a855f7" radius={[4, 4, 0, 0]} opacity={0.6} />
                        )}
                        {chartToggles.alternative && (
                          <Line yAxisId="alternative" type="monotone" dataKey="jobs" name="求人掲載数 (Alt)" stroke="#fbbf24" strokeWidth={1.5} dot={false} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* [Panel C] Peer Valuation Scatter */}
                <section className="p-5 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[420px]">
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-emerald-400" /> [C] 同業他社比較バブルチャート
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      X: 売上成長率 (%) • Y: PER (倍) • Size: 時価総額
                    </p>
                  </div>

                  <div className="w-full h-[280px] flex-grow mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                        <XAxis type="number" dataKey="growth" name="売上成長率" unit="%" stroke="#3f3f46" fontSize={9} />
                        <YAxis type="number" dataKey="pe" name="PER" unit="倍" stroke="#3f3f46" fontSize={9} />
                        <ZAxis type="number" dataKey="marketCap" range={[60, 400]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          contentStyle={{ backgroundColor: "#09090c", borderColor: "#1f1f23", borderRadius: "12px", fontSize: "11px" }}
                        />
                        <Scatter name="同業セクター" data={stock.peers} fill="#10b981">
                          {stock.peers.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.symbol === activeTicker ? "#10b981" : "rgba(255,255,255,0.15)"}
                              stroke={entry.symbol === activeTicker ? "#6ee7b7" : "rgba(255,255,255,0.05)"}
                              strokeWidth={1}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 pt-2 border-t border-white/5">
                    <span>* バブルのサイズ: 時価総額 (兆円)</span>
                    <span className="text-emerald-400">● ターゲット銘柄</span>
                  </div>
                </section>

                {/* [Panel B] AI Earnings Co-Pilot */}
                <section className="lg:col-span-1 p-5 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[460px]">
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-emerald-400 animate-pulse" /> [B] AI決算コパイロット
                    </h2>
                    <div className="space-y-2.5">
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">2026Q3 決算要約</span>
                        <p className="text-xs text-zinc-300 leading-normal mt-1.5">
                          売上高は前年同期比 +8.2%。EV販売比率の増加および円安相場がポジティブに寄与。
                        </p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">懸念点・リスク</span>
                        <p className="text-xs text-zinc-300 leading-normal mt-1.5">
                          原材料費およびバッテリー部材のサプライチェーン維持コスト高騰により、営業利益率は約 0.5% 低下。
                        </p>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                        <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">有報「事業等のリスク」差分</span>
                        <p className="text-xs text-zinc-300 leading-normal mt-1.5">
                          前期記述と比較し、「グローバルな地政学リスクに伴う工場生産の停滞」項目が新たに追加されました。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Chat Console */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="h-[140px] overflow-y-auto mb-3 space-y-2 pr-1 custom-scrollbar text-[11px] font-mono">
                      {chatHistory.map((msg, i) => (
                        <div key={i} className={`p-2 rounded-xl leading-relaxed ${
                          msg.sender === "user" ? "bg-white/5 text-emerald-300 text-right ml-4" : "bg-black/30 text-zinc-300 mr-4"
                        }`}>
                          {msg.text}
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <RefreshCcw className="w-3 h-3 animate-spin text-emerald-400" />
                          <span>AIアナリスト思考中...</span>
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleChatSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="有報リスク差分や財務についてAIに尋ねる"
                        className="flex-grow bg-black/60 border border-white/5 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500/50"
                      />
                      <button
                        type="submit"
                        disabled={isChatLoading}
                        className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                      >
                        ASK_AI
                      </button>
                    </form>
                  </div>
                </section>

                {/* [Panel E] DCF Modeler & Cash Flow */}
                <section className="lg:col-span-2 p-5 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[460px]">
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-emerald-400" /> [E] 財務モデリング ＆ 将来予測DCFシミュレーター
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-4">
                      売上高から各財務ステップ、および将来予測スライダーによる理論株価のリアルタイム計算
                    </p>
                  </div>

                  {/* Flow Visualization (Sankey Concept) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 font-mono select-none">
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Revenue (売上)</span>
                      <span className="text-sm font-bold text-white mt-1 block">¥{(stock.revenue / 1e12).toFixed(1)}兆</span>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">OP Income (営業益)</span>
                      <span className="text-sm font-bold text-emerald-400 mt-1 block">¥{(stock.revenue * stock.operatingMargin / 1e12).toFixed(1)}兆</span>
                    </div>
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl text-center">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Net Income (純利益)</span>
                      <span className="text-sm font-bold text-white mt-1 block">¥{(stock.revenue * stock.operatingMargin * 0.6 / 1e12).toFixed(1)}兆</span>
                    </div>
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-center">
                      <span className="text-[9px] text-emerald-400 block uppercase font-bold tracking-wider">理論株価 (DCF)</span>
                      <span className="text-sm font-black text-emerald-300 mt-1 block">¥{dcfResult.fairValue.toLocaleString()}</span>
                      <span className={`text-[8px] font-bold ${dcfResult.discountRatio >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {dcfResult.discountRatio >= 0 ? `+${dcfResult.discountRatio}% 割安` : `${dcfResult.discountRatio}% 割高`}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center flex-grow">
                    {/* Future FCF Chart */}
                    <div className="h-[180px]">
                      <span className="text-[9px] text-zinc-500 font-mono block mb-2 uppercase tracking-wider font-bold">5-Year Projected FCF & PV</span>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dcfResult.freeCashFlows}>
                          <XAxis dataKey="year" stroke="#3f3f46" fontSize={8} />
                          <YAxis stroke="#3f3f46" fontSize={8} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#09090c", borderColor: "#1f1f23", borderRadius: "12px", fontSize: "10px" }}
                          />
                          <Bar dataKey="FCF" name="FCF予測" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="PV" name="現在価値 (PV)" fill="#818cf8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Simulation Slider Inputs */}
                    <div className="space-y-4 bg-black/40 p-4 rounded-2xl border border-white/5 text-xs font-mono">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-400">売上高成長率:</span>
                          <span className="text-emerald-400 font-bold">{dcfGrowth}%</span>
                        </div>
                        <input
                          type="range"
                          min="-10"
                          max="30"
                          step="0.5"
                          value={dcfGrowth}
                          onChange={(e) => setDcfGrowth(parseFloat(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-400">割引率 (WACC):</span>
                          <span className="text-indigo-400 font-bold">{dcfWacc}%</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="15"
                          step="0.1"
                          value={dcfWacc}
                          onChange={(e) => setDcfWacc(parseFloat(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-zinc-400">ターミナル成長率:</span>
                          <span className="text-amber-400 font-bold">{dcfTerminal}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={dcfTerminal}
                          onChange={(e) => setDcfTerminal(parseFloat(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* [Panel D] Correlation Matrix & MPT */}
                <section className="p-5 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[460px]">
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-emerald-400" /> [D] 相関マップ ＆ 現代ポートフォリオ理論(MPT)
                    </h2>
                    
                    {/* Period selectors */}
                    <div className="flex bg-white/5 p-0.5 rounded-xl border border-white/5 text-[9px] font-mono tracking-wider mb-4">
                      <button
                        onClick={() => setMptSelectedPeriod("30")}
                        className={`flex-1 py-1 rounded-lg transition-all ${mptSelectedPeriod === "30" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400"}`}
                      >
                        30D_HIST
                      </button>
                      <button
                        onClick={() => setMptSelectedPeriod("90")}
                        className={`flex-1 py-1 rounded-lg transition-all ${mptSelectedPeriod === "90" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400"}`}
                      >
                        90D_HIST
                      </button>
                      <button
                        onClick={() => setMptSelectedPeriod("365")}
                        className={`flex-1 py-1 rounded-lg transition-all ${mptSelectedPeriod === "365" ? "bg-emerald-600 text-white font-bold" : "text-zinc-400"}`}
                      >
                        1Y_HIST
                      </button>
                    </div>
                  </div>

                  {/* Correlation Map Render */}
                  <div className="space-y-2 font-mono text-[10px] mb-4">
                    <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider">Correlation Matrix</span>
                    <div className="grid grid-cols-5 gap-1.5 text-center">
                      <span className="text-zinc-500 text-[8px] flex items-center justify-center">TICK</span>
                      <span className="text-zinc-300 font-bold">7203</span>
                      <span className="text-zinc-300 font-bold">9984</span>
                      <span className="text-zinc-300 font-bold">6758</span>
                      <span className="text-zinc-300 font-bold">TOPIX</span>

                      <span className="text-zinc-300 font-bold text-[8px] flex items-center justify-center">7203</span>
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">1.0</div>
                      <div className="p-1.5 rounded bg-white/5 text-zinc-400">0.2</div>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500">0.5</div>
                      <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">0.8*</div>

                      <span className="text-zinc-300 font-bold text-[8px] flex items-center justify-center">9984</span>
                      <div className="p-1.5 rounded bg-white/5 text-zinc-400">0.2</div>
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">1.0</div>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500">0.4</div>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500 font-bold">0.6</div>

                      <span className="text-zinc-300 font-bold text-[8px] flex items-center justify-center">6758</span>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500">0.5</div>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500">0.4</div>
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">1.0</div>
                      <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">0.7*</div>

                      <span className="text-zinc-300 font-bold text-[8px] flex items-center justify-center">TOPIX</span>
                      <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">0.8*</div>
                      <div className="p-1.5 rounded bg-emerald-500/5 text-emerald-500 font-bold">0.6</div>
                      <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">0.7*</div>
                      <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">1.0</div>
                    </div>
                    <span className="text-[8px] text-rose-400 block pt-1 animate-pulse">* 0.7以上: 強相関の警告検知（ヘッジを推奨）</span>
                  </div>

                  {/* MPT Scatter Plot */}
                  <div className="h-[140px] w-full mt-2">
                    <span className="text-[9px] text-zinc-500 font-mono block mb-1.5 uppercase tracking-wider font-bold">Efficient Frontier (モンテカルロ)</span>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                        <XAxis type="number" dataKey="risk" name="ボラティリティ (Risk)" unit="%" stroke="#3f3f46" fontSize={8} />
                        <YAxis type="number" dataKey="return" name="期待リターン (Return)" unit="%" stroke="#3f3f46" fontSize={8} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#09090c", borderColor: "#1f1f23", borderRadius: "12px", fontSize: "10px" }}
                        />
                        <Scatter name="シミュレーション" data={mptSimulation} fill="#818cf8" opacity={0.5} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* [Panel F] Quant Backtest Engine */}
                <section className="lg:col-span-3 p-6 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col justify-between min-h-[380px]">
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-white mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" /> [F] クオンツ・ストラテジー・バックテスト (Polars 高速バックテスト)
                    </h2>
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-4">
                      財務・テクニカル条件を組み合わせて歴史的シミュレーションを実行します
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center flex-grow">
                    {/* Strategy Rules Builder */}
                    <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/5 text-xs font-mono">
                      <span className="text-[9px] text-zinc-400 block uppercase font-bold tracking-wider">戦略構築 (Rules Builder)</span>
                      
                      <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="text-zinc-300">ファンダ条件: PER &lt; 15</span>
                        <input
                          type="checkbox"
                          checked={backtestRules.peFilter}
                          onChange={(e) => setBacktestRules(prev => ({ ...prev, peFilter: e.target.checked }))}
                          className="accent-emerald-500 rounded"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="text-zinc-300">ファンダ条件: ROE &gt; 10%</span>
                        <input
                          type="checkbox"
                          checked={backtestRules.roeFilter}
                          onChange={(e) => setBacktestRules(prev => ({ ...prev, roeFilter: e.target.checked }))}
                          className="accent-emerald-500 rounded"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="text-zinc-300">テクニカル条件: RSI &lt; 30 (売られすぎ)</span>
                        <input
                          type="checkbox"
                          checked={backtestRules.rsiFilter}
                          onChange={(e) => setBacktestRules(prev => ({ ...prev, rsiFilter: e.target.checked }))}
                          className="accent-emerald-500 rounded"
                        />
                      </label>

                      <label className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                        <span className="text-zinc-300">テクニカル条件: 日足ゴールデンクロス</span>
                        <input
                          type="checkbox"
                          checked={backtestRules.goldenCross}
                          onChange={(e) => setBacktestRules(prev => ({ ...prev, goldenCross: e.target.checked }))}
                          className="accent-emerald-500 rounded"
                        />
                      </label>

                      <button
                        onClick={handleRunBacktest}
                        disabled={isRunningBacktest}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isRunningBacktest ? (
                          <>
                            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                            <span>TESTING STRATEGY...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>RUN BACKTEST</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Performance Metrics */}
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between h-full min-h-[160px] font-mono text-xs text-zinc-400">
                      <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-wider mb-2">検証指標 (Strategy Metrics)</span>
                      {backtestResults ? (
                        <div className="grid grid-cols-2 gap-3.5 mt-2">
                          <div>
                            <span className="text-[8px] text-zinc-500 block uppercase font-bold">累積リターン</span>
                            <span className="text-lg font-black text-emerald-400">+{backtestResults.totalReturn}%</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-zinc-500 block uppercase font-bold">シャープレシオ</span>
                            <span className="text-lg font-black text-indigo-300">{backtestResults.sharpe}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-zinc-500 block uppercase font-bold">最大ドローダウン (MDD)</span>
                            <span className="text-lg font-black text-rose-400">{backtestResults.maxDrawdown}%</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-zinc-500 block uppercase font-bold">勝率 (Win Rate)</span>
                            <span className="text-lg font-black text-white">{ (backtestResults.winRate * 100).toFixed(0) }%</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center opacity-50">
                          <Sliders className="w-6 h-6 text-zinc-600 mb-1" />
                          <p className="text-[10px]">購入ルールを設定し、シミュレーションを実行してください。</p>
                        </div>
                      )}
                    </div>

                    {/* Backtest Return Chart */}
                    <div className="h-[180px] w-full">
                      <span className="text-[9px] text-zinc-500 font-mono block mb-2 uppercase tracking-wider font-bold">Strategy Asset Curve (累積リターン)</span>
                      {backtestResults ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={backtestResults.chartData}>
                            <defs>
                              <linearGradient id="backtestStrategyGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="period" stroke="#3f3f46" fontSize={8} />
                            <YAxis stroke="#3f3f46" fontSize={8} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "#09090c", borderColor: "#1f1f23", borderRadius: "12px", fontSize: "10px" }}
                            />
                            <Area type="monotone" dataKey="Strategy" name="戦略リターン" stroke="#10b981" fill="url(#backtestStrategyGrad)" strokeWidth={2} />
                            <Line type="monotone" dataKey="Benchmark" name="TOPIX" stroke="#4b5563" strokeWidth={1} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center bg-white/[0.01] border border-dashed border-white/5 rounded-2xl opacity-40 text-center">
                          <span className="text-[10px] font-mono">Awaiting backtest run...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

              </div>
            </motion.div>
          )}

          {activeTab === "ir_analysis" && (
            <motion.div
              key="ir_analysis"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white/[0.01] border border-white/5 rounded-3xl p-6 min-h-[500px]"
            >
              <IRAnalysisWidget ticker={`${activeTicker}.T`} companyName={stock.name} />
            </motion.div>
          )}

          {activeTab === "bbs" && (
            <motion.div
              key="bbs"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white/[0.01] border border-white/5 rounded-3xl p-6 min-h-[500px]"
            >
              <EconomicBbsAnalyzer ticker={`${activeTicker}.T`} />
            </motion.div>
          )}

          {activeTab === "finance_paste" && (
            <motion.div
              key="finance_paste"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white/[0.01] border border-white/5 rounded-3xl p-6 min-h-[500px]"
            >
              <FinancialStatementVisualizer />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
