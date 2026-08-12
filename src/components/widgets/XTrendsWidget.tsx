"use client";

import { useState } from "react";
import { toLogMessage } from "@/lib/errorMessage";

export default function XTrendsWidget() {
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(1);
  const [result, setResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setIsProcessing(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/v1/xtrends/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query || undefined, days }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "通信エラーが発生しました");
      }

      const data = await response.json();
      setResult(data.result);
    } catch (err) {
      setError(toLogMessage(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <h2 className="font-semibold flex items-center gap-2 text-white">
          <span className="text-blue-400">𝕏</span> X Trends Researcher
        </h2>
        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/30">
          Powered by Grok
        </span>
      </div>

      <div className="p-4 flex flex-col gap-4 border-b border-slate-700 bg-slate-800/30">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400">
            検索対象期間 (過去 N 日間)
          </label>
          <input
            type="number"
            min="1"
            max="7"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 w-32"
            disabled={isProcessing}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400">
            カスタムクエリ (空欄でデフォルトの網羅的トレンド取得)
          </label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: 暗号資産の最新のエアドロップ情報をまとめて"
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 min-h-[60px] resize-none"
            disabled={isProcessing}
          />
        </div>

        <button
          onClick={handleSearch}
          disabled={isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-md transition-colors text-sm flex justify-center items-center gap-2"
        >
          {isProcessing ? (
            <>⏳ 検索中 (時間がかかる場合があります)...</>
          ) : (
            <>🔍 トレンドレポートを生成</>
          )}
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-sm">
        {error && (
          <div className="p-3 bg-red-950/50 border border-red-900 rounded text-red-400">
            {error}
          </div>
        )}
        {!result && !error && !isProcessing && (
          <div className="h-full flex items-center justify-center text-slate-500 italic text-center px-4">
            「トレンドレポートを生成」ボタンを押すと、X (Twitter)
            から情報を収集し、詳細なレポートを作成します。
          </div>
        )}
        {result && (
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="whitespace-pre-wrap leading-relaxed">{result}</div>
          </div>
        )}
      </div>
    </div>
  );
}
