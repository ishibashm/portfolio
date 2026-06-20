"use client";

import React, { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from "recharts";
import { TrendingUp, TrendingDown, Sparkles, Activity, FileText, Loader2, PieChart, BarChart3, Calendar, AlertCircle, HelpCircle } from "lucide-react";

interface StockPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
}

interface BSData {
  assets: {
    current: number;
    non_current: number;
    total: number;
  };
  liabilities: {
    current: number;
    non_current: number;
    total: number;
  };
  equity: {
    share_capital: number;
    retained_earnings: number;
    other: number;
    total: number;
  };
}

interface PLData {
  net_sales: number;
  cost_of_sales: number;
  gross_profit: number;
  sga_expenses: number;
  operating_income: number;
  ordinary_income: number;
  net_income: number;
}

interface FinancialApiBS {
  currentAssets: number;
  nonCurrentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;
  totalLiabilities: number;
  shareCapital: number;
  retainedEarnings: number;
  totalEquity: number;
}

interface FinancialFetchMeta {
  source: string;
  mode: "primary" | "fallback" | "free_fallback";
  note?: string;
  asOf?: string;
}

function parseStockTable(text: string): StockPoint[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  // Parse header to find column indexes
  let dateIdx = -1;
  let openIdx = -1;
  let highIdx = -1;
  let lowIdx = -1;
  let closeIdx = -1;
  let changeIdx = -1;
  let volumeIdx = -1;

  const firstLine = lines[0];
  const headers = firstLine.split(/\s+/);
  const hasHeader = headers.some((h) => h.includes("日") || h.includes("値") || h.includes("高") || h.includes("安") || h.includes("出来") || h.includes("売買"));

  let startRow = 0;
  if (hasHeader && lines.length > 1) {
    startRow = 1;
    headers.forEach((h, idx) => {
      const cleanH = h.trim();
      if (cleanH.includes("日")) dateIdx = idx;
      else if (cleanH.includes("始")) openIdx = idx;
      else if (cleanH.includes("高") && !cleanH.includes("売買") && !cleanH.includes("出来") && !cleanH.includes("高(")) {
        highIdx = idx;
      } else if (cleanH.includes("安")) lowIdx = idx;
      else if (cleanH.includes("終")) closeIdx = idx;
      else if (cleanH.includes("比")) changeIdx = idx;
      else if (cleanH.includes("出来") || cleanH.includes("売買") || cleanH.includes("量") || cleanH.includes("高(")) {
        volumeIdx = idx;
      }
    });
  }

  // Fallbacks
  if (dateIdx === -1) dateIdx = 0;
  if (openIdx === -1) openIdx = 1;
  if (highIdx === -1) highIdx = 2;
  if (lowIdx === -1) lowIdx = 3;
  if (closeIdx === -1) closeIdx = 4;
  if (changeIdx === -1) changeIdx = 5;
  if (volumeIdx === -1) volumeIdx = headers.length - 1;

  const dataPoints: StockPoint[] = [];

  const cleanNum = (str: string) => {
    if (!str) return 0;
    const clean = str.replace(/[^\d.+\-]/g, "");
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  };

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 5) continue; // Need at least Date, O, H, L, C

    const dateVal = cols[dateIdx] || "";
    const openVal = cleanNum(cols[openIdx]);
    const highVal = cleanNum(cols[highIdx]);
    const lowVal = cleanNum(cols[lowIdx]);
    const closeVal = cleanNum(cols[closeIdx]);
    const changeVal = changeIdx !== -1 && cols[changeIdx] ? cleanNum(cols[changeIdx]) : 0;
    const volumeVal = volumeIdx !== -1 && cols[volumeIdx] ? cleanNum(cols[volumeIdx]) : 0;

    dataPoints.push({
      date: dateVal,
      open: openVal,
      high: highVal,
      low: lowVal,
      close: closeVal,
      change: changeVal,
      volume: volumeVal,
    });
  }

  // Sort chronologically (oldest to newest)
  const parseDateForSorting = (dateStr: string) => {
    const parts = dateStr.split(/[\/\-]/);
    if (parts.length === 3) {
      let year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      if (year < 100) year += 2000;
      return new Date(year, month, day).getTime();
    } else if (parts.length === 2) {
      const year = new Date().getFullYear();
      const month = parseInt(parts[0]) - 1;
      const day = parseInt(parts[1]);
      return new Date(year, month, day).getTime();
    }
    return 0;
  };

  dataPoints.sort((a, b) => parseDateForSorting(a.date) - parseDateForSorting(b.date));
  return dataPoints;
}

