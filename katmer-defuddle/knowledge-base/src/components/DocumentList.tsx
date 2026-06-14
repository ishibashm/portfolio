"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useTransition,
  useRef,
} from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Filter,
  Search,
  ChevronRight,
  LayoutList,
  BookmarkPlus,
  BookmarkCheck,
  X,
  Download,
  Command,
  FileText,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import CategorizeButton from "@/app/[id]/CategorizeButton";
import DeleteButton from "@/app/[id]/DeleteButton";
import JSZip from "jszip";
import Fuse, { FuseResultMatch } from "fuse.js";
import { searchContent, downloadAllContents } from "@/app/actions";

type Document = {
  id: string;
  kb_id: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  category: string | null;
  created_at: Date;
  content?: string;
};

type SavedFilter = {
  id: string;
  name: string;
  query: string;
  category: string;
  status: string;
};

// --- Highlight Text Component ---
function HighlightText({
  text,
  matches,
  textKey,
}: {
  text: string;
  matches?: readonly FuseResultMatch[];
  textKey: string;
}) {
  if (!matches || matches.length === 0) return <>{text}</>;

  const match = matches.find((m) => m.key === textKey);
  if (!match || !match.indices || match.indices.length === 0)
    return <>{text}</>;

  const indices = match.indices;
  const parts: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;

  indices.forEach(([start, end]) => {
    if (start > lastIndex) {
      parts.push({ text: text.substring(lastIndex, start), highlight: false });
    }
    // Overlap prevention
    if (end >= lastIndex) {
      const s = Math.max(start, lastIndex);
      parts.push({ text: text.substring(s, end + 1), highlight: true });
      lastIndex = end + 1;
    }
  });

  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), highlight: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={i}
            className="bg-yellow-200/80 dark:bg-yellow-500/40 text-inherit rounded-sm px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

// --- Content Snippets Component (VS Code Style) ---
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
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

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
    startIndex = idx + 1; // 1文字ずつ進めて重複も見つけるか、または length だけ進める（今回は length にする方が自然だが、まあ 1 でも良い）
    if (mergedIndices.length > 50) break; // 無限ループ防止兼上限
  }

  if (mergedIndices.length === 0) return null;

  const displayIndices = mergedIndices.slice(0, maxSnippets);

  return (
    <div className="pl-[72px] py-2 bg-zinc-50/50 dark:bg-zinc-800/10 border-b border-zinc-100 dark:border-zinc-800/50">
      <div className="flex flex-col gap-1.5">
        {displayIndices.map(([start, end], i) => {
          // コンテキストを安全に取得
          let s = Math.max(0, start - contextLength);
          let e = Math.min(content.length, end + 1 + contextLength);

          // 改行を取り除いて1行にする
          const prefix = content.substring(s, start).replace(/[\r\n]+/g, " ");
          const hit = content
            .substring(start, end + 1)
            .replace(/[\r\n]+/g, " ");
          const suffix = content.substring(end + 1, e).replace(/[\r\n]+/g, " ");

          return (
            <div
              key={i}
              className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 group/snippet"
            >
              <FileText
                size={12}
                className="shrink-0 opacity-40 group-hover/snippet:text-blue-500 transition-colors"
              />
              <div className="truncate max-w-4xl cursor-default hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                <span className="opacity-50 tracking-widest mr-1">...</span>
                {prefix}
                <mark className="bg-yellow-200/80 dark:bg-yellow-500/40 text-inherit rounded-sm px-0.5 shadow-sm">
                  {hit}
                </mark>
                {suffix}
                <span className="opacity-50 tracking-widest ml-1">...</span>
              </div>
            </div>
          );
        })}
        {mergedIndices.length > maxSnippets && (
          <div className="text-[10px] text-zinc-400 italic pl-5 mt-1">
            ... and {mergedIndices.length - maxSnippets} more matching areas
          </div>
        )}
      </div>
    </div>
  );
}
// ------------------------------

