"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Database,
  Link as LinkIcon,
  Save,
  Search,
  Server,
  FileText,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Tag,
  Clock,
  ExternalLink,
  ChevronRight,
  Shield,
} from "lucide-react";
import { extractAndSaveArticle, getArticles, deleteArticle } from "./actions";

interface Article {
  id: string;
  kb_id: string;
  title: string;
  content: string;
  domain: string | null;
  category: string | null;
  type: string;
  status: string;
  priority: string;
  created_at: string;
}

export default function KnowledgePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const fetchList = async () => {
    setArticlesLoading(true);
    try {
      const response = await getArticles();
      if (response.success && response.data) {
        setArticles(response.data);
      }
    } catch (e) {
      console.error("Failed to load articles", e);
    } finally {
      setArticlesLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await extractAndSaveArticle(url);
      if (response.success && response.data) {
        setResult(response.data);
        setUrl(""); // Clear input on success
        await fetchList(); // Refresh the list

        // Auto select the newly created article
        const newArt: Article = {
          id: response.data.kb_id, // temporarily use kb_id or query list
          kb_id: response.data.kb_id,
          title: response.data.title,
          content: response.data.content,
          domain: response.data.site || new URL(url).hostname,
          category: "Web Extract",
          type: "Note",
          status: "Draft",
          priority: "Medium",
          created_at: new Date().toISOString(),
        };
        setSelectedArticle(newArt);
      } else {
        setError(response.error || "Failed to save article");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the article when deleting
    if (!confirm("本当にこのナレッジドキュメントを削除しますか？")) return;

    try {
      const res = await deleteArticle(id);
      if (res.success) {
        if (selectedArticle?.id === id) {
          setSelectedArticle(null);
        }
        await fetchList();
      } else {
        alert("削除に失敗しました。");
      }
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const filteredArticles = useMemo(() => {
    if (!search) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.content && a.content.toLowerCase().includes(q)) ||
        (a.kb_id && a.kb_id.toLowerCase().includes(q)) ||
        (a.domain && a.domain.toLowerCase().includes(q)),
    );
  }, [articles, search]);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-purple-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />

      {/* Navigation */}
      <nav className="w-full px-6 py-6 border-b border-white/5 relative z-10 flex items-center justify-between bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
          >
            <BookOpen className="w-4 h-4" />
            オラクルハブ (Oracle Hub)
          </Link>
          <div className="h-4 w-px bg-zinc-800"></div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="font-mono text-sm tracking-widest uppercase text-purple-50">
              セカンドブレイン (Second Brain)
            </span>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 relative z-10 flex flex-col gap-8">
        {/* Header Section */}
        <header className="mb-2">
          <h1 className="text-4xl font-bold tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-500" />
            ナレッジベース (Knowledge Base ITIL)
          </h1>
          <p className="text-gray-400 mt-2 text-sm font-light">
            Defuddleエンジン。WebのURLからクリーンなMarkdownを抽出し、ローカライズされたナレッジドキュメント・ベクトルストアにインデックス化します。
          </p>
        </header>

        {/* Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form & Document List (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6 w-full">
            {/* Extraction Form */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl">
              <div className="text-xs font-mono text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5" />
                新しいURLを追加
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="URLを入力 (https://...)"
                  className="w-full px-4 py-3 bg-black/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-mono placeholder:text-zinc-700"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !url}
                  className="w-full inline-flex justify-center items-center px-8 py-3 font-medium rounded-xl text-white bg-purple-600 hover:bg-purple-500 focus:outline-none transition-colors disabled:bg-zinc-800 disabled:text-zinc-500 shadow-[0_0_20px_rgba(168,85,247,0.2)] disabled:shadow-none"
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

            {/* Document List */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className="text-xs font-mono text-purple-400 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  ナレッジドキュメント一覧 ({filteredArticles.length})
                </div>
                <button
                  onClick={fetchList}
                  disabled={articlesLoading}
                  className="p-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg transition-colors disabled:opacity-50"
                  title="一覧を更新"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${articlesLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="タイトルやID、本文で検索..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/30 border border-zinc-800 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-650 focus:outline-none focus:border-purple-500/40"
                />
              </div>

              {/* List Wrapper */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                {articlesLoading && articles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                    ローディング中...
                  </div>
                ) : filteredArticles.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    登録されているナレッジはありません
                  </div>
                ) : (
                  filteredArticles.map((art) => {
                    const isSelected = selectedArticle?.id === art.id;
                    return (
                      <div
                        key={art.id}
                        onClick={() => setSelectedArticle(art)}
                        className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-2 group relative overflow-hidden ${
                          isSelected
                            ? "bg-purple-950/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                            : "bg-black/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <span className="text-[10px] font-mono tracking-wider font-semibold text-purple-400 shrink-0 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            {art.kb_id}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3" />
                            {new Date(art.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 className="text-xs font-semibold text-zinc-200 group-hover:text-white line-clamp-2 leading-relaxed">
                          {art.title}
                        </h3>
                        <div className="flex justify-between items-center gap-4 mt-1">
                          <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[180px]">
                            {art.domain || "Web Extract"}
                          </span>
                          <button
                            onClick={(e) => handleDelete(art.id, e)}
                            className="p-1 hover:bg-rose-500/25 text-zinc-600 hover:text-rose-400 rounded transition-colors"
                            title="このドキュメントを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Reader Panel (7 cols) */}
          <div className="lg:col-span-7 w-full h-full">
            {selectedArticle ? (
              <div className="rounded-2xl bg-black border border-purple-900/30 shadow-[0_0_40px_rgba(168,85,247,0.05)] overflow-hidden flex flex-col relative animate-fade-in min-h-[600px]">
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] z-20 opacity-10"></div>

                {/* Header */}
                <div className="bg-purple-950/10 border-b border-purple-900/30 px-6 py-5 z-30 relative flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-mono text-xs text-emerald-400 tracking-widest uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      TICKET ACTIVE: {selectedArticle.kb_id}
                    </span>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-zinc-400 font-mono uppercase">
                        {selectedArticle.status}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 font-mono uppercase">
                        PRIORITY: {selectedArticle.priority}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-xl font-bold text-white leading-tight">
                    {selectedArticle.title}
                  </h2>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 font-mono pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Created:{" "}
                      {new Date(selectedArticle.created_at).toLocaleString()}
                    </span>
                    {selectedArticle.domain && (
                      <span className="flex items-center gap-1">
                        <LinkIcon className="w-3.5 h-3.5 text-purple-500/60" />
                        Source: {selectedArticle.domain}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content Payload Reader */}
                <div className="p-6 bg-[#0a0a0c] z-30 relative flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-500" />
                      <span className="text-xs font-mono text-purple-400 uppercase tracking-widest">
                        Markdown Content Payload
                      </span>
                    </div>
                    {/* If domain exists and looks like a URL, allow opening it */}
                    {selectedArticle.domain &&
                      selectedArticle.domain.includes(".") && (
                        <a
                          href={
                            selectedArticle.domain.startsWith("http")
                              ? selectedArticle.domain
                              : `https://${selectedArticle.domain}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 hover:underline font-mono"
                        >
                          元のURLを開く <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                  </div>
                  <textarea
                    readOnly
                    value={selectedArticle.content}
                    className="w-full flex-1 min-h-[500px] p-4 text-xs font-mono text-zinc-300 bg-black border border-white/5 rounded-xl focus:outline-none custom-scrollbar leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-black/10 flex flex-col items-center justify-center text-center p-12 min-h-[600px] text-zinc-500 gap-3">
                <BookOpen className="w-12 h-12 text-zinc-700 animate-pulse" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400">
                    ナレッジが選択されていません
                  </h3>
                  <p className="text-xs text-zinc-600 mt-1 max-w-[280px] leading-relaxed">
                    左側のドキュメント一覧から表示したいナレッジチケットを選択するか、新しいウェブページを登録してください。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
