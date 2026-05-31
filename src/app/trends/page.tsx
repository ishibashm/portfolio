"use client";

import React, { useState, useEffect } from 'react';
import { 
  Rss, 
  Mail, 
  ExternalLink, 
  Send, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  ArrowRight,
  TrendingUp
} from 'lucide-react';

interface Article {
  title: string;
  link: string;
}

interface GroupedArticles {
  [source: string]: Article[];
}

export default function TrendsPage() {
  const [groupedArticles, setGroupedArticles] = useState<GroupedArticles | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Newsletter form states
  const [email, setEmail] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState<string>('');

  // Tab state: "All" or a specific source name
  const [activeTab, setActiveTab] = useState<string>('All');

  // Fetch articles from our API route proxy
  const fetchTrends = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/trends');
      if (!res.ok) {
        throw new Error(`エラーステータス: ${res.status}`);
      }
      const data = await res.json();
      if (data.status === 'error') {
        throw new Error(data.message || 'データの取得に失敗しました。');
      }
      setGroupedArticles(data);
    } catch (err: any) {
      console.error('Failed to fetch trends:', err);
      setFetchError(err.message || '記事データの取得中にエラーが発生しました。時間をおいて再度お試しください。');
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
    setSubmitStatus('idle');
    setSubmitMessage('');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || '登録処理に失敗しました。');
      }

      setSubmitStatus('success');
      setSubmitMessage(data.message || '購読登録ありがとうございます！');
      setEmail('');
    } catch (err: any) {
      setSubmitStatus('error');
      setSubmitMessage(err.message || '登録中にエラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  };

  // Get list of all available tabs (sources)
  const sources = groupedArticles ? Object.keys(groupedArticles) : [];

  // Helper to color source tags
  const getSourceColor = (source: string) => {
    if (source.includes('Zenn')) return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    if (source.includes('Qiita')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (source.includes('はてな')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (source.includes('Publickey')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (source.includes('DevelopersIO')) return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  };

  // Filter or flatten articles
  const getDisplayedArticles = () => {
    if (!groupedArticles) return [];

    if (activeTab === 'All') {
      // Flatten all articles
      const all: (Article & { source: string })[] = [];
      Object.entries(groupedArticles).forEach(([source, list]) => {
        list.forEach(article => {
          all.push({ ...article, source });
        });
      });
      // Since we don't have pubDate, keep the order grouped but interleaved, or simple alphabetical.
      // Let's interleave them so Zenn[0], Qiita[0], Hatena[0], Zenn[1]... to give variety
      const maxLen = Math.max(...Object.values(groupedArticles).map(l => l.length));
      const interleaved: (Article & { source: string })[] = [];
      for (let i = 0; i < maxLen; i++) {
        Object.entries(groupedArticles).forEach(([source, list]) => {
          if (list[i]) {
            interleaved.push({ ...list[i], source });
          }
        });
      }
      return interleaved;
    } else {
      return (groupedArticles[activeTab] || []).map(article => ({ ...article, source: activeTab }));
    }
  };

  const displayedArticles = getDisplayedArticles();

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden flex flex-col">
      {/* Background Liquid Glass Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[150px] -z-10 pointer-events-none" />

      <main className="flex-grow max-w-[1400px] w-full mx-auto px-6 py-10 relative z-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Rss className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-medium tracking-widest text-indigo-400 uppercase">Real-Time Aggregator</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Tech Trend Center
            </h1>
            <p className="text-gray-400 mt-3 max-w-2xl text-lg font-light leading-relaxed">
              Zenn、Qiita、はてな、Publickeyなどの複数ソースから最新トレンド技術記事を収集。
              毎日の要約を日刊まとめメールとしてお届けします。
            </p>
          </div>
        </header>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Feed Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Feed Tabs Selector */}
            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
              <button
                onClick={() => setActiveTab('All')}
                className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide border transition-all ${
                  activeTab === 'All'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/25'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                All Feeds
              </button>
              {sources.map(source => (
                <button
                  key={source}
                  onClick={() => setActiveTab(source)}
                  className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide border transition-all ${
                    activeTab === source
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/25'
                      : 'bg-white/[0.02] border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {source}
                </button>
              ))}
            </div>

            {/* Articles List / Grid */}
            {loading ? (
              // Skeleton Loader
              <div className="space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="p-5 rounded-2xl bg-white/[0.01] border border-white/5 animate-pulse flex flex-col gap-3">
                    <div className="h-4 w-3/4 bg-white/10 rounded" />
                    <div className="flex justify-between items-center mt-1">
                      <div className="h-5 w-24 bg-white/10 rounded-full" />
                      <div className="h-4 w-20 bg-white/10 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : fetchError ? (
              // Error State
              <div className="p-8 rounded-3xl bg-rose-500/5 border border-rose-500/20 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
                <h3 className="text-lg font-semibold text-rose-200">読み込みエラー</h3>
                <p className="text-sm text-gray-400 max-w-md mx-auto">{fetchError}</p>
                <button 
                  onClick={fetchTrends}
                  className="mt-4 px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-colors"
                >
                  再度読み込む
                </button>
              </div>
            ) : displayedArticles.length === 0 ? (
              // Empty State
              <div className="p-12 rounded-3xl bg-white/[0.01] border border-white/5 text-center text-gray-500">
                表示する記事がありません。
              </div>
            ) : (
              // Article Cards
              <div className="space-y-4">
                {displayedArticles.map((article, idx) => (
                  <article 
                    key={idx}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all hover:bg-white/[0.03] group shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <a 
                        href={article.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="font-medium text-gray-200 group-hover:text-white transition-colors leading-snug line-clamp-2 block hover:underline"
                      >
                        {article.title}
                      </a>
                      
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono uppercase ${getSourceColor(article.source)}`}>
                          {article.source}
                        </span>
                      </div>
                    </div>

                    <a 
                      href={article.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-indigo-600 hover:border-indigo-500 transition-all"
                      title="記事を読む"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Newsletter Console Column */}
          <div className="space-y-6">
            
            {/* Newsletter Glassmorphic Box */}
            <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-600/10 blur-2xl rounded-full pointer-events-none" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-white/95">日刊メール購読</h2>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed mb-6">
                毎日朝、ZennやQiitaなどの最新トレンド上位3記事をHTML形式の要約メールでお届けします。
              </p>

              {submitStatus === 'success' ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="font-semibold text-sm">購読登録完了</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{submitMessage}</p>
                  <button 
                    onClick={() => setSubmitStatus('idle')}
                    className="text-xs text-emerald-400 hover:underline pt-1 block"
                  >
                    他のアドレスを登録する
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-xs text-gray-500 uppercase tracking-widest block font-semibold">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-[#09090b] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 text-sm transition-colors"
                    />
                  </div>

                  {submitStatus === 'error' && (
                    <div className="flex items-start gap-2 text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span className="text-xs leading-normal">{submitMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium text-sm transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/20"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Send size={16} />
                        <span>購読登録する</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Console Details List */}
              <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300">各ソース毎に3本厳選</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">重要なトレンド情報のみに絞って配信します。</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300">安全な配信システム</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">Bccで一括送信されるためアドレスは保護されます。</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0 animate-pulse" />
                  <div>
                    <h4 className="text-xs font-semibold text-gray-300">いつでも配信停止可能</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">受信メールにそのまま返信するだけで解除可能です。</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Quick Analytics Console */}
            <div className="p-6 rounded-3xl bg-white/[0.01] border border-white/5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Active Aggregation</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LIVE</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-[#09090b] rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">REFRESH RATE</p>
                  <p className="text-lg font-bold text-white mt-1">1 Hour</p>
                </div>
                <div className="p-3 bg-[#09090b] rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">SOURCES</p>
                  <p className="text-lg font-bold text-white mt-1">{sources.length || '6'}</p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
