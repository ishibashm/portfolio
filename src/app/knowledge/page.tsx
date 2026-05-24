"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BookOpen, Database, Link as LinkIcon, Save, Search, Server, FileText, CheckCircle2 } from "lucide-react";
import { extractAndSaveArticle } from "./actions";

export default function KnowledgePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await extractAndSaveArticle(url);
      if (response.success) {
        setResult(response.data);
        setUrl(""); // Clear input on success
      } else {
        setError(response.error);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />
      
      {/* Navigation */}
      <nav className="w-full px-6 py-6 border-b border-white/5 relative z-10 flex items-center justify-between bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium">
            <BookOpen className="w-4 h-4" />
            オラクルハブ (Oracle Hub)
          </Link>
          <div className="h-4 w-px bg-zinc-800"></div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="font-mono text-sm tracking-widest uppercase text-purple-50">セカンドブレイン (Second Brain)</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-8 relative z-10 flex flex-col gap-8">
        
        {/* Header Section */}
        <header className="mb-4">
          <h1 className="text-4xl font-bold tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
            ナレッジベース (Knowledge Base ITIL)
          </h1>
          <p className="text-gray-400 mt-2 text-sm font-light">
            Defuddleエンジン。WebのURLからクリーンなMarkdownを抽出し、ローカライズされたナレッジドキュメント・ベクトルストアにインデックス化します。
          </p>
        </header>

        {/* Extraction Form */}
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <LinkIcon className="h-5 w-5 text-purple-500/50" />
              </div>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="抽出するURLを入力 (例: https://...)"
                className="w-full pl-11 pr-4 py-3 bg-black/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-mono placeholder:text-zinc-700"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url}
              className="inline-flex justify-center items-center px-8 py-3 font-medium rounded-xl text-white bg-purple-600 hover:bg-purple-500 focus:outline-none transition-colors disabled:bg-zinc-800 disabled:text-zinc-500 shadow-[0_0_20px_rgba(168,85,247,0.2)] disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center gap-2 text-sm">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  抽出登録中...
                </span>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <Server className="w-4 h-4" />
                  ナレッジに登録 (Index)
                </span>
              )}
            </button>
          </form>

          {error && (
             <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
               <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
               {error}
             </div>
          )}
        </div>

        {/* Success Result Panel */}
        {result && (
          <div className="rounded-2xl bg-black border border-purple-900/50 shadow-[0_0_30px_rgba(168,85,247,0.1)] overflow-hidden flex flex-col animate-fade-in relative">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-20 opacity-10"></div>
            
            <div className="bg-purple-950/20 border-b border-purple-900/50 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-30 relative">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="font-mono text-xs text-emerald-400 tracking-widest uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    チケット作成完了 (Ticket Created): {result.kb_id}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-white/90 line-clamp-1">{result.title}</h2>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 rounded bg-white/5 border border-white/10 text-xs text-zinc-400 font-mono">
                  {result.site || '不明なソース'}
                </span>
              </div>
            </div>

            <div className="p-6 bg-[#0a0a0c] z-30 relative">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-mono text-purple-400 uppercase tracking-widest">抽出されたMarkdownペイロード</span>
              </div>
              <textarea
                readOnly
                value={result.content}
                className="w-full h-[400px] p-4 text-xs font-mono text-zinc-300 bg-black border border-white/5 rounded-xl focus:outline-none custom-scrollbar"
              />
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