function parseBSTable(text: string): BSData {
  const lines = text.split(/\r?\n/);
  const data = {
    currentAssets: 0,
    nonCurrentAssets: 0,
    totalAssets: 0,
    currentLiabilities: 0,
    nonCurrentLiabilities: 0,
    totalLiabilities: 0,
    shareCapital: 0,
    retainedEarnings: 0,
    totalEquity: 0,
  };

  const cleanVal = (str: string) => {
    const match = str.replace(/,/g, "").match(/[\d.]+/);
    if (!match) return 0;
    return parseFloat(match[0]);
  };

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    const val = cleanVal(cleanLine);
    if (val === 0) return;

    if (/流動.*資/.test(cleanLine)) data.currentAssets = val;
    else if (/固定.*資/.test(cleanLine)) data.nonCurrentAssets = val;
    else if (/(資産合計|資産の部合計|総資産)/.test(cleanLine)) data.totalAssets = val;
    else if (/流動.*負/.test(cleanLine)) data.currentLiabilities = val;
    else if (/固定.*負/.test(cleanLine)) data.nonCurrentLiabilities = val;
    else if (/(負債合計|負債の部合計|総負債)/.test(cleanLine)) data.totalLiabilities = val;
    else if (/資本金/.test(cleanLine)) data.shareCapital = val;
    else if (/利益.*剰/.test(cleanLine)) data.retainedEarnings = val;
    else if (/(純資産合計|自己資本|総純資産|純資産の部合計)/.test(cleanLine)) data.totalEquity = val;
  });

  // Fallbacks
  if (data.totalAssets === 0) {
    data.totalAssets = data.currentAssets + data.nonCurrentAssets;
  }
  if (data.totalLiabilities === 0) {
    data.totalLiabilities = data.currentLiabilities + data.nonCurrentLiabilities;
  }
  if (data.totalEquity === 0) {
    data.totalEquity = data.totalAssets - data.totalLiabilities;
  }

  return {
    assets: {
      current: data.currentAssets,
      non_current: data.nonCurrentAssets,
      total: data.totalAssets,
    },
    liabilities: {
      current: data.currentLiabilities,
      non_current: data.nonCurrentLiabilities,
      total: data.totalLiabilities,
    },
    equity: {
      share_capital: data.shareCapital,
      retained_earnings: data.retainedEarnings,
      other: Math.max(0, data.totalEquity - data.shareCapital - data.retainedEarnings),
      total: data.totalEquity,
    },
  };
}

function parsePLTable(text: string): PLData {
  const lines = text.split(/\r?\n/);
  const data = {
    netSales: 0,
    costOfSales: 0,
    grossProfit: 0,
    sgaExpenses: 0,
    operatingIncome: 0,
    ordinaryIncome: 0,
    netIncome: 0,
  };

  const cleanVal = (str: string) => {
    const match = str.replace(/,/g, "").match(/[\d.]+/);
    if (!match) return 0;
    return parseFloat(match[0]);
  };

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    const val = cleanVal(cleanLine);
    if (val === 0) return;

    if (/(売上高|売上収益|営業収益)/.test(cleanLine)) data.netSales = val;
    else if (/(売上原価|売上高原価)/.test(cleanLine)) data.costOfSales = val;
    else if (/売上総利益/.test(cleanLine)) data.grossProfit = val;
    else if (/(販売費|一般管理|販管費)/.test(cleanLine)) data.sgaExpenses = val;
    else if (/営業利益/.test(cleanLine)) data.operatingIncome = val;
    else if (/経常利益/.test(cleanLine)) data.ordinaryIncome = val;
    else if (/(当期純利益|当期利益|純利益)/.test(cleanLine)) data.netIncome = val;
  });

  // Fallbacks
  if (data.grossProfit === 0 && data.netSales > 0) {
    data.grossProfit = data.netSales - data.costOfSales;
  }
  if (data.operatingIncome === 0 && data.grossProfit > 0) {
    data.operatingIncome = data.grossProfit - data.sgaExpenses;
  }
  if (data.ordinaryIncome === 0) {
    data.ordinaryIncome = data.operatingIncome;
  }

  return {
    net_sales: data.netSales,
    cost_of_sales: data.costOfSales,
    gross_profit: data.grossProfit,
    sga_expenses: data.sgaExpenses,
    operating_income: data.operatingIncome,
    ordinary_income: data.ordinaryIncome,
    net_income: data.netIncome,
  };
}

