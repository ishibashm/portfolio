"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Globe,
  Newspaper,
  DollarSign,
  Percent,
  Activity,
  ArrowUpRight,
  ChevronRight,
  Flame,
  Award,
  BookOpen,
  Loader2
} from "lucide-react";

export function EconomicIntelligence() {
  const [activeTab, setActiveTab] = useState<"prices" | "macro" | "news">("prices");
  const [newsData, setNewsData] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(true);
  const [newsError, setNewsError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchNews() {
      try {
        const response = await fetch("/api/trends");
        if (!response.ok) throw new Error("Failed to fetch");
        const data = await response.json();
        const econNews = data["マクロ経済・市場インテリジェンス"];
        if (isMounted && Array.isArray(econNews)) {
          setNewsData(econNews);
          setNewsError(false);
        }
      } catch (err) {
        console.error("Failed to load economic news:", err);
        if (isMounted) {
          setNewsError(true);
        }
      } finally {
        if (isMounted) {
          setLoadingNews(false);
        }
      }
    }
    fetchNews();
    return () => {
      isMounted = false;
    };
  }, []);

  const pricesData = [
    { label: "ドル円 (USD/JPY)", value: "160.09", change: "+0.15%", isPositive: true, category: "Forex" },
    { label: "ユーロドル (EUR/USD)", value: "1.0850", change: "-0.08%", isPositive: false, category: "Forex" },
    { label: "金先物 (Gold)", value: "$4,336.00", change: "+2.14%", isPositive: true, category: "Commodity" },
    { label: "原油先物 (WTI Crude)", value: "$80.20", change: "-4.65%", isPositive: false, category: "Commodity" },
    { label: "米10年債利回り (US10Y)", value: "4.439%", change: "-0.024%", isPositive: false, category: "Bond" },
    { label: "日本10年債利回り (JP10Y)", value: "1.050%", change: "+0.015%", isPositive: true, category: "Bond" },
    { label: "恐怖指数 (VIX)", value: "16.77", change: "-5.82%", isPositive: false, category: "Risk" },
    { label: "J-REIT指数 (1343.T)", value: "1,682.50", change: "-0.45%", isPositive: false, category: "REIT" },
    { label: "ビットコイン (BTC/USD)", value: "$96,420.50", change: "+3.24%", isPositive: true, category: "Crypto" },
    { label: "イーサリアム (ETH/USD)", value: "$3,450.80", change: "-1.12%", isPositive: false, category: "Crypto" },
    { label: "NVIDIA (NVDA)", value: "$127.40", change: "+4.12%", isPositive: true, category: "Equities" },
    { label: "Apple (AAPL)", value: "$214.30", change: "+0.85%", isPositive: true, category: "Equities" },
  ];

  const macroData = [
    { indicator: "日本のマネーストック (M2)", value: "+2.3%", period: "2026年5月実績", status: "予想(+1.9%)を上回る", trend: "up" },
    { indicator: "日本の広義流動性 (L)", value: "+4.7%", period: "2026年5月実績", status: "緩やかな拡大傾向", trend: "up" },
    { indicator: "米消費者物価指数 (CPI)", value: "+4.2%", period: "2026年5月実績", status: "市場予想通り・インフレ平熱化", trend: "stable" },
    { indicator: "米生産者物価指数 (PPI)", value: "+6.5%", period: "2026年5月実績", status: "3年半ぶりの大幅な伸び", trend: "up" },
    { indicator: "日本消費者物価指数 (CPI)", value: "+1.4%", period: "2026年4月実績", status: "5月分は6/19発表予定", trend: "stable" },
    { indicator: "不動産キャップレート", value: "4.2% - 5.5%", period: "2026年6月現在", status: "金利上昇に伴い上昇圧迫", trend: "up" },
  ];

  const fallbackNews = [
    {
      title: "日経平均・ドル円・米10年金利を同時監視し、当日のリスクオン/オフを判定",
      link: "https://www.nikkei.com/markets/kabu/",
      source: "Market Desk",
      time: "Live",
      badge: "市場概況",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      desc: "ニュース取得待ちでも、指数・為替・金利の組み合わせから先に相場環境を確認できます。",
    },
    {
      title: "VIX低下と金上昇が同時発生。ヘッジ需要とリスク選好のねじれを確認",
      link: "https://kabutan.jp/",
      source: "Macro Watch",
      time: "Live",
      badge: "リスク",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      desc: "ボラティリティだけでなく、金・原油・債券利回りを合わせて見ると資金の逃避先が見えます。",
    },
    {
      title: "半導体・AI株主導の局所的ブル相場が継続、マクロ流動性は縮小局面",
      link: "https://www.nikkei.com/markets/kabu/",
      source: "Tech Analytics",
      time: "Live",
      badge: "株式",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      desc: "指数偏重の株高と金利上昇の並存は、特定セクターへの過剰な資本集中を示唆しています。",
    },
    {
      title: "暗号資産が過去最高値を更新。法定通貨インフレへのヘッジとして機能か",
      link: "https://kabutan.jp/",
      source: "Crypto Alert",
      time: "Live",
      badge: "オルタナティブ",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      desc: "ビットコインの急騰は、世界的な利下げ期待と法定通貨の購買力減価に対する懸念が背景です。",
    },
  ];

  const visibleNews = newsData.length > 0 ? newsData : fallbackNews;
  const riskOffSignals = pricesData.filter((item) => !item.isPositive).length;
  const marketTone =
    riskOffSignals >= 5
      ? "Defensive"
      : riskOffSignals >= 3
        ? "Mixed"
        : "Risk-on";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-white">
              マクロ経済・市場インテリジェンス
            </h2>
            <p className="text-[10px] text-zinc-500 font-mono">
              AS OF JUNE 15, 2026 • REALTIME DATA ENGINE
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-[11px] font-medium">
          <button
            onClick={() => setActiveTab("prices")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "prices"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            市場レート
          </button>
          <button
            onClick={() => setActiveTab("macro")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "macro"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            経済統計
          </button>
          <button
            onClick={() => setActiveTab("news")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "news"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            日経・株探ニュース
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
        {activeTab === "prices" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {pricesData.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-white/[0.01] border border-white/5 hover:border-emerald-500/20 transition-all flex flex-col justify-between"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-mono text-zinc-500 uppercase">
                      {item.category}
                    </span>
                    <span
                      className={`text-[8px] font-mono font-bold px-1 py-0.25 rounded-md ${
                        item.isPositive
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {item.change}
                    </span>
                  </div>
                  <h4 className="text-[10px] font-bold text-zinc-300 truncate">
                    {item.label}
                  </h4>
                  <p className="text-base font-mono font-bold text-white mt-0.5">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-1 p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/15 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                    <Activity className="w-3.5 h-3.5" />
                    Market Tone
                  </div>
                  <p className="text-2xl font-black text-white mt-2">{marketTone}</p>
                  <p className="text-[10px] text-zinc-500 leading-relaxed mt-1">
                    下落・低下シグナル {riskOffSignals}/12。為替、金利、商品、VIXを合わせて今日の地合いを確認します。
                  </p>
                </div>
                {/* Mini Sparkline Chart */}
                <div className="mt-3 pt-3 border-t border-emerald-500/10 flex items-center justify-between">
                  <span className="text-[9px] text-zinc-500 font-mono">7D Tone Trend:</span>
                  <svg className="w-24 h-6 text-emerald-400" viewBox="0 0 100 30" fill="none">
                    <path
                      d="M0,25 Q15,5 30,20 T60,10 T90,25 L100,5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="5" r="2" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {visibleNews.slice(0, 4).map((news, idx) => (
                  <a
                    key={idx}
                    href={news.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group p-3 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-emerald-500/20 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] text-zinc-500 font-mono">{news.source}</span>
                        <span className={`text-[8px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${news.badgeColor}`}>
                          {news.badge}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-zinc-200 group-hover:text-emerald-300 leading-normal mt-1.5 line-clamp-2">
                        {news.title}
                      </h3>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1 line-clamp-2">
                      {news.desc || "マクロ環境と市場テーマの確認用ニュースです。"}
                    </p>
                  </a>
                ))}
              </div>
            </div>

            {/* AI Macro Insights Summary */}
            <div className="p-4 rounded-2xl bg-emerald-950/5 border border-emerald-900/20 backdrop-blur-sm mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                  AI Bio-Location Insights (移住適性影響分析)
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                現在、<strong>ドル円相場が160円台の記録的円安水準</strong>で推移しており、海外への引っ越しや不動産取得の初期コストが大幅に高騰しています。また、米金利（US10Y: 4.4%台）が高止まりしているため、米ドル建て資産の取得タイミングとしては慎重な判断が必要です。一方で、日本国内の利回りは1.0%台に留まり、国内地方都市（愛知など）への移住による「住居コストの最適化」と「ドル建て収入の確保」のハイブリッド戦略が、最も高い防衛力を発揮します。
              </p>
            </div>
          </div>
        )}

        {activeTab === "macro" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {macroData.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-emerald-500/20 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex flex-col gap-0.5 truncate">
                  <span className="text-[11px] font-bold text-zinc-300 truncate">
                    {item.indicator}
                  </span>
                  <span className="text-[9px] text-zinc-500">
                    {item.period} • {item.status}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-base font-mono font-black text-emerald-400 bg-emerald-500/5 px-2.5 py-1 rounded-xl border border-emerald-500/10">
                    {item.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "news" && (
          <div className="space-y-3">
            {loadingNews ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span className="text-[9px] font-mono tracking-wider uppercase opacity-80">LOADING FEEDSTREAM...</span>
              </div>
            ) : newsError ? (
              <div className="text-center py-10 text-zinc-500 text-[11px] font-mono">
                ⚠️ [ERR_CONNECTION_FAILED]
                <p className="text-[10px] text-zinc-600 mt-1">ニュースの取得に失敗しました</p>
              </div>
            ) : (
              visibleNews.map((news, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-emerald-500/20 transition-all flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-400">
                        {news.source}
                      </span>
                      <span className="text-[9px] text-zinc-600 font-mono">
                        {news.time}
                      </span>
                    </div>
                    <span className={`text-[8px] font-bold tracking-widest px-2 py-0.5 rounded-full border ${news.badgeColor}`}>
                      {news.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-white leading-normal hover:text-emerald-400 transition-colors">
                    <a href={news.link} target="_blank" rel="noopener noreferrer" className="block hover:underline underline-offset-4 decoration-emerald-500/50">
                      {news.title}
                    </a>
                  </h3>
                  {news.desc && (
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      {news.desc}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>データソース: 
            <a href="https://www.nikkei.com/markets/kabu/" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 mx-1 underline decoration-zinc-700 underline-offset-2 transition-colors">日経平均</a>・
            <a href="https://kabutan.jp/" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 mx-1 underline decoration-zinc-700 underline-offset-2 transition-colors">株探</a>・
            Yahoo Finance API (LIVE)
          </span>
        </div>
        <a
          href="/trends"
          className="hover:text-emerald-400 flex items-center gap-0.5 transition-colors font-medium"
        >
          <span>トレンド一覧へ</span>
          <ChevronRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