export default function DocumentList({
  initialDocuments,
  initialQuery,
  initialCategory,
  initialStatus,
}: {
  initialDocuments: Document[];
  initialQuery?: string;
  initialCategory?: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery || "");
  const [deferredQuery, setDeferredQuery] = useState(initialQuery || "");
  const [isPending, startTransition] = useTransition();
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || "");
  const [statusFilter, setStatusFilter] = useState(initialStatus || "");

  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());

  // 追加: サーバーサイド本文検索の結果
  const [contentResults, setContentResults] = useState<
    { id: string; content: string }[]
  >([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);

  const [aiInsight, setAiInsight] = useState<{
    suggestions: string[];
    summary: string;
  } | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // Cmd+K / Ctrl+K ショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // LocalStorageから保存したフィルターを読み込む
  useEffect(() => {
    try {
      const stored = localStorage.getItem("katmer_saved_filters");
      if (stored) setSavedFilters(JSON.parse(stored));
    } catch (e) {}
  }, []);

  // 入力のデバウンス（タイピング中のカクつき防止）
  useEffect(() => {
    startTransition(() => {
      setDeferredQuery(query);
      setAiInsight(null); // クエリ変更時にAIインサイトをリセット
    });
  }, [query]);

  // フィルター状態が変わったら URL を同期させる（リロード・共有のため）
  useEffect(() => {
    const params = new URLSearchParams();
    if (deferredQuery) params.set("q", deferredQuery);
    if (categoryFilter) params.set("category", categoryFilter);
    if (statusFilter) params.set("status", statusFilter);
    const searchString = params.toString();
    const newUrl = searchString ? `${pathname}?${searchString}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [deferredQuery, categoryFilter, statusFilter, pathname, router]);

  // 本文(content)のサーバーサイド非同期検索
  useEffect(() => {
    if (deferredQuery && deferredQuery.length >= 2) {
      setIsSearchingContent(true);
      searchContent(deferredQuery, categoryFilter, statusFilter)
        .then((res) => {
          setContentResults(res);
        })
        .catch((e) => console.error(e))
        .finally(() => setIsSearchingContent(false));
    } else {
      setContentResults([]);
    }
  }, [deferredQuery, categoryFilter, statusFilter]);

  // Fuse.js のインスタンス生成
  const fuse = useMemo(() => {
    return new Fuse(initialDocuments, {
      keys: [
        { name: "title", weight: 2 },
        { name: "category", weight: 1 },
      ],
      includeMatches: true,
      threshold: 0.3,
      ignoreLocation: true,
    });
  }, [initialDocuments]);

  // クライアントサイドでの高度な検索・フィルタリング
  const searchResults = useMemo(() => {
    let docsWithMatches: {
      item: Document;
      matches?: readonly FuseResultMatch[];
      contentMatch?: string;
    }[] = [];

    if (deferredQuery) {
      const results = fuse.search(deferredQuery);
      docsWithMatches = results.map((res) => ({
        item: res.item,
        matches: res.matches,
      }));

      // サーバーサイド検索の本文マッチを統合
      if (contentResults.length > 0) {
        const existingIds = new Set(docsWithMatches.map((d) => d.item.id));
        contentResults.forEach((cr) => {
          if (cr.id.startsWith("obsidian_")) {
            const filePath = decodeURIComponent(cr.id.replace("obsidian_", ""));
            const fileName = filePath.split(/[\\/]/).pop() || "Unknown";
            const title = fileName.replace(/\.md$/i, "");
            docsWithMatches.push({
              item: {
                id: cr.id,
                kb_id: 0,
                title: `[Obsidian] ${title}`,
                status: "Local",
                priority: "None",
                type: "Markdown",
                category: "Vault",
                created_at: new Date(),
                content: cr.content,
              },
              contentMatch: cr.content,
            });
          } else if (!existingIds.has(cr.id)) {
            const doc = initialDocuments.find((d) => d.id === cr.id);
            if (doc) {
              docsWithMatches.push({ item: doc, contentMatch: cr.content });
            }
          } else {
            const match = docsWithMatches.find((d) => d.item.id === cr.id);
            if (match) {
              match.contentMatch = cr.content;
            }
          }
        });
      }
    } else {
      docsWithMatches = initialDocuments.map((doc) => ({ item: doc }));
    }

    if (categoryFilter) {
      docsWithMatches = docsWithMatches.filter(
        (res) => res.item.category === categoryFilter,
      );
    }

    if (statusFilter) {
      docsWithMatches = docsWithMatches.filter(
        (res) => res.item.status === statusFilter,
      );
    } else {
      docsWithMatches = docsWithMatches.filter(
        (res) => res.item.status !== "Archived",
      );
    }

    return docsWithMatches;
  }, [
    initialDocuments,
    fuse,
    deferredQuery,
    categoryFilter,
    statusFilter,
    contentResults,
  ]);

  // AI Insight Generator
  const generateAiInsight = async () => {
    if (!deferredQuery || isGeneratingInsight) return;
    setIsGeneratingInsight(true);
    setAiInsight(null);

    // 検索にヒットしたコンテンツを集める (最大5件程度、長すぎるとAPIが死ぬので)
    const contextLimit = 3000;
    let combinedContext = "";

    // docsWithMatches から本文マッチまたはタイトルを抽出
    for (const match of searchResults.slice(0, 5)) {
      combinedContext += `Title: ${match.item.title}\n`;
      if (match.contentMatch) {
        combinedContext += `Content Snippet: ${match.contentMatch.substring(0, 500)}\n`;
      }
      combinedContext += `---\n`;
      if (combinedContext.length > contextLimit) {
        combinedContext = combinedContext.substring(0, contextLimit);
        break;
      }
    }

    try {
      const res = await fetch("/kb/api/ai/search-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: deferredQuery,
          contexts: combinedContext,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsight(data);
      } else {
        console.error("AI Insight failed", await res.text());
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const saveCurrentFilter = () => {
    if (!query && !categoryFilter && !statusFilter) return;
    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: query || categoryFilter || statusFilter || "Custom Filter",
      query,
      category: categoryFilter,
      status: statusFilter,
    };
    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem("katmer_saved_filters", JSON.stringify(updated));
  };

  const removeFilter = (id: string) => {
    const updated = savedFilters.filter((f) => f.id !== id);
    setSavedFilters(updated);
    localStorage.setItem("katmer_saved_filters", JSON.stringify(updated));
  };

  const applyFilter = (f: SavedFilter) => {
    setQuery(f.query);
    setCategoryFilter(f.category);
    setStatusFilter(f.status);
  };

  // 選択操作
  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedDocs);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedDocs(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedDocs.size === searchResults.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(searchResults.map((res) => res.item.id)));
    }
  };

  // ZIP一括ダウンロード
  const handleDownloadSelected = async () => {
    if (selectedDocs.size === 0) return;

    try {
      const idsToDownload = Array.from(selectedDocs);
      const dbIds = idsToDownload.filter((id) => !id.startsWith("obsidian_"));
      const obsidianIds = idsToDownload.filter((id) =>
        id.startsWith("obsidian_"),
      );

      // 1. Fetch DB documents
      const dbDocs = dbIds.length > 0 ? await downloadAllContents(dbIds) : [];

      // 2. Fetch Obsidian local documents directly from current search results
      const obsidianDocs = obsidianIds.map((id) => {
        const match = searchResults.find((res) => res.item.id === id);
        return {
          id: match?.item.id || id,
          kb_id: match?.item.kb_id || 0,
          title: match?.item.title || "Local_Document",
          content:
            match?.item.content ||
            match?.contentMatch ||
            "# No Content\n\nFailed to load local document.",
        };
      });

      const fullDocs = [...dbDocs, ...obsidianDocs];

      const zip = new JSZip();
      const folder = zip.folder("Katmer_Export");

      fullDocs.forEach((doc) => {
        // Remove newlines and reserved characters from title, and limit length to avoid Windows path length issues
        let safeTitle = doc.title.replace(/[\r\n\t\\/:*?"<>|]/g, "_").trim();
        if (safeTitle.length > 100) safeTitle = safeTitle.substring(0, 100);
        if (!safeTitle) safeTitle = `Document_${doc.kb_id || doc.id}`;

        folder?.file(
          `${safeTitle}.md`,
          doc.content || `# ${doc.title}\n\n(No content)`,
        );
      });

      // Use uint8array and specify application/zip to ensure Windows compatibility
      const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 5 },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Katmer_Export_${format(new Date(), "yyyyMMdd_HHmmss")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate zip file", error);
      alert("Failed to create ZIP archive.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "published":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "review":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      default:
        return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "high":
        return "text-red-600 dark:text-red-400 font-semibold";
      case "low":
        return "text-blue-600 dark:text-blue-400";
      default:
        return "text-orange-600 dark:text-orange-400";
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Search & Header Workspace */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex flex-col gap-4 shadow-sm z-10">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
              <LayoutList size={24} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                ITSM / Knowledge Repository
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                All Active Records • {searchResults.length} items
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {selectedDocs.size > 0 && (
              <button
                onClick={handleDownloadSelected}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm rounded-md font-medium transition-colors"
                title={`Download ${selectedDocs.size} documents as ZIP`}
              >
                <Download size={16} />
                <span>Export ({selectedDocs.size})</span>
              </button>
            )}
            <div className="flex bg-zinc-100 dark:bg-zinc-900 rounded-md p-1 border border-zinc-200 dark:border-zinc-800">
              <div className="px-4 py-1.5 text-sm font-medium rounded-sm bg-white dark:bg-zinc-800 shadow-sm text-blue-600 dark:text-blue-400">
                List
              </div>
              <Link
                href="/graph"
                className="px-4 py-1.5 text-sm font-medium rounded-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Map
              </Link>
            </div>
            <Link
              href="/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm rounded-md font-medium transition-colors"
            >
              <Plus size={16} />
              <span>New Record</span>
            </Link>
          </div>
        </div>

        {/* Filters and Semantic Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-grow w-full flex items-center bg-zinc-100 dark:bg-zinc-800/50 rounded-md border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-zinc-900 transition-all">
            <Search className="absolute left-3 text-zinc-400" size={16} />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fuzzy Search by Title, Category or Content..."
              className="w-full pl-9 pr-14 py-2 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            />
            <div className="absolute right-3 flex items-center pointer-events-none">
              <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 shadow-sm">
                <Command size={10} />K
              </kbd>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto text-sm text-zinc-600 dark:text-zinc-300">
            <Filter size={16} className="text-zinc-400" />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSelectedDocs(new Set());
              }}
              className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded outline-none cursor-pointer"
            >
              <option value="">All Categories</option>
              <option value="AI_Image_Video">AI_Image_Video</option>
              <option value="AI_Agents_LLM">AI_Agents_LLM</option>
              <option value="Cloud_Infra">Cloud_Infra</option>
              <option value="Data_Tech">Data_Tech</option>
              <option value="Others">Others</option>
            </select>
            <ChevronRight size={14} className="text-zinc-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setSelectedDocs(new Set());
              }}
              className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded outline-none cursor-pointer"
            >
              <option value="">All Statuses (!Archived)</option>
              <option value="Inbox">Inbox</option>
              <option value="Literature">Literature</option>
              <option value="Permanent">Permanent</option>
              <option value="Draft">Draft</option>
            </select>

            {/* Save Filter Button */}
            {(query || categoryFilter || statusFilter) && (
              <button
                onClick={saveCurrentFilter}
                className="ml-2 p-1.5 text-zinc-400 hover:text-blue-500 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors"
                title="Save current filter"
              >
                <BookmarkPlus size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Saved Filters Row */}
        {savedFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <BookmarkCheck size={14} /> Saved Filters:
            </span>
            {savedFilters.map((f) => (
              <div
                key={f.id}
                className="flex items-center text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-full"
              >
                <button
                  onClick={() => applyFilter(f)}
                  className="px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-l-full transition-colors truncate max-w-[120px]"
                  title={`Query: ${f.query || "-"} | Category: ${f.category || "All"} | Status: ${f.status || "All"}`}
                >
                  {f.name}
                </button>
                <button
                  onClick={() => removeFilter(f.id)}
                  className="pr-2 pl-1 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-r-full text-blue-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {/* AI Search Enhancement Row */}
        {deferredQuery && searchResults.length > 0 && (
          <div className="mt-2 border border-blue-200/50 dark:border-blue-900/30 rounded-lg p-3 sm:p-4 bg-gradient-to-br from-blue-50/40 to-indigo-50/40 dark:from-blue-900/10 dark:to-indigo-900/10 transition-all">
            {!aiInsight ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    AI Insight
                  </span>{" "}
                  : 検索結果「{deferredQuery}」についてGenerative
                  AIで分析・要約しますか？
                </p>
                <button
                  onClick={generateAiInsight}
                  disabled={isGeneratingInsight}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-sm transition-all"
                >
                  {isGeneratingInsight ? (
                    <span className="animate-spin text-lg leading-none shrink-0 mb-1">
                      ⟳
                    </span>
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {isGeneratingInsight ? "Analyzing..." : "Generate Insight"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-500" /> AI Summary
                    & Suggestions
                  </h3>
                  <button
                    onClick={() => setAiInsight(null)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X size={14} />
                  </button>
                </div>

                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {aiInsight.summary}
                </p>

                {aiInsight.suggestions && aiInsight.suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 pt-3 border-t border-blue-100 dark:border-blue-800/50">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Related Searches:
                    </span>
                    {aiInsight.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQuery(s);
                          setAiInsight(null);
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Grid / List View */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden min-w-[800px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-800/20 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      searchResults.length > 0 &&
                      selectedDocs.size === searchResults.length
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Select/Deselect All currently visible"
                  />
                </th>
                <th className="px-4 py-3 font-mono">Number</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {searchResults.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    No records found matching your query.
                  </td>
                </tr>
              ) : (
                searchResults.map(({ item: doc, matches, contentMatch }) => {
                  const showSnippet = !!contentMatch && !!deferredQuery;

                  return (
                    <React.Fragment key={doc.id}>
                      <tr
                        className={`transition-colors group ${selectedDocs.has(doc.id) ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/20"} ${showSnippet ? "border-b-0" : "border-b border-zinc-100 dark:border-zinc-800/50"}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedDocs.has(doc.id)}
                            onChange={() => toggleSelection(doc.id)}
                            className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-blue-600 dark:text-blue-400">
                          <Link
                            href={`/${doc.id}`}
                            className="hover:underline flex items-center gap-1"
                          >
                            KB{String(doc.kb_id).padStart(7, "0")}
                            {contentMatch && (
                              <span
                                className="w-4 h-4 flex items-center justify-center bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 rounded-full text-[9px] font-bold"
                                title="Content Match"
                              >
                                ★
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 max-w-xs truncate">
                          <div className="flex flex-col gap-0.5">
                            <Link
                              href={`/${doc.id}`}
                              className="hover:underline"
                            >
                              <HighlightText
                                text={doc.title}
                                matches={matches}
                                textKey="title"
                              />
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}
                          >
                            {doc.status || "Draft"}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 ${getPriorityColor(doc.priority)}`}
                        >
                          {doc.priority || "Medium"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {doc.type || "Note"}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                            <span className="truncate max-w-[120px]">
                              <HighlightText
                                text={doc.category || "General"}
                                matches={matches}
                                textKey="category"
                              />
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                          {format(new Date(doc.created_at), "yyyy-MM-dd HH:mm")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-50 sm:group-hover:opacity-100 transition-opacity">
                            <CategorizeButton id={doc.id} isCompact={true} />
                            <DeleteButton id={doc.id} isCompact={true} />
                          </div>
                        </td>
                      </tr>
                      {/* Snippet Row (VS Code Style) */}
                      {showSnippet && (
                        <tr>
                          <td
                            colSpan={9}
                            className="p-0 border-b border-zinc-200 dark:border-zinc-800"
                          >
                            <ContentSnippets
                              content={contentMatch}
                              query={deferredQuery}
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
    </div>
  );
}
