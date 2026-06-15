"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  Database,
  Link as LinkIcon,
  Search,
  Server,
  FileText,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Clock,
  ExternalLink,
  ChevronRight,
  Shield,
  Plus,
  Filter,
  X,
  AlertCircle,
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

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Regex-based Text Highlighting Component
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const queryWords = query.split(/[\s　]+/).filter(Boolean);
  if (queryWords.length === 0) return <>{text}</>;

  const escapedWords = queryWords.map(escapeRegExp);
  const regex = new RegExp(`(${escapedWords.join("|")})`, "gi");
  const parts = text.split(regex);
  const wordSet = new Set(queryWords.map((w) => w.toLowerCase()));

  return (
    <>
      {parts.map((part, i) =>
        wordSet.has(part.toLowerCase()) ? (
          <mark
            key={i}
            className="bg-yellow-200 text-neutral-900 rounded-sm px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// Content Snippets Generator (VS Code Style matching original defuddle search)
function ContentSnippets({
  content,
  query,
}: {
  content?: string;
  query: string;
}) {
  if (!content || !query) return null;

  const maxSnippets = 5;
  const contextLength = 40;
  const queryWords = query.toLowerCase().split(/[\s　]+/).filter(Boolean);
  if (queryWords.length === 0) return null;
  const lowerQuery = queryWords[0];
  const lowerContent = content.toLowerCase();

  let mergedIndices: [number, number][] = [];
  let startIndex = 0;

  while (true) {
    const idx = lowerContent.indexOf(lowerQuery, startIndex);
    if (idx === -1) break;

    const end = idx + lowerQuery.length - 1;
    if (mergedIndices.length === 0) {
      mergedIndices.push([idx, end]);
    } else {
      const last = mergedIndices[mergedIndices.length - 1];
      if (idx <= last[1] + contextLength) {
        last[1] = Math.max(last[1], end);
      } else {
        mergedIndices.push([idx, end]);
      }
    }
    startIndex = idx + 1;
    if (mergedIndices.length > 50) break; // Infinite loop prevention
  }

  if (mergedIndices.length === 0) return null;

  const displayIndices = mergedIndices.slice(0, maxSnippets);

  return (
    <div className="pl-44 py-2 bg-neutral-50/50 border-b border-neutral-150">
      <div className="flex flex-col gap-1.5">
        {displayIndices.map(([start, end], i) => {
          let s = Math.max(0, start - contextLength);
          let e = Math.min(content.length, end + 1 + contextLength);

          const prefix = content.substring(s, start).replace(/[\r\n]+/g, " ");
          const hit = content
            .substring(start, end + 1)
            .replace(/[\r\n]+/g, " ");
          const suffix = content.substring(end + 1, e).replace(/[\r\n]+/g, " ");

          return (
            <div
              key={i}
              className="flex items-center gap-2 text-[11px] font-mono text-neutral-500 group/snippet"
            >
              <FileText
                size={12}
                className="shrink-0 opacity-40 group-hover/snippet:text-blue-500 transition-colors"
              />
              <div className="truncate max-w-4xl cursor-default hover:text-neutral-800 transition-colors">
                <span className="opacity-50 tracking-widest mr-1">...</span>
                {prefix}
                <mark className="bg-yellow-200/80 text-neutral-900 rounded-sm px-0.5 shadow-sm font-semibold">
                  {hit}
                </mark>
                {suffix}
                <span className="opacity-50 tracking-widest ml-1">...</span>
              </div>
            </div>
          );
        })}
        {mergedIndices.length > maxSnippets && (
          <div className="text-[10px] text-neutral-400 italic pl-5 mt-1">
            ... and {mergedIndices.length - maxSnippets} more matching areas
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServiceNowKnowledgePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Articles list state
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Selected article (slides in side panel)
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // Add record inline panel toggle
  const [showAddPanel, setShowAddPanel] = useState(false);

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

    try {
      const response = await extractAndSaveArticle(url);
      if (response.success && response.data) {
        setUrl(""); // Clear input
        setShowAddPanel(false); // Hide panel
        alert(
          `Successfully registered record: ${response.data.title} (${response.data.kb_id})`,
        );
        await fetchList(); // Refresh list

        // Select the newly added article
        const newArt: Article = {
          id: response.data.kb_id,
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

  const handleDelete = async (
    id: string,
    title: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // Prevent opening drawer
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const res = await deleteArticle(id);
      if (res.success) {
        if (selectedArticle?.id === id) {
          setSelectedArticle(null);
        }
        await fetchList();
      } else {
        alert("Delete failed.");
      }
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  // Filter list
  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      // Search term check: split by space for multi-word match (AND search)
      let matchSearch = true;
      if (search.trim()) {
        const queryWords = search.toLowerCase().split(/[\s　]+/).filter(Boolean);
        matchSearch = queryWords.every((word) => {
          return (
            a.title.toLowerCase().includes(word) ||
            (a.content && a.content.toLowerCase().includes(word)) ||
            a.kb_id.toLowerCase().includes(word) ||
            (a.domain && a.domain.toLowerCase().includes(word))
          );
        });
      }

      // Category check
      const matchCategory = !categoryFilter || a.category === categoryFilter;

      // Status check
      const matchStatus = !statusFilter || a.status === statusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [articles, search, categoryFilter, statusFilter]);

  // Distinct categories for dropdown filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    articles.forEach((a) => {
      if (a.category) set.add(a.category);
    });
    return Array.from(set);
  }, [articles]);

  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case "published":
        return "bg-green-100 text-green-800 border-green-200";
      case "review":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "text-red-600 font-semibold";
      case "low":
        return "text-blue-600";
      default:
        return "text-orange-600";
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-neutral-800 flex flex-col relative font-sans">
      {/* Workspace Header Panel */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
            <Database size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              ITSM / Knowledge Repository
            </h1>
            <p className="text-xs text-neutral-500">
              All Active Records • {filteredArticles.length} documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchList()}
            disabled={articlesLoading}
            className="p-2 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw
              size={16}
              className={articlesLoading ? "animate-spin" : ""}
            />
          </button>
          <button
            onClick={() => setShowAddPanel(!showAddPanel)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm rounded-lg font-medium shadow-sm transition-colors cursor-pointer"
          >
            <Plus size={16} />
            <span>New Record</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 p-6 flex flex-col gap-6 relative">
        {/* Inline URL Add Panel */}
        {showAddPanel && (
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-md animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-neutral-700 flex items-center gap-2">
                <LinkIcon size={16} className="text-blue-500" />
                Add URL to Knowledge base
              </h2>
              <button
                onClick={() => setShowAddPanel(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3"
            >
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL to index (https://...)"
                className="flex-grow px-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-neutral-800"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !url}
                className="inline-flex justify-center items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Extracting...
                  </>
                ) : (
                  <>
                    <Server size={16} />
                    Submit Index
                  </>
                )}
              </button>
            </form>
            {error && (
              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by title, number, site, or contents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Filter size={14} />
              <span>Filters</span>
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs text-neutral-700 outline-none cursor-pointer hover:bg-neutral-100"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-lg text-xs text-neutral-700 outline-none cursor-pointer hover:bg-neutral-100"
            >
              <option value="">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Review">Review</option>
              <option value="Published">Published</option>
            </select>
          </div>
        </div>

        {/* ServiceNow ITSM Grid Table */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-grow">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <th className="px-6 py-4 w-12 text-center">#</th>
                  <th className="px-6 py-4 w-32 font-mono">Number</th>
                  <th className="px-6 py-4">Title</th>
                  <th className="px-6 py-4 w-32">State</th>
                  <th className="px-6 py-4 w-28">Priority</th>
                  <th className="px-6 py-4 w-28">Type</th>
                  <th className="px-6 py-4 w-40">Category</th>
                  <th className="px-6 py-4 w-44">Created</th>
                  <th className="px-6 py-4 w-20 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-neutral-100">
                {articlesLoading && articles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-10 text-center text-neutral-500 font-mono"
                    >
                      Loading repository...
                    </td>
                  </tr>
                ) : filteredArticles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-6 py-10 text-center text-neutral-500"
                    >
                      No records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map((art, index) => {
                    const isSelected = selectedArticle?.id === art.id;
                    const showSnippet =
                      !!search &&
                      !!art.content &&
                      art.content.toLowerCase().includes(search.toLowerCase());
                    return (
                      <React.Fragment key={art.id}>
                        <tr
                          onClick={() => setSelectedArticle(art)}
                          className={`hover:bg-blue-50/20 transition-colors cursor-pointer border-b border-neutral-100 ${
                            isSelected ? "bg-blue-50/40" : ""
                          } ${showSnippet ? "border-b-0" : ""}`}
                        >
                          <td className="px-6 py-3.5 text-center text-neutral-400 text-xs">
                            {index + 1}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-blue-600 hover:underline">
                            {art.kb_id}
                          </td>
                          <td
                            className="px-6 py-3.5 font-medium text-neutral-900 truncate max-w-xs"
                            title={art.title}
                          >
                            <HighlightText text={art.title} query={search} />
                          </td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadgeStyle(art.status)}`}
                            >
                              {art.status || "Draft"}
                            </span>
                          </td>
                          <td
                            className={`px-6 py-3.5 text-xs ${getPriorityStyle(art.priority)}`}
                          >
                            {art.priority || "Medium"}
                          </td>
                          <td className="px-6 py-3.5 text-neutral-500 text-xs">
                            {art.type || "Note"}
                          </td>
                          <td className="px-6 py-3.5 text-neutral-600 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                              <span>
                                <HighlightText
                                  text={art.category || "General"}
                                  query={search}
                                />
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-neutral-500 text-xs font-mono">
                            {new Date(art.created_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={(e) =>
                                handleDelete(art.id, art.title, e)
                              }
                              className="p-1 hover:bg-red-50 text-neutral-400 hover:text-red-600 rounded transition-colors"
                              title="Delete record"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {showSnippet && (
                          <tr>
                            <td
                              colSpan={9}
                              className="p-0 border-b border-neutral-100"
                            >
                              <ContentSnippets
                                content={art.content}
                                query={search}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Slide-over Side Drawer (ServiceNow Record Detail Panel) */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-neutral-900/30 backdrop-blur-xs cursor-pointer"
            onClick={() => setSelectedArticle(null)}
          ></div>

          {/* Drawer Body */}
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-neutral-200 z-10 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-6 py-4 bg-neutral-50 border-b border-neutral-200 flex justify-between items-center">
              <div>
                <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {selectedArticle.kb_id}
                </span>
                <h2
                  className="text-base font-bold text-neutral-800 mt-1 truncate max-w-md"
                  title={selectedArticle.title}
                >
                  {selectedArticle.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="p-1.5 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Metadata Section */}
            <div className="p-6 border-b border-neutral-100 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutral-400 block mb-0.5">Status</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadgeStyle(selectedArticle.status)}`}
                >
                  {selectedArticle.status}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">Priority</span>
                <span
                  className={`text-[11px] ${getPriorityStyle(selectedArticle.priority)}`}
                >
                  {selectedArticle.priority}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">
                  Source Domain
                </span>
                <span className="text-neutral-700 font-mono flex items-center gap-1">
                  {selectedArticle.domain || "Web Extract"}
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
                        className="text-blue-500 hover:underline"
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                </span>
              </div>
              <div>
                <span className="text-neutral-400 block mb-0.5">
                  Created Date
                </span>
                <span className="text-neutral-700 font-mono">
                  {new Date(selectedArticle.created_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Content Textarea Panel */}
            <div className="flex-1 p-6 flex flex-col gap-3 bg-neutral-50">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <FileText size={14} />
                <span className="font-bold uppercase tracking-wider">
                  Markdown Content Payload
                </span>
              </div>
              <textarea
                readOnly
                value={selectedArticle.content}
                className="w-full flex-grow p-4 text-xs font-mono text-neutral-800 bg-white border border-neutral-200 rounded-xl focus:outline-none shadow-inner leading-relaxed resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
