"use client";

import React, { useState, useEffect } from "react";
import {
  Rss,
  Mail,
  ExternalLink,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Globe,
  Cpu,
  Layers,
  Wifi,
  Zap,
  Terminal,
} from "lucide-react";

interface Article {
  title: string;
  link: string;
}

interface GroupedArticles {
  [source: string]: Article[];
}

export default function TrendsPage() {
  const [groupedArticles, setGroupedArticles] =
    useState<GroupedArticles | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Newsletter form states
  const [email, setEmail] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [submitMessage, setSubmitMessage] = useState<string>("");

  // Tab state: "All" or a specific source name
  const [activeTab, setActiveTab] = useState<string>("All");

  // Fetch articles from our API route proxy
  const fetchTrends = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/trends");
      if (!res.ok) {
        throw new Error(`エラーステータス: ${res.status}`);
      }
      const data = await res.json();
      if (data.status === "error") {
        throw new Error(data.message || "データの取得に失敗しました。");
      }
      setGroupedArticles(data);
    } catch (err: any) {
      console.error("Failed to fetch trends:", err);
      setFetchError(
        err.message ||
          "記事データの取得中にエラーが発生しました。時間をおいて再度お試しください。",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  // Handle newsletter signup
  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;

    setSubmitting(true);
    setSubmitStatus("idle");
    setSubmitMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || data.error || "登録処理に失敗しました。",
        );
      }

      setSubmitStatus("success");
      setSubmitMessage(data.message || "購読登録ありがとうございます！");
      setEmail("");
    } catch (err: any) {
      setSubmitStatus("error");
      setSubmitMessage(err.message || "登録中にエラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  };

  // Get list of all available tabs (sources)
  const sources = groupedArticles
    ? Object.keys(groupedArticles).filter((key) =>
        Array.isArray(groupedArticles[key]),
      )
    : [];

  // Helper to color source tags and borders dynamically
  const getSourceDetails = (source: string) => {
    if (source.includes("Zenn")) {
      return {
        color: "rgb(56, 189, 248)", // sky-400
        bg: "rgba(56, 189, 248, 0.05)",
        border: "rgba(56, 189, 248, 0.15)",
        name: "Zenn",
      };
    }
    if (source.includes("Qiita")) {
      return {
        color: "rgb(52, 211, 153)", // emerald-400
        bg: "rgba(52, 211, 153, 0.05)",
        border: "rgba(52, 211, 153, 0.15)",
        name: "Qiita",
      };
    }
    if (source.includes("はてな")) {
      return {
        color: "rgb(96, 165, 250)", // blue-400
        bg: "rgba(96, 165, 250, 0.05)",
        border: "rgba(96, 165, 250, 0.15)",
        name: "Hatena",
      };
    }
    if (source.includes("Publickey")) {
      return {
        color: "rgb(251, 191, 36)", // amber-400
        bg: "rgba(251, 191, 36, 0.05)",
        border: "rgba(251, 191, 36, 0.15)",
        name: "Publickey",
      };
    }
    if (source.includes("DevelopersIO")) {
      return {
        color: "rgb(248, 113, 113)", // rose-400
        bg: "rgba(248, 113, 113, 0.05)",
        border: "rgba(248, 113, 113, 0.15)",
        name: "Developers.IO",
      };
    }
    return {
      color: "rgb(168, 85, 247)", // purple-400
      bg: "rgba(168, 85, 247, 0.05)",
      border: "rgba(168, 85, 247, 0.15)",
      name: source,
    };
  };

  // Filter or flatten articles
  const getDisplayedArticles = () => {
    if (!groupedArticles || typeof groupedArticles !== "object") return [];

    if (activeTab === "All") {
      // Flatten all articles safely
      const all: (Article & { source: string })[] = [];
      Object.entries(groupedArticles).forEach(([source, list]) => {
        if (Array.isArray(list)) {
          list.forEach((article) => {
            if (
              article &&
              typeof article === "object" &&
              "title" in article &&
              "link" in article
            ) {
              all.push({ ...article, source });
            }
          });
        }
      });

      // Safely compute the max length of array lists
      const lengths = Object.values(groupedArticles)
        .filter(Array.isArray)
        .map((l) => l.length);
      const maxLen = lengths.length > 0 ? Math.max(...lengths) : 0;

      const interleaved: (Article & { source: string })[] = [];
      for (let i = 0; i < maxLen; i++) {
        Object.entries(groupedArticles).forEach(([source, list]) => {
          if (Array.isArray(list) && list[i]) {
            const article = list[i];
            if (
              article &&
              typeof article === "object" &&
              "title" in article &&
              "link" in article
            ) {
              interleaved.push({ ...article, source });
            }
          }
        });
      }
      return interleaved;
    } else {
      const list = groupedArticles[activeTab];
      if (!Array.isArray(list)) return [];
      return list
        .filter(
          (article) =>
            article &&
            typeof article === "object" &&
            "title" in article &&
            "link" in article,
        )
        .map((article) => ({ ...article, source: activeTab }));
    }
  };

  const displayedArticles = getDisplayedArticles();

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[color-mix(in_srgb,var(--color-accent,#10b981)_30%,transparent)] font-sans relative overflow-hidden flex flex-col">
      {/* Background Liquid Glass Glows */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-[120px] -z-10 pointer-events-none transition-all duration-1000"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--glow-color, #10b981) 8%, transparent)",
        }}
      />
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full blur-[150px] -z-10 pointer-events-none transition-all duration-1000"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-accent, #10b981) 6%, transparent)",
        }}
      />

      <main className="flex-grow max-w-[1400px] w-full mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header
          className="relative mb-12 p-6 md:p-8 rounded-2xl border bg-white/[0.01] backdrop-blur-md overflow-hidden"
          style={{
            borderColor: "rgba(255, 255, 255, 0.05)",
          }}
        >
          {/* Cyber Decorative Lines */}
          <div
            className="absolute top-0 left-0 w-full h-[1px] opacity-70"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent, #10b981) 30%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <div
            className="absolute top-0 left-8 w-[1px] h-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 50%, transparent)",
            }}
          />
          <div
            className="absolute bottom-0 right-8 w-[1px] h-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-accent, #10b981) 30%, transparent)",
            }}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="relative flex h-2 w-2">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-2 w-2"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                </span>
                <span
                  className="text-xs font-mono tracking-widest uppercase font-semibold flex items-center gap-1.5"
                  style={{ color: "var(--color-accent, #10b981)" }}
                >
                  <Wifi className="w-3 h-3 animate-pulse" /> Telemetry Stream
                  Aggregator
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter bg-gradient-to-r from-white via-zinc-100 to-[color-mix(in_srgb,var(--color-accent,#10b981)_60%,white)] bg-clip-text text-transparent">
                Tech Trend Center
              </h1>
              <p className="text-zinc-400 mt-3 max-w-2xl text-sm md:text-base font-light leading-relaxed">
                Zenn、Qiita、はてな、Publickeyなどの複数ソースから最新トレンド技術記事を収集。
                毎日の要約を日刊まとめメールとしてお届けします。
              </p>
            </div>

            {/* Quick telemetry metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between min-w-[120px]">
                <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
                  Node Status
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400 mt-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between min-w-[120px]">
                <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
                  Active Sources
                </span>
                <span className="text-sm font-bold font-mono text-white mt-1">
                  {sources.length || "6"} feeds
                </span>
              </div>
              <div className="p-3 bg-black/40 border border-white/5 rounded-xl flex flex-col justify-between min-w-[120px] col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
                  Cycle Interval
                </span>
                <span
                  className="text-xs font-bold font-mono mt-1"
                  style={{ color: "var(--color-accent, #10b981)" }}
                >
                  60m Ingestion
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main Feed Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Feed Tabs Selector */}
            <div className="p-1.5 rounded-2xl bg-white/[0.01] border border-white/5 backdrop-blur-sm flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTab("All")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wide border transition-all relative ${
                  activeTab === "All"
                    ? "bg-white/5 border-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] font-bold"
                    : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                }`}
              >
                {activeTab === "All" && (
                  <span
                    className="absolute inset-0 rounded-xl border -m-[1px]"
                    style={{ borderColor: "var(--color-accent, #10b981)" }}
                  />
                )}
                <span
                  className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: "var(--color-accent, #10b981)",
                    boxShadow:
                      activeTab === "All"
                        ? "0 0 8px var(--color-accent, #10b981)"
                        : "none",
                  }}
                />
                All Feeds
              </button>
              {sources.map((source) => {
                const isActive = activeTab === source;
                const details = getSourceDetails(source);

                return (
                  <button
                    key={source}
                    onClick={() => setActiveTab(source)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wide border transition-all relative ${
                      isActive
                        ? "bg-white/5 border-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)] font-bold"
                        : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-xl border -m-[1px]"
                        style={{ borderColor: details.color }}
                      />
                    )}
                    <span
                      className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: details.color,
                        boxShadow: isActive
                          ? `0 0 8px ${details.color}`
                          : "none",
                      }}
                    />
                    {details.name}
                  </button>
                );
              })}
            </div>

            {/* Articles List / Grid */}
            {loading ? (
              // Skeleton Loader
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 animate-pulse flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-[3px] h-full bg-white/5" />
                    <div className="space-y-3 flex-1 pl-2">
                      <div className="h-5 bg-white/5 rounded-md w-11/12" />
                      <div className="flex items-center gap-3">
                        <div className="h-4 bg-white/5 rounded-md w-16" />
                        <div className="h-3 bg-white/5 rounded-md w-24" />
                      </div>
                    </div>
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-white/5 border border-white/5" />
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              // Error State
              <div className="p-8 rounded-2xl bg-rose-500/[0.02] border border-rose-500/20 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-rose-400 mx-auto animate-bounce" />
                <div>
                  <h3 className="text-base font-bold font-mono text-rose-200 uppercase tracking-widest">
                    ⚠️ Telemetry Connection Error
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono mt-1">
                    [ERR_FEED_INGESTION_FAILED]
                  </p>
                </div>
                <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                  {fetchError}
                </p>
                <button
                  onClick={fetchTrends}
                  className="mt-2 px-5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 font-mono uppercase tracking-wider transition-all duration-300"
                >
                  &gt; RETRY_STREAM_SYNC
                </button>
              </div>
            ) : displayedArticles.length === 0 ? (
              // Empty State
              <div className="p-12 rounded-2xl bg-white/[0.01] border border-white/5 text-center space-y-2">
                <p className="text-sm text-zinc-500 font-mono uppercase tracking-wider">
                  {"// NO_ACTIVE_TELEMETRY_LOGS"}
                </p>
                <p className="text-sm text-zinc-400">
                  表示する記事がありません。
                </p>
              </div>
            ) : (
              // Article Cards
              <div className="space-y-4">
                {displayedArticles.map((article, idx) => {
                  const details = getSourceDetails(article.source);
                  return (
                    <article
                      key={idx}
                      className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 transition-all duration-300 hover:-translate-y-[2px] group relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      style={{
                        contentVisibility: "auto",
                      }}
                    >
                      {/* Hover Glow Effect */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none -z-10"
                        style={{
                          background: `linear-gradient(90deg, color-mix(in srgb, ${details.color} 4%, transparent), transparent)`,
                        }}
                      />

                      {/* Source Color Side Accent Indicator */}
                      <div
                        className="absolute top-0 left-0 w-[3px] h-full transition-all duration-300 group-hover:h-full"
                        style={{
                          backgroundColor: details.color,
                          boxShadow: `0 0 10px ${details.color}`,
                        }}
                      />

                      <div className="space-y-3 flex-1 pl-2">
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-zinc-100 group-hover:text-white transition-colors leading-snug line-clamp-2 block hover:underline text-base md:text-lg"
                        >
                          {article.title}
                        </a>

                        <div className="flex items-center gap-3">
                          {/* Source Badge with Glow */}
                          <span
                            className="text-[10px] px-2.5 py-0.5 rounded-md border font-mono uppercase tracking-wider font-semibold"
                            style={{
                              color: details.color,
                              backgroundColor: details.bg,
                              borderColor: details.border,
                            }}
                          >
                            {details.name}
                          </span>

                          <span className="text-[10px] text-zinc-600 font-mono">
                            {"// FEED_REF:0"}
                            {idx + 1}
                          </span>
                        </div>
                      </div>

                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-400 group-hover:text-white transition-all duration-300"
                        style={{
                          borderColor:
                            "color-mix(in srgb, var(--color-accent, #10b981) 10%, rgba(255,255,255,0.05))",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "var(--color-accent, #10b981)";
                          e.currentTarget.style.borderColor =
                            "var(--color-accent, #10b981)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "rgba(255, 255, 255, 0.05)";
                          e.currentTarget.style.borderColor =
                            "color-mix(in srgb, var(--color-accent, #10b981) 10%, rgba(255,255,255,0.05))";
                        }}
                        title="記事を読む"
                      >
                        <ExternalLink
                          size={16}
                          className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300"
                        />
                      </a>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Newsletter Console Column */}
          <div className="space-y-6">
            {/* Newsletter Glassmorphic Box */}
            <div
              className="p-6 rounded-2xl bg-white/[0.01] border backdrop-blur-md relative overflow-hidden transition-all duration-300"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--color-accent, #10b981) 15%, rgba(255,255,255,0.05))",
              }}
            >
              {/* Subtle top light bar */}
              <div
                className="absolute top-0 left-0 w-full h-[2px] opacity-70"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, var(--color-accent, #10b981), transparent)",
                }}
              />

              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-500"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--color-accent, #10b981) 8%, transparent)",
                    borderColor:
                      "color-mix(in srgb, var(--color-accent, #10b981) 25%, transparent)",
                  }}
                >
                  <Mail
                    className="w-5 h-5"
                    style={{ color: "var(--color-accent, #10b981)" }}
                  />
                </div>
                <div>
                  <h2 className="text-sm font-mono tracking-wider text-zinc-500 uppercase">
                    {"// Uplink Console"}
                  </h2>
                  <h3 className="text-lg font-bold tracking-tight text-white">
                    日刊メール購読
                  </h3>
                </div>
              </div>

              <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                毎朝、ZennやQiitaなどの最新トレンド上位3記事をHTML形式の要約メールでお届けします。
              </p>

              {submitStatus === "success" ? (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="font-mono text-xs uppercase tracking-wider font-bold">
                      UPLINK_ESTABLISHED
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {submitMessage}
                  </p>
                  <button
                    onClick={() => setSubmitStatus("idle")}
                    className="text-xs text-emerald-400 hover:underline pt-1 block font-mono"
                  >
                    &gt; REGISTER_NEW_NODE
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="text-[10px] text-zinc-500 uppercase tracking-widest block font-mono"
                    >
                      Target Node Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/5 text-white placeholder-zinc-700 focus:outline-none text-sm font-mono transition-all"
                      style={{
                        borderColor: "rgba(255, 255, 255, 0.05)",
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor =
                          "var(--color-accent, #10b981)";
                        e.target.style.boxShadow =
                          "0 0 10px color-mix(in srgb, var(--color-accent, #10b981) 15%, transparent)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor =
                          "rgba(255, 255, 255, 0.05)";
                        e.target.style.boxShadow = "none";
                      }}
                    />
                  </div>

                  {submitStatus === "error" && (
                    <div className="flex items-start gap-2 text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span className="text-xs font-mono leading-normal">
                        ERR: {submitMessage}
                      </span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-mono text-xs uppercase tracking-widest font-bold transition-all cursor-pointer"
                    style={{
                      backgroundColor: "var(--color-accent, #10b981)",
                      boxShadow:
                        "0 4px 20px color-mix(in srgb, var(--color-accent, #10b981) 20%, transparent)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.filter = "brightness(1.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.filter = "none";
                    }}
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={16} />
                        <span>ESTABLISH_UPLINK</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Console Details List */}
              <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                <div className="flex gap-3 items-start">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 animate-pulse"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <div>
                    <h4 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wide">
                      FILTERED_SELECT_NODES
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                      重要かつ高品質なトレンド情報（各ソースから上位3本）のみに絞り込んで配信します。
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 animate-pulse"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <div>
                    <h4 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wide">
                      ENCRYPTED_DELIVERY
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                      Bccで一元管理して一括送信されるため、他ノードからアドレス情報が漏洩することはありません。
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-2 shrink-0 animate-pulse"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  <div>
                    <h4 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wide">
                      TERMINATE_SESSION_ANYTIME
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                      受信したメールに返信するだけで、配信システムとの接続はいつでも即座に破棄できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Analytics Console */}
            <div
              className="p-6 rounded-2xl bg-white/[0.01] border flex flex-col gap-4"
              style={{
                borderColor: "rgba(255, 255, 255, 0.05)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp
                    className="w-4 h-4"
                    style={{ color: "var(--color-accent, #10b981)" }}
                  />
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono font-bold">
                    Signal Ingestion Telemetry
                  </span>
                </div>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1"
                  style={{
                    color: "var(--color-accent, #10b981)",
                    backgroundColor:
                      "color-mix(in srgb, var(--color-accent, #10b981) 8%, transparent)",
                    borderColor:
                      "color-mix(in srgb, var(--color-accent, #10b981) 25%, transparent)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full animate-ping"
                    style={{ backgroundColor: "var(--color-accent, #10b981)" }}
                  />
                  ACTIVE_FEED
                </span>
              </div>

              {/* Simulated Waveform Visualizer */}
              <div className="h-16 w-full bg-black/40 border border-white/5 rounded-xl relative overflow-hidden flex items-end justify-between px-4 py-2 gap-[2px]">
                {/* Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:8px_8px] pointer-events-none" />

                {/* 16 Telemetry Wave Columns with staggered breathe animations */}
                {[
                  45, 60, 30, 75, 40, 85, 50, 70, 95, 35, 60, 45, 80, 55, 75,
                  40,
                ].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all duration-1000"
                    style={{
                      height: `${h}%`,
                      backgroundColor: "var(--color-accent, #10b981)",
                      opacity: 0.15 + (i % 3) * 0.15,
                      animation: "breathe 3s ease-in-out infinite",
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                    Uplink Interval
                  </p>
                  <p className="text-base font-bold font-mono text-white mt-1">
                    60 MINS
                  </p>
                </div>
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                    Node Feeds
                  </p>
                  <p className="text-base font-bold font-mono text-white mt-1">
                    {sources.length || "6"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
