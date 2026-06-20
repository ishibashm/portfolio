"use client";

import { useState, useRef } from "react";
import { useOmniStore } from "../../store/omniStore";

export default function DataAnalyzerWidget() {
  const [content, setContent] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setFilename(file.name);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      setContent(text);

      if (file.name.endsWith(".md")) {
        // MDはプレビューのみ
        setResult({
          category: "markdown",
          summary: "Markdownファイルがプレビューされました。",
        });
      } else if (file.name.endsWith(".jsonl") || file.name.endsWith(".json")) {
        // お客様ご自身で分割済みのファイル（または小・中規模のファイル）を想定し、
        // 行数制限（フィルター）をかけずに全データを送信します
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const lightweightData = lines.join("\n");
        analyzeData(file.name, lightweightData);
      } else {
        setResult({
          category: "unknown",
          summary:
            "サポートされていない形式のファイルですが、テキストとして表示しています。",
        });
      }
    } catch (err: any) {
      setError(`ファイルの読み込みエラー: ${err.message}`);
    }
  };

  const analyzeData = async (name: string, data: string) => {
    setIsProcessing(true);
    setSelectedKeywords([]);
    try {
      // Next.jsプロキシのタイムアウト回避のため、直接FastAPIエンドポイントにアクセス
      const res = await fetch("/api/v1/analyzer/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name, content: data }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg =
          errorData.detail ||
          errorData.message ||
          errorData.error ||
          `AI分析に失敗しました (Status: ${res.status})`;
        throw new Error(errorMsg);
      }

      const parsed = await res.json();
      setResult(parsed);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyRelevantPostsToClipboard = () => {
    if (!result?.posts) return;
    const cleanKeywords = selectedKeywords.map((k) =>
      k.replace(/^[名動形]:\s*/, ""),
    );
    const relevantPosts = result.posts
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
    if (!result?.posts) return;
    const cleanKeywords = selectedKeywords.map((k) =>
      k.replace(/^[名動形]:\s*/, ""),
    );
    const relevantPosts = result.posts
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



  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex justify-between items-center">
        <h2 className="font-semibold flex items-center gap-2 text-white">
          <span className="text-purple-400">🧠</span> Data Analyzer
        </h2>
        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded border border-purple-500/30">
          MD / JSONL Dropzone
        </span>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Drop Zone */}
        {!result && !isProcessing ? (
          <div
            className={`flex-1 m-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-10 text-center transition-all ${
              isDragging
                ? "border-purple-400 bg-purple-900/20 text-purple-300"
                : "border-slate-600 bg-slate-800/30 text-slate-400"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span className="text-6xl mb-4">📥</span>
            <p className="font-semibold text-lg mb-2">
              ファイルをここにドロップして解析
            </p>
            <p className="text-sm opacity-70 mb-6">
              .md プレビュー / .jsonl AI解析
            </p>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              ファイルを選択
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".md,.jsonl,.json,.txt"
            />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* コンパクトなトップドロップゾーン */}
            <div
              className={`w-full border-b border-slate-700 p-3 flex items-center gap-4 transition-colors ${
                isDragging
                  ? "bg-purple-900/20 border-purple-500"
                  : "bg-slate-800/50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium py-1.5 px-3 rounded whitespace-nowrap"
                >
                  📥 別のファイルを選択
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".md,.jsonl,.json,.txt"
                />

                {filename && (
                  <div className="bg-slate-900 px-3 py-1 rounded border border-slate-700 text-xs flex-1 truncate flex items-center gap-2">
                    <span className="text-slate-500 shrink-0">Current:</span>
                    <span className="font-mono text-purple-300 truncate">
                      {filename}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Result (全幅) */}
            <div className="flex-1 w-full bg-slate-950 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {error && (
                <div className="p-3 bg-red-950/50 border border-red-900 rounded text-red-400 text-sm">
                  {error}
                </div>
              )}

              {isProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center text-purple-400 gap-4 animate-pulse py-20">
                  <span className="text-4xl">🔮</span>
                  <p className="text-sm">
                    AI エージェントがデータを分類・解析しています...
                  </p>
                </div>
              ) : (
                result && (
                  <>
                    {/* Category Badge & Summary */}
                    <div className="flex flex-col gap-3 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 text-xs font-bold rounded uppercase tracking-wider ${
                            result.category === "finance"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : result.category === "vision"
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : result.category === "markdown"
                                  ? "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {result.category === "finance"
                            ? "📈 金融クオンツ解析"
                            : result.category === "vision"
                              ? "🎨 コンピュータビジョン解析"
                              : result.category === "markdown"
                                ? "📄 Markdown プレビュー"
                                : "📋 一般データ要約"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {result.summary}
                      </p>

                      {/* 抽出されたキーワードタグの表示 */}
                      {result.keywords && result.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 max-h-64 overflow-y-auto custom-scrollbar p-2 bg-slate-900/50 rounded-lg border border-slate-800">
                          {result.keywords.map((kw: string, i: number) => {
                            const isSelected = selectedKeywords.includes(kw);
                            return (
                              <span
                                key={i}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedKeywords((prev) =>
                                      prev.filter((k) => k !== kw),
                                    );
                                  } else {
                                    setSelectedKeywords((prev) => [
                                      ...prev,
                                      kw,
                                    ]);
                                  }
                                }}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer select-none ${
                                  isSelected
                                    ? "bg-orange-500 text-white border-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                                    : "bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/30"
                                }`}
                              >
                                {kw.replace(/^#/, "")}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 選択されたキーワードの関連ポストプレビュー */}
                    {selectedKeywords.length > 0 && result.posts && (
                      <div className="border border-orange-900/30 bg-orange-950/10 rounded-xl p-4 shadow-inner mb-6">
                        <h3 className="text-sm font-bold text-orange-400 flex items-center gap-2 mb-3">
                          <span className="text-lg">🔍</span>{" "}
                          選択したキーワード（{selectedKeywords.length}
                          個）を含む元のポスト
                        </h3>
                        <div className="grid gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                          {result.posts
                            .filter(
                              (p: any) =>
                                p.text &&
                                selectedKeywords.some((kw) =>
                                  p.text.includes(
                                    kw.replace(/^[名動形]:\s*/, ""),
                                  ),
                                ),
                            )
                            .map((p: any, idx: number) => (
                              <div
                                key={idx}
                                className="bg-slate-900/80 border border-slate-700/50 p-4 rounded-lg flex flex-col gap-2"
                              >
                                <div className="text-xs text-slate-400 flex justify-between items-center">
                                  <span className="font-mono text-indigo-400">
                                    @{p.author_handle || "unknown"}
                                  </span>
                                  <span>
                                    {p.created_at || p.timestamp || ""}
                                  </span>
                                </div>
                                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                                  {p.text}
                                </div>
                                {p.media_paths && p.media_paths.length > 0 && (
                                  <div className="flex gap-2 mt-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {p.media_paths.map(
                                      (mp: string, midx: number) => (
                                        <div
                                          key={midx}
                                          className="h-16 bg-slate-800 rounded px-3 py-1 text-[10px] flex flex-col justify-center text-slate-400 font-mono border border-slate-700 whitespace-nowrap"
                                        >
                                          <span className="text-slate-500">
                                            📎 添付画像
                                          </span>
                                          <span className="text-indigo-300 truncate max-w-[150px]">
                                            {mp.split("/").pop() || mp}
                                          </span>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          {result.posts.filter(
                            (p: any) =>
                              p.text &&
                              selectedKeywords.some((kw) =>
                                p.text.includes(
                                  kw.replace(/^[名動形]:\s*/, ""),
                                ),
                              ),
                          ).length === 0 && (
                            <div className="text-sm text-slate-500 p-4 text-center">
                              ポストが見つかりませんでした。
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-orange-900/20 flex flex-wrap justify-end gap-3">
                          <button
                            onClick={copyRelevantPostsToClipboard}
                            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2.5 px-5 rounded-lg shadow-lg flex items-center gap-2 transition-all"
                          >
                            <span>📋</span>
                            テキストをコピー
                          </button>
                          <button
                            onClick={downloadRelevantPosts}
                            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-2.5 px-5 rounded-lg shadow-lg flex items-center gap-2 transition-all"
                          >
                            <span>📥</span>
                            テキストとして保存
                          </button>
                        </div>
                      </div>
                    )}


                    {result.category === "vision" &&
                      result.items &&
                      result.items.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            抽出された画像パス (プレビュー)
                          </h3>
                          <div className="grid grid-cols-2 gap-2">
                            {result.items.map((path: string, i: number) => (
                              <div
                                key={i}
                                className="text-[10px] font-mono bg-slate-900 p-2 border border-slate-800 rounded text-slate-400 truncate"
                              >
                                {path}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {result.category === "markdown" && (
                      <div className="font-mono text-xs text-slate-300">
                        <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                          {content}
                        </pre>
                      </div>
                    )}

                    {/* Raw JSONL Preview for other/general */}
                    {result.category === "general" && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                          Raw Text Preview
                        </h3>
                        <div className="font-mono text-[10px] text-slate-500 bg-slate-900 p-3 rounded overflow-hidden max-h-[300px]">
                          <pre className="whitespace-pre-wrap break-words">
                            {content.substring(0, 1000)}...
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
