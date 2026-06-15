"use client";

import React, { useEffect, useRef, memo, useId, useState } from "react";
import { useOmniStore } from "../../store/omniStore";

interface Props {
  symbol?: string;
  name?: string;
  reason?: string;
}

function TradingViewWidget({ symbol = "NASDAQ:AAPL", name, reason }: Props) {
  const reactId = useId();
  const containerId = `tv_widget_${reactId.replace(/:/g, "")}`;
  
  // 初期シンボルの決定
  const initialSafeSymbol =
    symbol && symbol !== "UNKNOWN" && symbol.trim() !== ""
      ? symbol
      : "NASDAQ:AAPL";

  const [currentSymbol, setCurrentSymbol] = useState(initialSafeSymbol);
  const [inputSymbol, setInputSymbol] = useState(initialSafeSymbol);
  const [isExporting, setIsExporting] = useState(false);
  const [dcfData, setDcfData] = useState<any>(null);
  const [financialSummary, setFinancialSummary] = useState<any>(null);
  const [isLoadingDcf, setIsLoadingDcf] = useState(false);

  // 親コンポーネントからのprops変更に同期
  useEffect(() => {
    const updatedSafeSymbol =
      symbol && symbol !== "UNKNOWN" && symbol.trim() !== ""
        ? symbol
        : "NASDAQ:AAPL";
    setCurrentSymbol(updatedSafeSymbol);
    setInputSymbol(updatedSafeSymbol);
  }, [symbol]);

  // 無効なシンボルを弾くフォールバック
  const safeSymbol =
    currentSymbol && currentSymbol !== "UNKNOWN" && currentSymbol.trim() !== ""
      ? currentSymbol
      : "NASDAQ:AAPL";

  // グローバルウォッチリストを取得
  const globalWatchlist = useOmniStore((state) => state.globalWatchlist);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/v1/export/tradingview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: currentSymbol }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "エクスポートに失敗しました");
      }

      const jsonlText = await res.text();

      // Blobを作成してダウンロードリンクを生成
      const blob = new Blob([jsonlText], { type: "application/jsonl" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeSymbol.replace(":", "_")}_analysis.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`MCPエクスポートエラー: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 一旦中身をクリアして再レンダリング可能にする（ウォッチリストの更新を反映させるため）
    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (document.getElementById(containerId) && "TradingView" in window) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: safeSymbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          backgroundColor: "rgba(15, 23, 42, 1)",
          gridColor: "rgba(30, 41, 59, 1)",
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          hide_legend: false,
          save_image: false,
          details: true,
          hotlist: true,
          calendar: true,
          watchlist:
            globalWatchlist.length > 0
              ? globalWatchlist
              : [
                  "NASDAQ:AAPL",
                  "NASDAQ:TSLA",
                  "NASDAQ:NVDA",
                  "NASDAQ:MSFT",
                  "NASDAQ:AMZN",
                  "CRYPTO:BTCUSD",
                  "CRYPTO:ETHUSD",
                ],
          studies: [
            "Volume@tv-basicstudies",
            "MASimple@tv-basicstudies",
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
          ],
          container_id: containerId,
        });
      }
    };
    document.body.appendChild(script);

    // cleanup
    return () => {
      if (container) container.innerHTML = "";
    };
  }, [currentSymbol, containerId, globalWatchlist]);

  useEffect(() => {
    // 決算資料（DCF）の取得
    if (!currentSymbol || currentSymbol === "UNKNOWN") return;

    const fetchDcf = async () => {
      setIsLoadingDcf(true);
      try {
        const res = await fetch("/api/v1/finance/dcf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: currentSymbol,
            discount_rate: 0.08,
            terminal_growth_rate: 0.025,
          }),
        });
        if (res.ok) {
          setDcfData(await res.json());
        }
      } catch (err) {
        console.error("DCF Fetch Error", err);
      } finally {
        setIsLoadingDcf(false);
      }
    };

    const fetchFinancials = async () => {
      try {
        const queryName = name ? `?name=${encodeURIComponent(name)}` : "";
        const res = await fetch(
          `/api/v1/finance/summary/${currentSymbol}${queryName}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (!data.error) {
            setFinancialSummary(data);
          }
        }
      } catch (err) {
        console.error("Financial Fetch Error", err);
      }
    };

    fetchDcf();
    fetchFinancials();
  }, [currentSymbol, name]);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
        <h2 className="font-semibold flex items-center gap-2 text-white">
          <span className="text-emerald-400">📈</span>
          {name && safeSymbol !== "NASDAQ:AAPL"
            ? `${name} (${safeSymbol})`
            : `TradingView Advanced Chart (${safeSymbol})`}
        </h2>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded disabled:opacity-50 transition-colors flex items-center gap-1"
          title="MCPを使ってこのチャートの分析データをData Analyzer用のJSONLとしてエクスポートします"
        >
          {isExporting ? "MCP抽出中..." : "📥 Data Analyzer用に出力"}
        </button>
      </div>

      {reason && (
        <div className="bg-slate-800/60 p-3 text-sm text-slate-300 border-b border-slate-700">
          <strong className="text-emerald-400 text-xs uppercase tracking-wider">
            AI Identification Reason:
          </strong>
          <p className="mt-1">{reason}</p>
        </div>
      )}

      {/* 企業情報を目立つように表示するヘッダー */}
      <div className="bg-slate-800/80 p-4 border-b border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">🏢</span>
            <h3 className="text-2xl font-bold text-white">{name || currentSymbol}</h3>
          </div>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            Symbol:{" "}
            <span className="font-mono bg-slate-700/50 px-2 py-0.5 rounded text-emerald-400 border border-slate-600/50">
              {safeSymbol}
            </span>
          </p>
        </div>

        {/* DCF等の追加情報があればここに表示 */}
        <div className="flex flex-col sm:flex-row gap-3">
          {financialSummary && (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 min-w-[250px]">
              <p className="text-xs text-slate-400 mb-1 border-b border-slate-700/50 pb-1">
                企業業績 (FY: {financialSummary.fiscal_year || "-"})
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                <span className="text-slate-400">売上高:</span>
                <span className="text-white text-right">
                  {financialSummary.net_sales?.toLocaleString() || "-"}
                </span>
                <span className="text-slate-400">営業利益:</span>
                <span className="text-white text-right">
                  {financialSummary.operating_income?.toLocaleString() || "-"}
                </span>
                <span className="text-slate-400">経常利益:</span>
                <span className="text-white text-right">
                  {financialSummary.ordinary_income?.toLocaleString() || "-"}
                </span>
              </div>
            </div>
          )}
          {dcfData && (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 min-w-[200px]">
              <p className="text-xs text-slate-400 mb-1 border-b border-slate-700/50 pb-1">
                DCF Implied Value
              </p>
              <div className="flex items-end gap-2 mt-2">
                <span className="text-xl font-bold text-indigo-400">
                  ${dcfData.implied_share_price?.toFixed(2)}
                </span>
                <span className="text-xs text-emerald-500 mb-1">
                  Margin: {(dcfData.margin_of_safety * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 w-full relative min-h-[400px] h-full"
        id={containerId}
      ></div>

      {/* 企業業績＆チャート確認ツール (Tkinter参考) */}
      <div className="bg-slate-800/40 p-4 border-t border-slate-700/50 shrink-0 font-sans text-xs">
        <div className="max-w-xl mx-auto space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-sm">📈</span>
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-widest">
              企業業績＆チャート確認ターミナル
            </h4>
          </div>
          <p className="text-[11px] text-slate-400">
            確認したい企業のティッカー（例: <span className="font-mono text-emerald-400">TSE:6838</span>, <span className="font-mono text-emerald-400">285A</span>, <span className="font-mono text-emerald-400">NASDAQ:TSLA</span>）を入力してください：
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={inputSymbol}
              onChange={(e) => setInputSymbol(e.target.value)}
              placeholder="例: TSE:6838"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (inputSymbol.trim()) {
                    setCurrentSymbol(inputSymbol.trim());
                  } else {
                    alert("警告: ティッカーシンボルや企業名を入力してください");
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center min-w-[110px]"
              >
                ウィジェットで描画
              </button>
              <button
                type="button"
                onClick={() => {
                  if (inputSymbol.trim()) {
                    const url = `https://jp.tradingview.com/chart/?symbol=${encodeURIComponent(inputSymbol.trim())}`;
                    window.open(url, "_blank");
                  } else {
                    alert("警告: ティッカーシンボルや企業名を入力してください");
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center min-w-[110px]"
              >
                外部ブラウザで開く
              </button>
            </div>
          </div>
          {/* クイックプリセット */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>クイック選択:</span>
            {["TSE:6838", "285A", "NASDAQ:AAPL", "NASDAQ:TSLA"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setInputSymbol(preset);
                  setCurrentSymbol(preset);
                }}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 font-mono transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
