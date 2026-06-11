"use client";

import { useState } from "react";

export default function MediaScraperWidget() {
  const [url, setUrl] = useState("https://x.com/home");
  const [mode, setMode] = useState<
    "x_post" | "pinterest" | "grok" | "agentic" | "extract_frames"
  >("x_post");
  const [maxScrolls, setMaxScrolls] = useState(10);
  const [instruction, setInstruction] = useState(
    "このページから非公開の動画URLと投稿内容をJSON形式で抽出してください。",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<
    { id: string; type: string; message: string }[]
  >([]);

  const addLog = (type: string, message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: Math.random().toString(), type, message },
    ]);
  };

  const handleLaunch = async () => {
    if (!url && mode !== "grok" && mode !== "extract_frames") {
      addLog("error", "URLまたはパスを入力してください。");
      return;
    }

    setIsProcessing(true);
    addLog(
      "info",
      `ブラウザを起動しています (${mode === "grok" ? "Grok" : url})...`,
    );

    try {
      const response = await fetch("/api/v1/scraper/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: mode === "grok" ? "https://grok.com" : url,
        }),
      });

      if (!response.ok) {
        throw new Error("ブラウザの起動に失敗しました。");
      }

      setIsBrowserOpen(true);
      addLog(
        "completed",
        "ブラウザが起動しました。開いたウィンドウで手動ログインやページ移動を行った後、「2. 収集を開始する」を押してください。",
      );
    } catch (error: any) {
      addLog("error", `エラー: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRun = async () => {
    setIsProcessing(true);
    addLog(
      "info",
      mode === "agentic"
        ? "Agentic Extractionを開始します..."
        : mode === "extract_frames"
          ? "動画のフレーム抽出を開始します..."
          : "収集処理を開始します...",
    );

    try {
      const endpoint =
        mode === "agentic" ? "/api/v1/scraper/agentic" : "/api/v1/scraper/run";
      const body =
        mode === "agentic"
          ? { instruction }
          : {
              mode,
              max_scrolls: maxScrolls,
              target_path: mode === "extract_frames" ? url : undefined,
            };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.body) throw new Error("No response body");

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
    } catch (error: any) {
      addLog("error", `通信エラー: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = async () => {
    addLog("info", "ブラウザを終了しています...");
    try {
      await fetch("/api/v1/scraper/close", { method: "POST" });
      setIsBrowserOpen(false);
      addLog("completed", "ブラウザを終了しました。");
    } catch (error: any) {
      addLog("error", `エラー: ${error.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden text-slate-200">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700">
        <h2 className="font-semibold flex items-center gap-2">
          <span className="text-pink-500">📸</span> Media Scraper & Agentic
          Extractor
        </h2>
        {isBrowserOpen && (
          <button
            onClick={handleClose}
            className="px-2 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs rounded border border-red-700/50 transition-colors"
          >
            ブラウザ強制終了
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4 border-b border-slate-700 bg-slate-800/30">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400">
            ターゲット (抽出エンジン)
          </label>
          <select
            value={mode}
            onChange={(e) => {
              const val = e.target.value as
                | "x_post"
                | "pinterest"
                | "grok"
                | "agentic"
                | "extract_frames";
              setMode(val);
              if (val === "x_post") setUrl("https://x.com/home");
              else if (val === "pinterest") setUrl("https://jp.pinterest.com/");
              else if (val === "grok") setUrl("https://grok.com/");
              else if (val === "extract_frames")
                setUrl("C:\\movies\\sample.mp4 (動画ファイルの絶対パス)");
            }}
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-pink-500"
            disabled={isBrowserOpen || isProcessing}
          >
            <option value="x_post">
              1. X (Twitter) タイムライン・メディア一括収集
            </option>
            <option value="pinterest">2. Pinterest 画像一括収集</option>
            <option value="grok">
              3. Grok 動画ダウンローダー (Playwright)
            </option>
            <option value="extract_frames">
              4. 🎬 ローカル動画ファイル(.mp4等)から画像を抽出
            </option>
            <option value="agentic">
              5. 🌟 Agentic Extractor (AIによる生DOM自由抽出)
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-400">
            {mode === "extract_frames"
              ? "抽出対象のローカル動画ファイルの絶対パス (例: C:\\movies\\sample.mp4)"
              : "起動する URL"}
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-pink-500"
            disabled={isBrowserOpen || isProcessing || mode === "grok"}
          />
        </div>

        {/* Advanced Options Toggle */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
          >
            {showAdvanced
              ? "▼ 詳細設定を隠す"
              : "▶ 詳細設定 (Advanced Options)"}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-3 bg-slate-900 border border-slate-700 rounded-md flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
              {mode !== "agentic" &&
                mode !== "grok" &&
                mode !== "extract_frames" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider">
                      最大スクロール回数 (Max Scrolls)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={maxScrolls}
                      onChange={(e) => setMaxScrolls(parseInt(e.target.value))}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-pink-500 w-full"
                      disabled={isProcessing}
                    />
                    <p className="text-[9px] text-slate-500 mt-1">
                      過去の投稿まで遡る深さを指定します。
                    </p>
                  </div>
                )}

              {mode === "agentic" && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-pink-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span>🤖</span> AIへの抽出プロンプト (Instruction)
                  </label>
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-pink-500 w-full min-h-[60px]"
                    disabled={isProcessing}
                  />
                  <p className="text-[9px] text-slate-500 mt-1">
                    開いているページのHTMLを丸ごとAIに読ませ、指示通りにJSON等で抽出させます。
                  </p>
                </div>
              )}

              {mode === "grok" && (
                <div className="bg-amber-950/30 border border-amber-900/50 p-3 rounded-md">
                  <p className="text-xs font-bold text-amber-500 mb-2">
                    ⚠️ Grok ダウンローダーの使い方
                  </p>
                  <p className="text-[10px] text-amber-200/80 leading-relaxed">
                    Grok
                    ダウンローダーは特殊なデバッグモードのChromeで動作します。
                    <br />
                    <br />
                    1. 下の **「1. ブラウザを起動」**
                    ボタンを押してください。すると専用の新しいChromeウィンドウが開きます。
                    <br />
                    2. 開いたブラウザで Grok (grok.com)
                    にログインして準備します。
                    <br />
                    3. 準備ができたら、この画面の **「2. 自動収集を開始」**
                    ボタンを押すと、裏側でNode.jsの傍受スクリプトが走り出します！
                  </p>
                </div>
              )}

              {mode === "extract_frames" && (
                <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700">
                  <p className="text-xs text-slate-300 font-bold mb-1 flex items-center gap-1">
                    <span className="text-pink-400">🎞️</span>{" "}
                    動画フレーム抽出について
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
                    動画(ローカルのMP4ファイル等)から1秒ごとにフレーム画像を抽出し保存します。
                    <br />
                    対象の動画ファイルパス（例:{" "}
                    <code>C:\movies\sample.mp4</code>）を上に指定してください。
                  </p>
                  <div className="bg-slate-950 border border-slate-800 p-2 rounded">
                    <span className="text-[9px] text-slate-500 block mb-1">
                      デフォルトの保存先 (抽出画像の格納先):
                    </span>
                    <code className="text-[10px] text-emerald-400 font-mono break-all">
                      C:\Users\ishib\projects\immediate\image\apps\api-gateway\media_output\frames\
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={handleLaunch}
            disabled={
              isBrowserOpen || isProcessing || mode === "extract_frames"
            }
            className={`bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-colors text-sm flex justify-center items-center gap-2 ${mode === "extract_frames" ? "opacity-50" : ""}`}
          >
            1. ブラウザを起動 (準備)
          </button>

          <button
            onClick={handleRun}
            disabled={
              (!isBrowserOpen &&
                mode !== "grok" &&
                mode !== "extract_frames") ||
              isProcessing
            }
            className="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-colors text-sm flex justify-center items-center gap-2 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
          >
            {isProcessing
              ? "⏳ 実行中..."
              : mode === "extract_frames"
                ? "▶ 抽出を実行"
                : "2. 自動抽出を開始"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[200px] p-4 overflow-y-auto bg-slate-950 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2 opacity-50">
            <span className="text-3xl">🖥️</span>
            <p className="text-center">
              ブラウザを起動し、手動でログインしてから
              <br />
              自動収集を実行してください。
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "completed"
                      ? "text-emerald-400 font-semibold"
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
                <span className="whitespace-pre-wrap">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
