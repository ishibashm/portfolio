"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Terminal,
  Database,
  Activity,
  Code2,
  FolderOpen,
  FileText,
  Eye,
  RefreshCw,
} from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "error" | "success" | "progress" | "done";
}

interface ExtractedFile {
  filename: string;
  author: string;
  sizeBytes: number;
  createdAt: string;
  tweetCount: number;
}

export default function DataEnginePage() {
  const [url, setUrl] = useState("Tokyo");
  const [scrolls, setScrolls] = useState(10);
  const [isExtracting, setIsExtracting] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Data Vault State
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(
    null,
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<string | null>(null);

  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch("/api/research/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (e) {
      console.error("Failed to fetch files", e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const viewFile = async (filename: string) => {
    try {
      const res = await fetch(
        `/api/research/files/content?file=${encodeURIComponent(filename)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedFileContent(data.content);
        setSelectedFileName(filename);
        setIndexStatus(null); // Clear status when switching files
      }
    } catch (e) {
      console.error("Failed to read file", e);
    }
  };

  const handleIndexToKB = async () => {
    if (!selectedFileName) return;
    setIsIndexing(true);
    setIndexStatus(null);
    addLog(`Indexing ${selectedFileName} to Knowledge Base...`, "info");
    try {
      const res = await fetch("/api/research/files/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFileName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIndexStatus(`Success: ${data.kb_id}`);
        addLog(
          `[SUCCESS] Indexed to KB with ID: ${data.kb_id} (${data.title})`,
          "success",
        );
      } else {
        const errMsg = data.error || "Failed to index";
        setIndexStatus(`Error: ${errMsg}`);
        addLog(`[ERROR] Indexing failed: ${errMsg}`, "error");
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Network error";
      setIndexStatus(`Error: ${errMsg}`);
      addLog(`[ERROR] Indexing network error: ${errMsg}`, "error");
    } finally {
      setIsIndexing(false);
    }
  };

  const addLog = (message: string, type: LogEntry["type"]) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), timestamp, message, type },
    ]);
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleExtract = () => {
    if (!url) {
      addLog("URL is required", "error");
      return;
    }

    setIsExtracting(true);
    setLogs([]);
    addLog(`Initiating Astro-Alignment Audit for: ${url}`, "info");

    const sse = new EventSource(
      `/api/research/generate-report?url=${encodeURIComponent(url)}&scrolls=${scrolls}`,
    );

    sse.addEventListener("info", (e) =>
      addLog(JSON.parse((e as MessageEvent).data).message, "info"),
    );
    sse.addEventListener("progress", (e) =>
      addLog(JSON.parse((e as MessageEvent).data).message, "progress"),
    );
    sse.addEventListener("success", (e) =>
      addLog(JSON.parse((e as MessageEvent).data).message, "success"),
    );
    sse.addEventListener("error", (e) =>
      addLog(JSON.parse((e as MessageEvent).data).message, "error"),
    );

    sse.addEventListener("done", (e) => {
      addLog(JSON.parse((e as MessageEvent).data).message, "done");
      setIsExtracting(false);
      sse.close();
      // Refresh files list after extraction completes
      fetchFiles();
    });

    sse.onerror = () => {
      addLog("Lost connection to extraction engine.", "error");
      setIsExtracting(false);
      sse.close();
      fetchFiles();
    };
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-emerald-400";
      case "error":
        return "text-rose-500";
      case "progress":
        return "text-blue-400";
      case "done":
        return "text-purple-400";
      default:
        return "text-emerald-500";
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-emerald-600/5 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-600/5 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />

      {/* Navigation */}
      <nav className="w-full px-6 py-6 border-b border-white/5 relative z-10 flex items-center justify-between bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Oracle Hub
          </Link>
          <div className="h-4 w-px bg-zinc-800"></div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-sm tracking-widest uppercase text-emerald-50">
              Data Engine
            </span>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div
            className={`w-2 h-2 rounded-full ${isExtracting ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`}
          ></div>
          <span className="text-[10px] font-mono tracking-widest text-emerald-300 uppercase">
            {isExtracting ? "データ抽出中..." : "システム待機中"}
          </span>
        </div>
      </nav>

      <main className="flex-1 w-full mx-auto px-6 py-8 relative z-10 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)] custom-scrollbar">
        {/* Top Row: Extractor and Terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[400px] shrink-0">
          {/* Left Column: Control Panel */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-5 h-full">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white/90">
                    Xデータ抽出エンジン
                  </h2>
                  <p className="text-xs text-zinc-500">
                    感情分析用のRaw JSONL/MDデータを収集
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 flex-1">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                    対象URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://x.com/search?q=... (検索またはタイムラインのURL)"
                    className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono placeholder:text-zinc-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1.5 uppercase tracking-wider">
                    最大スクロール数
                  </label>
                  <input
                    type="number"
                    value={scrolls}
                    onChange={(e) => setScrolls(Number(e.target.value))}
                    min="1"
                    max="100"
                    className="w-full bg-black/50 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-mono"
                  />
                </div>

                <div className="mt-auto">
                  <button
                    onClick={handleExtract}
                    disabled={isExtracting || !url}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-3 rounded-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:shadow-none"
                  >
                    <Play className="w-4 h-4" />
                    {isExtracting ? "抽出を実行中..." : "抽出を実行"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Real-time Terminal UI */}
          <div className="lg:col-span-8 flex flex-col h-full rounded-2xl bg-black border border-emerald-900/50 shadow-[0_0_30px_rgba(16,185,129,0.1)] overflow-hidden relative">
            <div className="bg-emerald-950/20 border-b border-emerald-900/50 px-4 py-3 flex justify-between items-center z-10 relative backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
                  抽出コンソール // ライブストリーム
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${isExtracting ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`}
                  ></div>
                  <span className="text-[9px] font-mono text-zinc-500 tracking-wider">
                    WEBSOCKET
                  </span>
                </div>
              </div>
            </div>

            <div
              ref={terminalRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed relative flex flex-col gap-1.5 bg-[#0a0f0d] scroll-smooth"
            >
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-emerald-500">
                  <Activity className="w-10 h-10 mb-2" />
                  <p className="tracking-widest uppercase">
                    コマンドの実行を待機中...
                  </p>
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-3 animate-fade-in hover:bg-white/5 px-2 py-0.5 rounded transition-colors break-all"
                  >
                    <span className="text-emerald-900 select-none shrink-0">
                      [{log.timestamp}]
                    </span>
                    <span className={`${getLogColor(log.type)}`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-20 opacity-20"></div>
          </div>
        </div>

        {/* Bottom Row: Local Data Vault */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col shrink-0 min-h-[500px]">
          <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <FolderOpen className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white/90">
                  アライメント監査レポート金庫 (Audit Report Vault)
                </h2>
                <p className="text-xs text-zinc-500">
                  生成されたアライメントレポート Markdown ファイル
                  (./x_downloads に保存)
                </p>
              </div>
            </div>
            <button
              onClick={fetchFiles}
              disabled={isLoadingFiles}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors border border-white/5"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoadingFiles ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/5 flex-1">
            {/* File List */}
            <div className="lg:col-span-1 p-4 overflow-y-auto max-h-[500px] custom-scrollbar bg-black/20">
              {isLoadingFiles ? (
                <div className="text-center py-8 text-zinc-500 text-sm font-mono">
                  データを読み込み中...
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-sm font-mono">
                  データファイルが見つかりません。
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <div
                      key={file.filename}
                      onClick={() => viewFile(file.filename)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                        selectedFileName === file.filename
                          ? "bg-blue-500/10 border-blue-500/30"
                          : "bg-white/5 border-transparent hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText
                          className={`w-4 h-4 shrink-0 ${selectedFileName === file.filename ? "text-blue-400" : "text-zinc-500"}`}
                        />
                        <div className="truncate">
                          <p
                            className={`text-sm font-medium truncate ${selectedFileName === file.filename ? "text-blue-100" : "text-zinc-300"}`}
                          >
                            @{file.author}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                            {file.tweetCount} tweets •{" "}
                            {(file.sizeBytes / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* File Preview */}
            <div className="lg:col-span-2 p-6 bg-[#0a0a0c] flex flex-col h-[500px]">
              {selectedFileContent ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-mono text-sm text-blue-400">
                      {selectedFileName}
                    </h3>
                    <div className="flex items-center gap-3">
                      {indexStatus && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            indexStatus.startsWith("Success")
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                          }`}
                        >
                          {indexStatus}
                        </span>
                      )}
                      <button
                        onClick={handleIndexToKB}
                        disabled={isIndexing}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isIndexing
                          ? "インデックス中..."
                          : "ナレッジベースに登録"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={selectedFileContent}
                    className="flex-1 w-full p-4 bg-black/50 border border-white/5 rounded-xl font-mono text-xs text-zinc-300 focus:outline-none custom-scrollbar"
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
                  <Eye className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm font-mono">
                    金庫からファイルを選択してプレビューを表示
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