export function FinancialStatementVisualizer() {
  const [activeMode, setActiveMode] = useState<"stock" | "bs" | "pl">("stock");
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [financialFetchMeta, setFinancialFetchMeta] = useState<FinancialFetchMeta | null>(null);
  const [stockCode, setStockCode] = useState("285A");

  // Parsed Results
  const [stockResult, setStockResult] = useState<StockPoint[] | null>(null);
  const [bsResult, setBsResult] = useState<BSData | null>(null);
  const [plResult, setPlResult] = useState<PLData | null>(null);

  // Monex Example Data pasted by user
  const exampleStockData = `06/15	3,339.0	3,350.0	3,290.0	3,320.0	+28.0	16,105,300
06/12	3,349.0	3,363.0	3,246.0	3,292.0	-77.0	28,052,300
06/11	3,315.0	3,398.0	3,312.0	3,369.0	-16.0	14,530,400
06/10	3,436.0	3,446.0	3,347.0	3,385.0	-58.0	15,986,300
06/09	3,524.0	3,531.0	3,425.0	3,443.0	-65.0	16,840,900
06/08	3,489.0	3,555.0	3,456.0	3,508.0	-51.0	16,837,100
06/05	3,580.0	3,633.0	3,559.0	3,559.0	+19.0	13,768,900
06/04	3,589.0	3,606.0	3,505.0	3,540.0	-79.0	19,404,500
06/03	3,599.0	3,658.0	3,558.0	3,619.0	-50.0	17,219,400
06/02	3,584.0	3,672.0	3,562.0	3,669.0	+127.0	24,443,600
06/01	3,471.0	3,604.0	3,457.0	3,542.0	+98.0	21,486,100`;

  const exampleBsData = `流動資産	12,500
固定資産	28,000
資産合計	40,500
流動負債	8,200
固定負債	14,300
負債合計	22,500
資本金	5,000
利益剰余金	11,200
自己株式等	1,800
純資産合計	18,000`;

  const examplePlData = `売上高 150,000 百万円
売上原価 90,000 百万円
販売費及び一般管理費 42,000 百万円
営業利益 18,000 百万円
経常利益 19,500 百万円
当期純利益 13,000 百万円`;

  const loadExample = () => {
    setError(null);
    if (activeMode === "stock") {
      setInputText(exampleStockData);
    } else if (activeMode === "bs") {
      setInputText(exampleBsData);
    } else {
      setInputText(examplePlData);
    }
  };

  const handleParse = () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);

    setTimeout(() => {
      try {
        if (activeMode === "stock") {
          const parsed = parseStockTable(inputText);
          if (parsed.length === 0) {
            throw new Error("有効な株価データ（日付、始値、高値、安値、終値）が見つかりませんでした。タブ区切りやスペース区切りのテキストを入力してください。");
          }
          setStockResult(parsed);
        } else if (activeMode === "bs") {
          const parsed = parseBSTable(inputText);
          if (parsed.assets.total === 0) {
            throw new Error("有効な貸借対照表（流動資産、固定資産、負債、純資産など）の数値が見つかりませんでした。");
          }
          setBsResult(parsed);
        } else if (activeMode === "pl") {
          const parsed = parsePLTable(inputText);
          if (parsed.net_sales === 0) {
            throw new Error("有効な損益計算書（売上高、営業利益、当期純利益など）の数値が見つかりませんでした。");
          }
          setPlResult(parsed);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "パース処理中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleFetchKabutan = async () => {
    if (!stockCode.trim()) return;
    setLoading(true);
    setError(null);
    setFinancialFetchMeta(null);

    try {
      const res = await fetch(`/api/finance/kabutan?code=${stockCode.trim().toUpperCase()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "株探からのデータ取得に失敗しました。");
      }

      setStockResult(data.data);
      // Pre-fill input text with formatted tab-separated values (TSV) in reverse order (newest first like clipboard)
      const tsvLines = data.data.map((pt: any) => `${pt.date}\t${pt.open}\t${pt.high}\t${pt.low}\t${pt.close}\t${pt.change}\t${pt.volume}`);
      setInputText(["日付\t始値\t高値\t安値\t終値\t前日比\t売買高(株)", ...[...tsvLines].reverse()].join("\n"));
    } catch (err: any) {
      console.error(err);
      setError(err.message || "予期セぬエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchJQuants = async () => {
    if (!stockCode.trim()) return;
    setLoading(true);
    setError(null);
    setFinancialFetchMeta(null);

    try {
      const res = await fetch(`/api/finance/jquants/details?code=${stockCode.trim().toUpperCase()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "J-Quantsからのデータ取得に失敗しました。");
      }

      const { bs, pl } = data.data as { bs: FinancialApiBS; pl: PLData };
      setBsResult({
        assets: {
          current: bs.currentAssets,
          non_current: bs.nonCurrentAssets,
          total: bs.totalAssets,
        },
        liabilities: {
          current: bs.currentLiabilities,
          non_current: bs.nonCurrentLiabilities,
          total: bs.totalLiabilities,
        },
        equity: {
          share_capital: bs.shareCapital,
          retained_earnings: bs.retainedEarnings,
          other: Math.max(0, bs.totalEquity - bs.shareCapital - bs.retainedEarnings),
          total: bs.totalEquity,
        },
      });
      setPlResult(pl);
      setFinancialFetchMeta(data.meta as FinancialFetchMeta);

      const bsTsv = [`流動資産\t${formatNumber(bs.currentAssets)}`, `固定資産\t${formatNumber(bs.nonCurrentAssets)}`, `資産合計\t${formatNumber(bs.totalAssets)}`, `流動負債\t${formatNumber(bs.currentLiabilities)}`, `固定負債\t${formatNumber(bs.nonCurrentLiabilities)}`, `負債合計\t${formatNumber(bs.totalLiabilities)}`, `資本金\t${formatNumber(bs.shareCapital)}`, `利益剰余金\t${formatNumber(bs.retainedEarnings)}`, `純資産合計\t${formatNumber(bs.totalEquity)}`].join("\n");

      const plTsv = [`売上高\t${formatNumber(pl.net_sales)}`, `売上原価\t${formatNumber(pl.cost_of_sales)}`, `販売費及び一般管理費\t${formatNumber(pl.sga_expenses)}`, `営業利益\t${formatNumber(pl.operating_income)}`, `経常利益\t${formatNumber(pl.ordinary_income)}`, `当期純利益\t${formatNumber(pl.net_income)}`].join("\n");

      setInputText(activeMode === "bs" ? bsTsv : plTsv);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "J-Quantsからのデータ取得中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return "0";
    return new Intl.NumberFormat("ja-JP").format(num);
  };

  // Stock stats calculation
  const stockStats = useMemo(() => {
    if (!stockResult || stockResult.length === 0) return null;
    const closes = stockResult.map((d) => d.close);
    const startVal = closes[0];
    const endVal = closes[closes.length - 1];
    const change = endVal - startVal;
    const changePct = (change / startVal) * 100;
    const maxClose = Math.max(...closes);
    const minClose = Math.min(...closes);
    const totalVolume = stockResult.reduce((sum, curr) => sum + curr.volume, 0);

    return {
      startVal,
      endVal,
      change,
      changePct,
      maxClose,
      minClose,
      totalVolume,
    };
  }, [stockResult]);

  // Calculate dynamic chart min/max domain
  const yDomain = useMemo(() => {
    if (!stockResult || stockResult.length === 0) return ["auto", "auto"];
    const prices = stockResult.map((d) => d.close);
    const minVal = Math.min(...prices);
    const maxVal = Math.max(...prices);
    const diff = maxVal - minVal;
    const buffer = Math.max(10, diff * 0.05);
    const minDomain = Math.max(0, Math.floor(minVal - buffer));
    const maxDomain = Math.ceil(maxVal + buffer);
    return [minDomain, maxDomain];
  }, [stockResult]);

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl text-slate-200">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-bold text-sm text-slate-100">財務・株価コピペビジュアライザー</h3>
            <p className="text-[10px] text-slate-500 font-mono">STOCK & FINANCIAL STATEMENT PARSER</p>
          </div>
        </div>
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          <button
            onClick={() => {
              setActiveMode("stock");
              setInputText("");
              setError(null);
              setFinancialFetchMeta(null);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeMode === "stock" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            時系列株価
          </button>
          <button
            onClick={() => {
              setActiveMode("bs");
              setInputText("");
              setError(null);
              setFinancialFetchMeta(null);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeMode === "bs" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            貸借対照表 (B/S)
          </button>
          <button
            onClick={() => {
              setActiveMode("pl");
              setInputText("");
              setError(null);
              setFinancialFetchMeta(null);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeMode === "pl" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            損益計算書 (P/L)
          </button>
        </div>
      </div>

      <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-5">
        {/* Paste Box Area */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              コピーしたテキストを貼り付けてください:
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={loadExample} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold uppercase tracking-wider">
                [ サンプル入力 ]
              </button>
              <button type="button" onClick={() => setInputText("")} className="text-[10px] text-slate-500 hover:text-slate-300 uppercase tracking-wider">
                [ クリア ]
              </button>
            </div>
          </div>

          {activeMode === "stock" && (
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
              <span className="text-[10px] text-indigo-400 font-bold font-mono tracking-wider">[AUTO FETCH]</span>
              <input type="text" value={stockCode} onChange={(e) => setStockCode(e.target.value)} placeholder="コード (e.g. 285A)" className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-32 font-bold font-mono text-center uppercase" disabled={loading} />
              <button type="button" onClick={handleFetchKabutan} disabled={loading || !stockCode.trim()} className="px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5">
                <span>株探から時系列データを自動取得</span>
              </button>
            </div>
          )}

          {(activeMode === "bs" || activeMode === "pl") && (
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
              <span className="text-[10px] text-emerald-400 font-bold font-mono tracking-wider">[FINANCIAL AUTO]</span>
              <input type="text" value={stockCode} onChange={(e) => setStockCode(e.target.value)} placeholder="コード (e.g. 8697)" className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-32 font-bold font-mono text-center uppercase" disabled={loading} />
              <button type="button" onClick={handleFetchJQuants} disabled={loading || !stockCode.trim()} className="px-3 py-1 bg-emerald-600/80 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5">
                <span>財務諸表を自動取得</span>
              </button>
            </div>
          )}

          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={activeMode === "stock" ? "証券会社やYahooファイナンス等の時系列株価テーブルをコピペしてください..." : activeMode === "bs" ? "決算短信や決算説明資料等のB/Sデータ（資産・負債・純資産）をコピペしてください..." : "決算短信等のP/Lデータ（売上高・各種利益・費用）をコピペしてください..."} className="w-full h-28 p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 resize-none font-mono leading-relaxed" disabled={loading} />

          <button onClick={handleParse} disabled={loading || !inputText.trim()} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-950/20 transition-all flex items-center justify-center gap-2 cursor-pointer">
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>データパース・可視化中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>データをパースして可視化する</span>
              </>
            )}
          </button>
        </div>

        {/* Error overlay */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {financialFetchMeta && activeMode !== "stock" && (
          <div className={`p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in duration-200 ${financialFetchMeta.mode === "primary" ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border border-amber-500/20 text-amber-300"}`}>
            <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-semibold">取得元: {financialFetchMeta.source}</p>
              {financialFetchMeta.note && <p className="opacity-80">{financialFetchMeta.note}</p>}
            </div>
          </div>
        )}

        {/* Visualized Results */}

        {/* 1. STOCK CHART RESULT */}
        {activeMode === "stock" && stockResult && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Stats header */}
            {stockStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Period Change</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-lg font-bold font-mono ${stockStats.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {stockStats.changePct >= 0 ? "+" : ""}
                      {stockStats.changePct.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({stockStats.change >= 0 ? "+" : ""}
                      {stockStats.change.toFixed(1)})
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">High Price</span>
                  <span className="text-lg font-bold font-mono text-slate-100 mt-1 block">{formatNumber(stockStats.maxClose)}</span>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Low Price</span>
                  <span className="text-lg font-bold font-mono text-slate-100 mt-1 block">{formatNumber(stockStats.minClose)}</span>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[10px] text-slate-500 block uppercase font-mono">Total Vol</span>
                  <span className="text-lg font-bold font-mono text-indigo-400 mt-1 block">{formatNumber(stockStats.totalVolume)}</span>
                </div>
              </div>
            )}

            {/* Recharts chart */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stockResult} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartCloseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#475569"
                    tick={{
                      fill: "#64748b",
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    domain={yDomain}
                    stroke="#475569"
                    tick={{
                      fill: "#94a3b8",
                      fontSize: 10,
                      fontFamily: "monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `¥${val}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#475569"
                    tick={{
                      fill: "#475569",
                      fontSize: 9,
                      fontFamily: "monospace",
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                    }}
                    labelStyle={{
                      color: "#64748b",
                      fontFamily: "monospace",
                      fontSize: "10px",
                    }}
                    itemStyle={{ fontSize: "12px" }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="close" name="終値 (Close)" stroke="#6366f1" strokeWidth={2} fill="url(#chartCloseGrad)" />
                  <Bar yAxisId="right" dataKey="volume" name="出来高 (Vol)" fill="#3b82f6" opacity={0.35} barSize={15} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 2. B/S DUAL BAR RESULT */}
        {activeMode === "bs" && bsResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-300">
            {/* Visual Balance Sheet Dual Stacked Bar */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-emerald-400" />
                バランスビジュアライザー (資産 vs 負債・純資産)
              </h4>

              {/* The Balanced Columns */}
              <div className="flex gap-10 justify-center py-6">
                {/* Column 1: Assets */}
                <div className="flex flex-col items-center w-28 sm:w-36">
                  <span className="text-[10px] text-slate-400 font-bold mb-2 uppercase">資産 (Assets)</span>
                  <div className="w-full h-80 border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900 flex flex-col justify-end shadow-inner">
                    {/* Fixed Assets segment */}
                    <div
                      className="bg-indigo-600/90 hover:bg-indigo-500 border-t border-slate-700/30 flex flex-col items-center justify-center p-2 text-center transition-all cursor-default"
                      style={{
                        height: `${(bsResult.assets.non_current / bsResult.assets.total) * 100}%`,
                      }}
                      title={`固定資産: ${formatNumber(bsResult.assets.non_current)} 百万円`}
                    >
                      <span className="text-[9px] font-bold text-white block">固定資産</span>
                      <span className="text-[9px] font-mono text-indigo-200">{((bsResult.assets.non_current / bsResult.assets.total) * 100).toFixed(0)}%</span>
                    </div>

                    {/* Current Assets segment */}
                    <div
                      className="bg-indigo-400/90 hover:bg-indigo-300 flex flex-col items-center justify-center p-2 text-center transition-all cursor-default"
                      style={{
                        height: `${(bsResult.assets.current / bsResult.assets.total) * 100}%`,
                      }}
                      title={`流動資産: ${formatNumber(bsResult.assets.current)} 百万円`}
                    >
                      <span className="text-[9px] font-bold text-neutral-900 block">流動資産</span>
                      <span className="text-[9px] font-mono text-indigo-950">{((bsResult.assets.current / bsResult.assets.total) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-indigo-400 mt-2.5">Total: {formatNumber(bsResult.assets.total)}</span>
                </div>

                {/* Column 2: Liabilities + Equity */}
                <div className="flex flex-col items-center w-28 sm:w-36">
                  <span className="text-[10px] text-slate-400 font-bold mb-2 uppercase">負債・純資産</span>
                  <div className="w-full h-80 border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900 flex flex-col justify-end shadow-inner">
                    {/* Net Assets/Equity segment */}
                    <div
                      className="bg-emerald-500/90 hover:bg-emerald-400 border-t border-slate-700/30 flex flex-col items-center justify-center p-2 text-center transition-all cursor-default"
                      style={{
                        height: `${(bsResult.equity.total / bsResult.assets.total) * 100}%`,
                      }}
                      title={`純資産: ${formatNumber(bsResult.equity.total)} 百万円`}
                    >
                      <span className="text-[9px] font-bold text-neutral-950 block">純資産</span>
                      <span className="text-[9px] font-mono text-emerald-950">{((bsResult.equity.total / bsResult.assets.total) * 100).toFixed(0)}%</span>
                    </div>

                    {/* Non-current Liabilities segment */}
                    <div
                      className="bg-amber-600/95 hover:bg-amber-500 border-t border-slate-700/30 flex flex-col items-center justify-center p-2 text-center transition-all cursor-default"
                      style={{
                        height: `${(bsResult.liabilities.non_current / bsResult.assets.total) * 100}%`,
                      }}
                      title={`固定負債: ${formatNumber(bsResult.liabilities.non_current)} 百万円`}
                    >
                      <span className="text-[9px] font-bold text-white block">固定負債</span>
                      <span className="text-[9px] font-mono text-amber-200">{((bsResult.liabilities.non_current / bsResult.assets.total) * 100).toFixed(0)}%</span>
                    </div>

                    {/* Current Liabilities segment */}
                    <div
                      className="bg-amber-400/95 hover:bg-amber-300 flex flex-col items-center justify-center p-2 text-center transition-all cursor-default"
                      style={{
                        height: `${(bsResult.liabilities.current / bsResult.assets.total) * 100}%`,
                      }}
                      title={`流動負債: ${formatNumber(bsResult.liabilities.current)} 百万円`}
                    >
                      <span className="text-[9px] font-bold text-neutral-900 block">流動負債</span>
                      <span className="text-[9px] font-mono text-amber-950">{((bsResult.liabilities.current / bsResult.assets.total) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-400 mt-2.5">Total: {formatNumber(bsResult.liabilities.total + bsResult.equity.total)}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 text-center leading-relaxed">※左右の棒の高さは等しく一致します（資産合計 ＝ 負債合計 ＋ 純資産合計）</div>
            </div>

            {/* B/S detailed data list */}
            <div className="space-y-4">
              {/* Assets Details */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h5 className="text-xs font-bold text-indigo-400 border-b border-slate-800 pb-2 flex justify-between items-center">
                  <span>資産の部 (Assets)</span>
                  <span className="font-mono">{formatNumber(bsResult.assets.total)} 百万円</span>
                </h5>
                <div className="divide-y divide-slate-800/60 text-xs py-2">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">流動資産</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.assets.current)} 百万円</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">固定資産</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.assets.non_current)} 百万円</span>
                  </div>
                </div>
              </div>

              {/* Liabilities Details */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h5 className="text-xs font-bold text-amber-400 border-b border-slate-800 pb-2 flex justify-between items-center">
                  <span>負債の部 (Liabilities)</span>
                  <span className="font-mono">{formatNumber(bsResult.liabilities.total)} 百万円</span>
                </h5>
                <div className="divide-y divide-slate-800/60 text-xs py-2">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">流動負債</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.liabilities.current)} 百万円</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">固定負債</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.liabilities.non_current)} 百万円</span>
                  </div>
                </div>
              </div>

              {/* Equity Details */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h5 className="text-xs font-bold text-emerald-400 border-b border-slate-800 pb-2 flex justify-between items-center">
                  <span>純資産の部 (Equity)</span>
                  <span className="font-mono">{formatNumber(bsResult.equity.total)} 百万円</span>
                </h5>
                <div className="divide-y divide-slate-800/60 text-xs py-2">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">資本金</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.equity.share_capital)} 百万円</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">利益剰余金</span>
                    <span className="font-mono text-slate-200">{formatNumber(bsResult.equity.retained_earnings)} 百万円</span>
                  </div>
                  {bsResult.equity.other !== 0 && (
                    <div className="flex justify-between py-2.5">
                      <span className="text-slate-400 pl-2">自己株式・その他</span>
                      <span className="font-mono text-slate-200">{formatNumber(bsResult.equity.other)} 百万円</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. P/L WATERFALL CHART RESULT */}
        {activeMode === "pl" && plResult && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-300">
            {/* Visual Waterfall using SVG */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                ウォーターフォール図 (収益・費用・利益の流れ)
              </h4>

              {/* SVG waterfall chart rendering */}
              <div className="relative w-full overflow-x-auto custom-scrollbar flex justify-center py-4">
                {(() => {
                  const svgWidth = 480;
                  const svgHeight = 240;
                  const padding = 20;

                  // Define the waterfall segments
                  const sales = plResult.net_sales;
                  const cost = -plResult.cost_of_sales;
                  const gross = plResult.gross_profit;
                  const sga = -plResult.sga_expenses;
                  const operating = plResult.operating_income;
                  const net = plResult.net_income;

                  // Max value to scale height
                  const maxValue = sales;

                  const scaleY = (val: number) => {
                    return svgHeight - padding - (val / maxValue) * (svgHeight - 2 * padding);
                  };

                  const bars = [
                    {
                      label: "売上高",
                      start: 0,
                      end: sales,
                      color: "#6366f1",
                      isTotal: true,
                    },
                    {
                      label: "売上原価",
                      start: sales,
                      end: sales + cost,
                      color: "#f43f5e",
                      isTotal: false,
                    },
                    {
                      label: "売上総利益",
                      start: 0,
                      end: gross,
                      color: "#3b82f6",
                      isTotal: true,
                    },
                    {
                      label: "販管費",
                      start: gross,
                      end: gross + sga,
                      color: "#f43f5e",
                      isTotal: false,
                    },
                    {
                      label: "営業利益",
                      start: 0,
                      end: operating,
                      color: "#10b981",
                      isTotal: true,
                    },
                    {
                      label: "当期利益",
                      start: 0,
                      end: net,
                      color: "#059669",
                      isTotal: true,
                    },
                  ];

                  const barWidth = 55;
                  const gap = 15;

                  return (
                    <svg width={svgWidth} height={svgHeight} className="select-none font-mono">
                      {/* Gridline for zero */}
                      <line x1={padding} y1={scaleY(0)} x2={svgWidth - padding} y2={scaleY(0)} stroke="#334155" strokeDasharray="2 2" />

                      {bars.map((bar, i) => {
                        const x = padding + i * (barWidth + gap);
                        const yStart = scaleY(Math.max(bar.start, bar.end));
                        const yEnd = scaleY(Math.min(bar.start, bar.end));
                        const height = Math.max(3, Math.abs(yStart - yEnd));

                        // Label text inside or above the bar
                        const displayVal = formatNumber(Math.abs(bar.end - bar.start));

                        return (
                          <g key={i}>
                            {/* Bar rectangle */}
                            <rect x={x} y={yEnd} width={barWidth} height={height} fill={bar.color} rx={4} className="transition-all hover:brightness-110 cursor-default" />

                            {/* Connect lines between step bars */}
                            {i < bars.length - 1 && <line x1={x + barWidth} y1={scaleY(bar.end)} x2={x + barWidth + gap} y2={scaleY(bar.end)} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />}

                            {/* Label on top of bar */}
                            <text x={x + barWidth / 2} y={yEnd - 6} textAnchor="middle" fill="#94a3b8" fontSize={8} fontWeight="bold">
                              {displayVal}
                            </text>

                            {/* Bottom Label (Truncated in JP) */}
                            <text x={x + barWidth / 2} y={svgHeight - 4} textAnchor="middle" fill="#64748b" fontSize={8}>
                              {bar.label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>

              <div className="text-[10px] text-slate-500 text-center leading-relaxed">※売上高から各費用（赤）が差し引かれ、営業利益、最終利益（緑）へ至る階段図です。</div>
            </div>

            {/* P/L detailed data list */}
            <div className="space-y-4">
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                <h5 className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-2 flex justify-between items-center">
                  <span>損益計算項目 (P/L Summary)</span>
                  <span className="text-[10px] text-slate-500 font-mono">Normalized</span>
                </h5>
                <div className="divide-y divide-slate-800/60 text-xs py-1">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-300 font-semibold">売上高 (Net Sales)</span>
                    <span className="font-mono text-slate-100">{formatNumber(plResult.net_sales)}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">売上原価 (Cost of Sales)</span>
                    <span className="font-mono text-rose-400">-{formatNumber(plResult.cost_of_sales)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 bg-slate-900/20 px-1 font-semibold">
                    <span className="text-indigo-300">売上総利益 (Gross Profit)</span>
                    <span className="font-mono text-indigo-300">{formatNumber(plResult.gross_profit)}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">販売費及び一般管理費 (SG&A)</span>
                    <span className="font-mono text-rose-400">-{formatNumber(plResult.sga_expenses)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 bg-slate-900/20 px-1 font-semibold">
                    <span className="text-emerald-400">営業利益 (Operating Income)</span>
                    <span className="font-mono text-emerald-400">{formatNumber(plResult.operating_income)}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-400 pl-2">経常利益 (Ordinary Income)</span>
                    <span className="font-mono text-slate-200">{formatNumber(plResult.ordinary_income)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 bg-emerald-950/20 px-1 font-bold">
                    <span className="text-emerald-300">当期純利益 (Net Income)</span>
                    <span className="font-mono text-emerald-300">{formatNumber(plResult.net_income)}</span>
                  </div>
                </div>
              </div>

              {/* Profitability indicators */}
              <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-4 grid grid-cols-2 gap-3">
                <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-lg text-center">
                  <span className="text-[10px] text-slate-500 block">売上総利益率</span>
                  <span className="text-base font-bold font-mono text-indigo-400 block mt-1">{((plResult.gross_profit / plResult.net_sales) * 100).toFixed(1)}%</span>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-lg text-center">
                  <span className="text-[10px] text-slate-500 block">営業利益率</span>
                  <span className="text-base font-bold font-mono text-emerald-400 block mt-1">{((plResult.operating_income / plResult.net_sales) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State when no result is loaded */}
        {!stockResult && activeMode === "stock" && (
          <div className="py-16 text-center text-slate-600 text-xs flex flex-col items-center gap-2 border border-dashed border-slate-800 rounded-xl">
            <Activity className="w-8 h-8 opacity-30" />
            <p>時系列データを貼り付けて解析してください。右上の「サンプル入力」でデモを実行できます。</p>
          </div>
        )}
        {!bsResult && activeMode === "bs" && (
          <div className="py-16 text-center text-slate-600 text-xs flex flex-col items-center gap-2 border border-dashed border-slate-800 rounded-xl">
            <PieChart className="w-8 h-8 opacity-30" />
            <p>B/Sデータを貼り付けて解析してください。右上の「サンプル入力」でデモを実行できます。</p>
          </div>
        )}
        {!plResult && activeMode === "pl" && (
          <div className="py-16 text-center text-slate-600 text-xs flex flex-col items-center gap-2 border border-dashed border-slate-800 rounded-xl">
            <BarChart3 className="w-8 h-8 opacity-30" />
            <p>P/Lデータを貼り付けて解析してください。右上の「サンプル入力」でデモを実行できます。</p>
          </div>
        )}
      </div>
    </div>
  );
}
