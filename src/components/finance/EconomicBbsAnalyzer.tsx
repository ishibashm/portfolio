"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Activity,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Loader2,
  Sparkles,
  RefreshCw,
} from "lucide-react";

interface BbsAnalysisResult {
  sentimentScore: number;
  bullishPercent: number;
  bearishPercent: number;
  topics: string[];
  summary: string;
}

export function EconomicBbsAnalyzer({ ticker = "7203.T" }: { ticker?: string }) {
  const [commentsInput, setCommentsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BbsAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate Yahoo Finance BBS URL correctly
  const bbsUrl = `https://finance.yahoo.co.jp/quote/${ticker}/forum`;

  const handleAnalyze = async () => {
    if (!commentsInput.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/bbs-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: commentsInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze sentiment.");
      }

      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 40) return "text-emerald-400";
    if (score >= 10) return "text-emerald-300";
    if (score <= -40) return "text-rose-500";
    if (score <= -10) return "text-rose-300";
    return "text-amber-400";
  };

  return (
    <div className="flex flex-col w-full bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
            <span>Yahoo!ファイナンス掲示板 感情分析</span>
            <span className="font-mono text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md">
              {ticker}
            </span>
          </h3>
        </div>

        <a
          href={bbsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-xl transition-all"
        >
          <span>公式掲示板を開く</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        {/* Paste Comments Form */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs text-zinc-400">
            <span>掲示板の投稿コメントをコピーしてここに貼り付けてください:</span>
            <button
              type="button"
              onClick={() => setCommentsInput("")}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase font-mono"
            >
              [ Clear ]
            </button>
          </div>
          <textarea
            value={commentsInput}
            onChange={(e) => setCommentsInput(e.target.value)}
            placeholder="ここに書き込み内容を複数コピペして「感情を分析する」をクリック..."
            className="w-full h-24 p-3 bg-zinc-900 border border-zinc-700/60 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600 transition-colors resize-none leading-relaxed"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || !commentsInput.trim()}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI解析中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>感情・テーマをAI分析する</span>
              </>
            )}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Analysis Results Display */}
        {result && (
          <div className="border-t border-zinc-800/80 pt-4 space-y-4 animate-fade-in">
            {/* Score & Gauge */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                  Market Sentiment Score
                </span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className={`text-2xl font-mono font-black ${getScoreColorClass(result.sentimentScore)}`}>
                    {result.sentimentScore > 0 ? "+" : ""}
                    {result.sentimentScore}
                  </span>
                  <span className="text-[10px] text-zinc-400">/ 100</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-xl">
                {result.sentimentScore >= 10 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : result.sentimentScore <= -10 ? (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                ) : (
                  <Activity className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-xs font-bold text-zinc-200">
                  {result.sentimentScore >= 40
                    ? "強気過熱 (Very Bullish)"
                    : result.sentimentScore >= 10
                      ? "強気 (Bullish)"
                      : result.sentimentScore <= -40
                        ? "弱気過熱 (Very Bearish)"
                        : result.sentimentScore <= -10
                          ? "弱気 (Bearish)"
                          : "中立 (Neutral)"}
                </span>
              </div>
            </div>

            {/* Bullish vs Bearish Bar Chart */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-mono font-medium">
                <span className="text-emerald-400">強気 (Bullish): {result.bullishPercent}%</span>
                <span className="text-rose-400">弱気 (Bearish): {result.bearishPercent}%</span>
              </div>
              <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${result.bullishPercent}%` }}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${result.bearishPercent}%` }}
                />
              </div>
            </div>

            {/* Topics badge cloud */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono block">
                話題のキーワード / トピックス
              </span>
              <div className="flex flex-wrap gap-1.5">
                {result.topics.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 font-medium hover:border-zinc-700 transition-colors"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Summary Box */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-400 font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                AI総括・センチメント分析
              </span>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {result.summary}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
