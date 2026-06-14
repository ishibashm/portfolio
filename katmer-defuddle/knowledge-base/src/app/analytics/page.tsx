"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Hash,
  Layers,
  Calendar,
  ArrowLeft,
  BrainCircuit,
  Sparkles,
  BookOpen,
  Network,
  FileTerminal,
  BookMarked,
} from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type KeywordData = { text: string; value: number };
type CategoryData = { name: string; count: number };
type AnalyticsData = {
  generatedAt: string;
  totalDocuments: number;
  topKeywords: KeywordData[];
  categoryDistribution: CategoryData[];
};

type WikiConsoleData = {
  indexMarkdown: string;
  logMarkdown: string;
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [wikiData, setWikiData] = useState<WikiConsoleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/kb/api/analytics").then((res) => res.json()),
      fetch("/kb/api/wiki-console").then((res) => res.json()),
    ])
      .then(([analyticsJson, wikiJson]) => {
        setData(analyticsJson);
        setWikiData(wikiJson);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const generateMetanalysis = () => {
    if (isGeneratingInsight) return;
    setIsGeneratingInsight(true);
    fetch("/kb/api/analytics/insights")
      .then((res) => res.json())
      .then((json) => {
        if (json.insightMarkdown) {
          setAiInsight(json.insightMarkdown);
        } else {
          setAiInsight("Failed to generate insights.");
        }
      })
      .catch((err) => {
        console.error(err);
        setAiInsight("Error occurred while generating AI insights.");
      })
      .finally(() => {
        setIsGeneratingInsight(false);
      });
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="animate-pulse text-zinc-500">
          Loading LLM Wiki Console...
        </div>
      </div>
    );
  }

  if (!data || !data.generatedAt) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 flex-col gap-4">
        <div className="text-zinc-500">
          Analytics data is not available yet.
        </div>
        <p className="text-sm text-zinc-400">
          Run the extraction script to generate data.
        </p>
      </div>
    );
  }

  const maxKeywordValue = Math.max(...data.topKeywords.map((k) => k.value));
  const maxCategoryCount = Math.max(
    ...data.categoryDistribution.map((c) => c.count),
  );

  // Auto-Librarian log parsing (simple reverse timeline)
  const recentLogs =
    wikiData?.logMarkdown
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(-20)
      .reverse()
      .join("\n") || "No recent activity.";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/"
                className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <BookMarked
                  className="text-indigo-600 dark:text-indigo-500"
                  size={32}
                />
                LLM Wiki Console
              </h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 ml-12">
              Explore your AI-organized knowledge tree and discover insights
              through meta-analysis.
            </p>
          </div>

          {/* System Links (Graphify / Wiki) */}
          <div className="flex items-center gap-3 ml-12 md:ml-0">
            <Link
              href="/wiki"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <BookOpen size={16} />
              Browse Full Wiki
            </Link>
            <Link
              href="/system-graph"
              className="flex items-center gap-2 px-4 py-2 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded-lg text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors"
            >
              <Network size={16} />
              System Graph Map
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Column: AI Meta-Analyst & Wiki Tree */}
          <div className="lg:col-span-8 space-y-8">
            {/* AI Insight Panel */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                <BrainCircuit size={120} />
              </div>

              <div className="flex items-center justify-between mb-6 relative z-10">
                <h2 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                  <Sparkles className="text-yellow-500" size={24} />
                  AI Meta-Analyst: Knowledge Gap Discovery
                </h2>
                {!aiInsight && (
                  <button
                    onClick={generateMetanalysis}
                    disabled={isGeneratingInsight}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50"
                  >
                    {isGeneratingInsight
                      ? "Running RAG Analysis..."
                      : "Run Meta-Analysis"}
                  </button>
                )}
              </div>

              <div className="relative z-10">
                {!aiInsight ? (
                  <div className="py-8 text-center text-indigo-700/60 dark:text-indigo-400/60">
                    {isGeneratingInsight
                      ? "Gemma4 is reading your knowledge base profile, LLM Wiki index, and pulling latest web trends via MCP. Please wait..."
                      : "Click the button above to let AI analyze your strengths, compare with live internet trends, and suggest what to learn next."}
                  </div>
                ) : (
                  <div className="prose prose-sm dark:prose-invert prose-indigo max-w-none prose-headings:font-bold prose-h1:text-xl prose-p:leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiInsight}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </div>

            {/* Knowledge Ontology Tree (index.md) */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Layers className="text-teal-500" />
                  Knowledge Ontology Tree
                </h2>
                <span className="text-xs px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded font-mono">
                  llm-wiki/index.md
                </span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none prose-ul:list-disc prose-li:my-1 h-[300px] overflow-y-auto pr-2 custom-scrollbar bg-zinc-50 dark:bg-zinc-950 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, href, children, ...props }) => {
                      if (href && !href.startsWith("http")) {
                        // Wiki内のローカルリンクを正しく /wiki?path= に向ける
                        const cleanPath = href.replace(/^\/?(wiki\/)?/, ""); // "wiki/" のプレフィックスがあれば取る
                        const newHref = `/wiki?path=${encodeURIComponent(`wiki/${cleanPath}`)}`;
                        return (
                          <Link
                            href={newHref}
                            className="text-blue-500 hover:underline"
                            {...props}
                          >
                            {children}
                          </Link>
                        );
                      }
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {wikiData?.indexMarkdown || "No data."}
                </ReactMarkdown>
              </div>
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">
                  This tree is autonomously generated and maintained by the
                  Gemma4 Auto-Librarian agent based on your raw document inputs.
                </p>
              </div>
            </div>
          </div>

          {/* Right Sidebar Column: Auto-Librarian Log & Stats */}
          <div className="lg:col-span-4 space-y-8">
            {/* Auto-Librarian Activity Log */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 shadow-sm font-mono relative overflow-hidden group">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-green-500 border-b border-zinc-800 pb-3">
                <FileTerminal size={16} />
                Agent Activity Log
              </h2>
              <div className="text-xs text-green-400/80 whitespace-pre-wrap h-[200px] overflow-y-auto leading-relaxed custom-scrollbar pb-8">
                {recentLogs}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
            </div>

            {/* Keyword Tag Cloud (Secondary) */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-zinc-500 uppercase tracking-wider">
                <Hash size={16} />
                Top Keywords
              </h2>
              <div className="flex flex-wrap gap-2">
                {data.topKeywords.slice(0, 30).map((kw, i) => {
                  const sizeRatio = Math.max(0.3, kw.value / maxKeywordValue);
                  const opacity = 0.5 + sizeRatio * 0.5;
                  return (
                    <Link
                      key={i}
                      href={`/?q=${encodeURIComponent(kw.text)}`}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-xs"
                      style={{ opacity }}
                    >
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {kw.text}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {kw.value}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Category Distribution */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-zinc-500 uppercase tracking-wider">
                <Layers size={16} />
                Category Distribution
              </h2>
              <div className="space-y-4">
                {data.categoryDistribution.map((cat, i) => {
                  const widthPct = Math.max(
                    2,
                    (cat.count / maxCategoryCount) * 100,
                  );
                  const colors = [
                    "bg-blue-500",
                    "bg-emerald-500",
                    "bg-orange-500",
                    "bg-purple-500",
                  ];
                  const barColor = colors[i % colors.length];

                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between items-end">
                        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {cat.name}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {cat.count} docs
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barColor} rounded-full`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
