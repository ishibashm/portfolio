"use client";

import React, { useState, useRef, useEffect } from "react";
import { useOmniStore } from "../../store/omniStore";

export default function OmniPipelineWidget() {
  const [isProcessing, setIsProcessing] = useState(false);

  // Step 1: Collection
  const [url, setUrl] = useState("https://x.com/home");
  // 収集モードは 92 行で "x_post" を直接渡している。state は読み出しが
  // 無くなった残りなので置かない。
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [logs, setLogs] = useState<
    { id: string; type: string; message: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 & 3: Analysis & Keywords
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  // Step 4: Finance Identification (Not used directly anymore, replaced by Watchlist)
  // const [identifiedAsset, setIdentifiedAsset] = useState<any>(null);

  const globalWatchlist = useOmniStore((state) => state.globalWatchlist);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ログが追加されたら一番下までスクロール。
    // scrollIntoView はスクロール可能な祖先を辿ってページ全体まで動かしてしまうため、
    // ログ欄（logsEndRef の親）だけを直接スクロールさせる。
    const container = logsEndRef.current?.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  const addLog = (type: string, message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(), type, message },
    ]);
  };

  const toggleKeyword = (kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  // ==============================
  // Step 1 Actions
  // ==============================
  const handleLaunchBrowser = async () => {
    if (!url) return;
    setIsProcessing(true);
    addLog("info", `ブラウザを起動しています...`);
    try {
      const res = await fetch("/api/v1/scraper/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("ブラウザの起動に失敗しました");
      setIsBrowserOpen(true);
      addLog(
        "completed",
        "ブラウザ起動完了。収集準備が整ったら次へ進んでください。",
      );
    } catch (err: any) {
      addLog("error", err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartScraping = async () => {
    setIsProcessing(true);
    addLog("info", "データ収集を開始します...");

    try {
      // 1. スクレイピングAPIを呼び出し (SSEストリーム)
      // Proxyのバッファリングやタイムアウトを避けるため直接バックエンドに投げる
      const response = await fetch("/api/v1/scraper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "x_post", max_scrolls: 10 }),
      });

      if (!response.body) throw new Error("レスポンスボディがありません");

      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = value.split("\n");
        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.substring(6).trim();
            if (data && currentEvent) {
              addLog(currentEvent, data);
            }
          }
        }
      }

      // 2. 収集完了後、対象のユーザー名をURLから抽出
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      // /home の場合は、収集されたファイル名が不定になるため、
      // ユーザーページ(例: https://x.com/nikkei)から実行している前提とする
      const authorHandle =
        parts.length > 0 && parts[0] !== "home" ? parts[0] : "nikkei";
      const targetJsonl = `x_downloads/x_${authorHandle}_data.jsonl`;

      addLog("info", `${targetJsonl} を読み込んで解析フェーズへ移行します...`);

      // 3. 保存されたファイルをバックエンドから読み込む
      const fileRes = await fetch("/api/v1/files/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filepath: targetJsonl }),
      });

      if (!fileRes.ok) {
        const errData = await fileRes.json().catch(() => ({}));
        throw new Error(
          `収集データの読み込みに失敗しました (${targetJsonl} が見つかりません。別のURLをお試しください)。詳細: ${errData.detail || fileRes.statusText}`,
        );
      }

      const fileData = await fileRes.json();

      // 4. アナライザーへ投げる
      addLog("thinking", "抽出したデータをAIで解析中...");

      const analyzeRes = await fetch("/api/v1/analyzer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: targetJsonl,
          content: fileData.content,
        }),
      });

      if (!analyzeRes.ok) throw new Error("AI分析に失敗しました");

      const parsed = await analyzeRes.json();
      setAnalysisResult(parsed);

      // 5. 完了してプレビュー表示へ
      addLog("completed", "全パイプライン処理が完了しました。");
    } catch (err: any) {
      console.error("Pipeline Error:", err);
      addLog("error", err.message);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    setIsProcessing(true);
    setError(null);
    addLog("info", `ファイル ${file.name} を読み込んでいます...`);

    try {
      const text = await file.text();
      // Next.jsプロキシのタイムアウト回避のため、直接FastAPIエンドポイントにアクセス
      const res = await fetch("/api/v1/analyzer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content: text }),
      });

      if (!res.ok) throw new Error("AI分析に失敗しました");

      const parsed = await res.json();
      setAnalysisResult(parsed);
      addLog("completed", "ファイルの解析が完了しました。");
    } catch (err: any) {
      setError(err.message);
      addLog("error", err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==============================
  // Watchlist integration Actions
  // ==============================
  const copyRelevantPostsToClipboard = () => {
    if (!analysisResult?.posts) return;
    const cleanKeywords = selectedKeywords.map((k) =>
      k.replace(/^[名動形]:\s*/, ""),
    );
    const relevantPosts = analysisResult.posts
      .filter(
        (p: any) => p.text && cleanKeywords.some((kw) => p.text.includes(kw)),
      )
      .map(
        (p: any) =>
          `[@${p.author_handle || "unknown"} - ${p.created_at || p.timestamp || ""}]\n${p.text}`,
      );

    if (relevantPosts.length > 0) {
      const textToCopy = relevantPosts.join("\n\n-------------------\n\n");
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          alert(
            `${relevantPosts.length} 件のポストをクリップボードにコピーしました。`,
          );
        })
        .catch((err) => {
          console.error("Failed to copy:", err);
          alert("コピーに失敗しました。");
        });
    }
  };

  const downloadRelevantPosts = () => {
    if (!analysisResult?.posts) return;
    const cleanKeywords = selectedKeywords.map((k) =>
      k.replace(/^[名動形]:\s*/, ""),
    );
    const relevantPosts = analysisResult.posts
      .filter(
        (p: any) => p.text && cleanKeywords.some((kw) => p.text.includes(kw)),
      )
      .map(
        (p: any) =>
          `[@${p.author_handle || "unknown"} - ${p.created_at || p.timestamp || ""}]\n${p.text}`,
      );

    if (relevantPosts.length > 0) {
      const textToSave = relevantPosts.join("\n\n-------------------\n\n");
      const blob = new Blob([textToSave], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relevant_posts_${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleExportWatchlist = () => {
    if (globalWatchlist.length === 0) return;
    const content = globalWatchlist.join(",\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tradingview_watchlist.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-xl border border-rose-100/80 rounded-3xl overflow-hidden shadow-xl shadow-rose-100/30 text-stone-800 relative">
      {/* Header */}
      <div className="px-6 py-4 bg-white/90 border-b border-rose-100 flex justify-between items-center z-10 relative">
        <h2 className="text-base font-bold flex items-center gap-2 text-stone-900 tracking-tight font-serif">
          <span className="text-rose-500 text-xl">⚡</span> Omni-Research Pipeline
        </h2>
        {isProcessing && (
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-500 animate-pulse">
            <span>⚙️ 処理実行中...</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative p-6 space-y-8">
        {/* Section 1: Data Source & Scraping Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-end border-b border-rose-100/60 pb-2">
            <h3 className="text-base font-bold text-stone-900 font-serif">
              1. データ収集 (Data Collection)
            </h3>
            <p className="text-xs text-stone-500">
              Xタイムラインの取得 または JSONLの手動アップロード
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Option A: Scraper */}
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">📸</span>
                <h4 className="font-bold text-slate-300">Media Scraper</h4>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-slate-500">
                  ターゲットURL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-300"
                />
              </div>

              <div className="flex flex-col gap-2 mt-auto pt-4">
                <button
                  onClick={handleLaunchBrowser}
                  disabled={isProcessing || isBrowserOpen}
                  className="w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
                >
                  1. ブラウザ起動
                </button>
                <button
                  onClick={handleStartScraping}
                  disabled={isProcessing || !isBrowserOpen}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                >
                  2. 抽出パイプライン実行
                </button>
              </div>
            </div>

            {/* Option B: Upload & Logs */}
            <div className="flex flex-col gap-4">
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-5 flex flex-col items-center justify-center gap-3">
                <span className="text-2xl text-slate-500">📥</span>
                <h4 className="font-bold text-slate-300 text-sm">
                  既存JSONLアップロード
                </h4>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2 px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-all border border-slate-600 hover:border-slate-400"
                >
                  ファイルを選択して直接解析
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".jsonl,.json,.txt"
                />
                {error && (
                  <div className="text-xs text-red-400 text-center">
                    {error}
                  </div>
                )}
              </div>

              {/* Execution Logs */}
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[10px] text-slate-400 h-40 flex flex-col relative">
                <div className="text-slate-500 mb-2 pb-1 border-b border-slate-800 flex justify-between shrink-0">
                  <span>実行ログ (Logs)</span>
                  {isProcessing && (
                    <span className="text-indigo-400 animate-pulse">
                      Running...
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1 pb-2">
                  {logs.length === 0 ? (
                    <span className="opacity-50 italic">実行待機中...</span>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-1 rounded ${
                          log.type === "error"
                            ? "text-red-400 bg-red-950/20"
                            : log.type === "completed"
                              ? "text-emerald-400 bg-emerald-950/20"
                              : log.type === "thinking"
                                ? "text-blue-400 animate-pulse"
                                : "text-slate-300"
                        }`}
                      >
                        <span className="opacity-50 mr-2">
                          [{new Date().toLocaleTimeString()}]
                        </span>
                        {log.type === "error"
                          ? "❌ "
                          : log.type === "completed"
                            ? "✅ "
                            : log.type === "thinking"
                              ? "🧠 "
                              : "⚡ "}
                        {log.message}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Analysis & Keywords */}
        {analysisResult && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end border-b border-slate-700/50 pb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-200">
                  2. 分析結果＆キーワード (Analysis & Extraction)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {analysisResult.summary}
                </p>
              </div>
            </div>

            {/* Keywords Cloud */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
              <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest">
                頻出キーワード (クリックで選択)
              </h4>
              <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                {analysisResult.keywords.map((kw: string, i: number) => (
                  <span
                    key={i}
                    onClick={() => toggleKeyword(kw)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer select-none ${
                      selectedKeywords.includes(kw)
                        ? "bg-orange-500 text-white border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-105"
                        : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-indigo-900/50 hover:border-indigo-500/50"
                    }`}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Post Preview & Action */}
            {selectedKeywords.length > 0 && (
              <div className="border-2 border-orange-500/30 bg-orange-950/10 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                <h4 className="text-sm font-bold text-orange-400 flex items-center gap-2 mb-4">
                  <span className="text-xl">🔎</span>{" "}
                  選択されたキーワードを含むポスト
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 mb-6">
                  {analysisResult.posts
                    .filter(
                      (p: any) =>
                        p.text &&
                        selectedKeywords.some((kw) =>
                          p.text.includes(kw.replace(/^[名動形]:\s*/, "")),
                        ),
                    )
                    .map((p: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-900/80 border border-slate-700/50 p-4 rounded-lg flex flex-col gap-2"
                      >
                        <div className="text-xs text-slate-500 flex justify-between items-center">
                          <span className="font-mono text-indigo-400">
                            @{p.author_handle || "unknown"}
                          </span>
                          <span>{p.created_at || p.timestamp || ""}</span>
                        </div>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {p.text}
                        </div>
                        {p.media_paths && p.media_paths.length > 0 && (
                          <div className="flex gap-2 mt-2 overflow-x-auto pb-1 custom-scrollbar">
                            {p.media_paths.map((mp: string, midx: number) => (
                              <div
                                key={midx}
                                className="h-16 bg-slate-800 rounded px-3 py-1 text-[10px] flex flex-col justify-center text-slate-500 font-mono border border-slate-700 whitespace-nowrap"
                              >
                                <span>📎 添付画像</span>
                                <span className="text-indigo-400 truncate max-w-[150px]">
                                  {mp.split("/").pop() || mp}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-orange-900/30">
                  <div className="text-xs text-slate-400 font-mono">
                    {selectedKeywords.length} 個のキーワードを選択中
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={copyRelevantPostsToClipboard}
                      className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 transition-all"
                    >
                      <span>📋</span>
                      テキストをコピー
                    </button>
                    <button
                      onClick={downloadRelevantPosts}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-lg flex items-center gap-2 transition-all"
                    >
                      <span>📥</span>
                      テキストとして保存
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 3: Global Watchlist Display Area */}
        {globalWatchlist.length > 0 && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-end border-b border-emerald-900/50 pb-2">
              <div>
                <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <span>📋</span> 3. Global Watchlist
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  特定された銘柄一覧（TradingViewウィジェットと自動同期されます）
                </p>
              </div>
              <button
                onClick={handleExportWatchlist}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition-colors flex items-center gap-1 border border-slate-600"
                title="TradingViewのリストインポート機能で読み込める形式(.txt)でダウンロード"
              >
                <span>💾</span> Export to TradingView
              </button>
            </div>

            <div className="flex flex-wrap gap-2 p-4 bg-emerald-950/10 rounded-xl border border-emerald-900/30">
              {globalWatchlist.map((ticker, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-emerald-900/30 text-emerald-300 text-sm font-mono rounded border border-emerald-700/50 shadow-sm"
                >
                  {ticker}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
