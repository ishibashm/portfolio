"use client";

import { useState, useRef, useEffect } from "react";
import {
  Save,
  Loader2,
  UploadCloud,
  FileText,
  Network,
  Share2,
} from "lucide-react";

export default function KnowledgeEditorWidget() {
  const [activeTab, setActiveTab] = useState<"editor" | "graph">("graph");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // グラフ用のアニメーション状態
  const [showAhaMoment, setShowAhaMoment] = useState(false);

  useEffect(() => {
    if (activeTab === "graph") {
      // グラフタブが開かれたら少し遅れてAha Momentアニメーションを発火
      const timer = setTimeout(() => {
        setShowAhaMoment(true);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setShowAhaMoment(false);
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) {
      setError("タイトルと内容を入力してください。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setSuccessMsg("");

    try {
      // モックとしての保存体験（API不要）
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSuccessMsg("ドキュメントが保存され、ナレッジグラフに統合されました！");

      setTimeout(() => {
        setTitle("");
        setContent("");
        setSuccessMsg("");
        // 保存後にグラフビューへ自動遷移してAha Momentを見せるデモフロー
        setActiveTab("graph");
      }, 2000);
    } catch (err) {
      // ここは画面に出す文言。toUserMessage に寄せると英語が日本語の案内に
      // 置き換わって見え方が変わるので、旧コードと同じ形のまま any だけ外す。
      // toResponseMessage は API の応答用なので、画面には使わない。
      setError((err instanceof Error && err.message) || "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setError("");
    setSuccessMsg("");

    try {
      // モックとしての解析体験（API不要）
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".jsonl")
      ) {
        const text = await file.text();
        setContent(text);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      } else {
        setContent(
          "（自動抽出されたテキスト）\n\n" +
            file.name +
            " の内容からAIがエンティティを抽出しました。",
        );
        setTitle(file.name);
      }
    } catch {
      // err は読んでいない（固定の文言を出すだけ）。
      setError("ファイルの解析に失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-xl border border-rose-100/80 rounded-3xl overflow-hidden text-stone-800 shadow-xl shadow-rose-100/30">
      <div className="flex items-center justify-between px-5 py-4 bg-white/90 border-b border-rose-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-200">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="font-bold text-stone-900 font-serif text-base">Local Knowledge Builder</h2>
            <p className="text-[10px] text-stone-500 font-sans">ナレッジグラフ & アイデア抽出</p>
          </div>
        </div>

        {/* タブ切り替え */}
        <div className="flex p-1 bg-stone-100 rounded-xl border border-stone-200/80 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("graph")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "graph"
                ? "bg-white text-indigo-700 shadow-xs font-bold border border-stone-200/50"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            <Network size={14} />
            Graph Explorer
          </button>
          <button
            onClick={() => setActiveTab("editor")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "editor"
                ? "bg-white text-indigo-700 shadow-xs font-bold border border-stone-200/50"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            <FileText size={14} />
            Editor
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* Graph Explorer Tab (Aha Moment Demo) */}
        {activeTab === "graph" && (
          <div className="absolute inset-0 bg-stone-50/50 p-4 flex flex-col">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-indigo-700 mb-0.5 flex items-center gap-1.5 font-serif">
                <Share2 size={15} />
                Knowledge Triplet Network
              </h3>
              <p className="text-[11px] text-stone-500">
                抽出されたエンティティと関係性の可視化
              </p>
            </div>

            <div className="flex-1 border border-stone-200 rounded-xl bg-stone-50 relative overflow-hidden flex items-center justify-center">
              {/* 背景のグリッド */}
              <div
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                  backgroundSize: "24px 24px",
                }}
              ></div>

              {/* デモ用ネットワークグラフ */}
              <div className="relative w-full h-full max-w-lg max-h-96">
                {/* エッジ（線） */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  style={{ pointerEvents: "none" }}
                >
                  <line
                    x1="20%"
                    y1="30%"
                    x2="50%"
                    y2="50%"
                    stroke="#334155"
                    strokeWidth="2"
                  />
                  <line
                    x1="80%"
                    y1="20%"
                    x2="50%"
                    y2="50%"
                    stroke="#334155"
                    strokeWidth="2"
                  />
                  <line
                    x1="50%"
                    y1="50%"
                    x2="50%"
                    y2="80%"
                    stroke="#334155"
                    strokeWidth="2"
                  />

                  {/* Aha Moment アニメーション用の光るエッジ */}
                  <line
                    x1="20%"
                    y1="70%"
                    x2="50%"
                    y2="80%"
                    stroke={showAhaMoment ? "#818cf8" : "#334155"}
                    strokeWidth={showAhaMoment ? "3" : "2"}
                    className={`transition-all duration-1000 ${showAhaMoment ? "drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]" : ""}`}
                    strokeDasharray={showAhaMoment ? "5,5" : "none"}
                  >
                    {showAhaMoment && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from="10"
                        to="0"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    )}
                  </line>
                </svg>

                {/* エッジのラベル */}
                <div
                  className={`absolute top-[75%] left-[30%] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border transition-all duration-1000 ${showAhaMoment ? "text-indigo-300 border-indigo-500/50 scale-110 z-10" : "text-slate-500 border-slate-700 opacity-0"}`}
                  style={{ transform: "translate(-50%, -50%)" }}
                >
                  SUPPORTS
                </div>
                <div
                  className="absolute top-[40%] left-[35%] text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-700 px-1 rounded"
                  style={{ transform: "translate(-50%, -50%)" }}
                >
                  USED_BY
                </div>

                {/* ノード */}
                {/* 既存ノード 1 */}
                <div className="absolute top-[30%] left-[20%] w-24 h-24 bg-slate-800 rounded-full border-2 border-slate-600 flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2 hover:scale-105 transition-transform cursor-pointer">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 mb-1">
                      Technology
                    </div>
                    <div className="text-xs font-bold">Ollama</div>
                  </div>
                </div>

                {/* 既存ノード 2 */}
                <div className="absolute top-[20%] left-[80%] w-20 h-20 bg-slate-800 rounded-full border-2 border-slate-600 flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2 hover:scale-105 transition-transform cursor-pointer">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 mb-1">
                      Concept
                    </div>
                    <div className="text-xs font-bold">RAG</div>
                  </div>
                </div>

                {/* 中心ノード */}
                <div className="absolute top-[50%] left-[50%] w-28 h-28 bg-blue-900/40 rounded-full border-2 border-blue-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.3)] transform -translate-x-1/2 -translate-y-1/2 hover:scale-105 transition-transform cursor-pointer z-10">
                  <div className="text-center">
                    <div className="text-[10px] text-blue-300 mb-1">
                      My Note
                    </div>
                    <div className="text-sm font-bold text-blue-100">
                      MCPの設計
                    </div>
                  </div>
                </div>

                {/* 新しいノード (Aha Momentで繋がるXのポスト) */}
                <div
                  className={`absolute top-[70%] left-[20%] w-24 h-24 rounded-full border-2 flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-1000 z-10 ${
                    showAhaMoment
                      ? "bg-indigo-900/60 border-indigo-400 shadow-[0_0_20px_rgba(129,140,248,0.6)] scale-110"
                      : "bg-slate-800 border-slate-600 shadow-lg scale-100 opacity-50"
                  }`}
                >
                  <div className="text-center">
                    <div
                      className={`text-[10px] mb-1 transition-colors ${showAhaMoment ? "text-indigo-300" : "text-slate-400"}`}
                    >
                      X Post
                    </div>
                    <div
                      className={`text-xs font-bold transition-colors ${showAhaMoment ? "text-white" : "text-slate-300"}`}
                    >
                      自律エージェント
                    </div>
                  </div>

                  {/* Aha Moment用 パルスエフェクト */}
                  {showAhaMoment && (
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500 animate-ping opacity-20"></div>
                  )}
                </div>

                {/* 既存ノード 3 */}
                <div className="absolute top-[80%] left-[50%] w-20 h-20 bg-slate-800 rounded-full border-2 border-slate-600 flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2 hover:scale-105 transition-transform cursor-pointer">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 mb-1">Tool</div>
                    <div className="text-xs font-bold">xurl</div>
                  </div>
                </div>
              </div>

              {/* Aha Moment 発生時のツールチップポップアップ */}
              <div
                className={`absolute bottom-6 right-6 max-w-xs bg-indigo-950 border border-indigo-500/50 rounded-lg p-3 shadow-xl shadow-indigo-900/20 transition-all duration-700 transform ${
                  showAhaMoment
                    ? "translate-y-0 opacity-100"
                    : "translate-y-10 opacity-0"
                }`}
              >
                <div className="text-xs font-bold text-indigo-300 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                  New Discovery!
                </div>
                <p className="text-xs text-slate-300">
                  あなたのメモ「MCPの設計」は、最近保存したXのポスト「自律エージェント」を理論的にサポート（SUPPORTS）しています。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Editor Tab */}
        {activeTab === "editor" && (
          <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            {/* Upload Zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-500 bg-blue-900/20"
                  : "border-slate-600 hover:bg-slate-800/50"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
                className="hidden"
                accept=".md,.txt,.pdf,.docx,.xlsx,.csv,.jsonl"
              />
              {isUploading ? (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <p className="font-medium text-xs">
                    AIによる文書解析・抽出中...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <UploadCloud
                    size={24}
                    className={isDragging ? "text-blue-400" : "text-slate-500"}
                  />
                  <p className="font-medium text-xs text-slate-300">
                    ここにファイルをドラッグ＆ドロップするか、クリックして選択
                  </p>
                  <p className="text-[10px] opacity-70">
                    対応形式: .md, .txt, .pdf, .jsonl etc.
                  </p>
                </div>
              )}
            </div>

            {/* Message Area */}
            {error && (
              <div className="bg-red-950/50 text-red-400 p-3 rounded-lg border border-red-900/50 text-xs">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-emerald-950/50 text-emerald-400 p-3 rounded-lg border border-emerald-900/50 text-xs">
                {successMsg}
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="flex flex-col gap-4 flex-1"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="title"
                  className="block text-xs font-bold text-slate-400 uppercase tracking-widest"
                >
                  タイトル (Document Title)
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. MCP Architecture Notes"
                  className="w-full px-3 py-2 border border-slate-700 bg-slate-950 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm transition-colors"
                  disabled={isSubmitting || isUploading}
                />
              </div>

              <div className="space-y-1.5 flex-1 flex flex-col">
                <label
                  htmlFor="content"
                  className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex justify-between"
                >
                  <span>本文 (Content)</span>
                  <span className="font-normal opacity-70 normal-case">
                    Markdown supported
                  </span>
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="ここにナレッジを入力するか、ファイルをアップロードして解析させます..."
                  className="w-full flex-1 min-h-[200px] px-3 py-2 border border-slate-700 bg-slate-950 rounded-lg font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors resize-none"
                  disabled={isSubmitting || isUploading}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading || !title || !content}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>AI Extracting...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>データベースに保存</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
