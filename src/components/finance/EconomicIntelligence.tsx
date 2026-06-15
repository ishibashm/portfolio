"use client";

import React, { useState } from "react";
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
  BookOpen
} from "lucide-react";

export function EconomicIntelligence() {
  const [activeTab, setActiveTab] = useState<"prices" | "macro" | "news">("prices");

  const pricesData = [
    { label: "ドル円 (USD/JPY)", value: "160.09", change: "+0.15%", isPositive: true, category: "Forex" },
    { label: "ユーロドル (EUR/USD)", value: "1.0850", change: "-0.08%", isPositive: false, category: "Forex" },
    { label: "金先物 (Gold)", value: "$4,336.00", change: "+2.14%", isPositive: true, category: "Commodity" },
    { label: "原油先物 (WTI Crude)", value: "$80.20", change: "-4.65%", isPositive: false, category: "Commodity" },
    { label: "米10年債利回り (US10Y)", value: "4.439%", change: "-0.024%", isPositive: false, category: "Bond" },
    { label: "日本10年債利回り (JP10Y)", value: "1.050%", change: "+0.015%", isPositive: true, category: "Bond" },
    { label: "恐怖指数 (VIX)", value: "16.77", change: "-5.82%", isPositive: false, category: "Risk" },
    { label: "J-REIT指数 (1343.T)", value: "1,682.50", change: "-0.45%", isPositive: false, category: "REIT" },
  ];

  const macroData = [
    { indicator: "日本のマネーストック (M2)", value: "+2.3%", period: "2026年5月実績", status: "予想(+1.9%)を上回る", trend: "up" },
    { indicator: "日本の広義流動性 (L)", value: "+4.7%", period: "2026年5月実績", status: "緩やかな拡大傾向", trend: "up" },
    { indicator: "米消費者物価指数 (CPI)", value: "+4.2%", period: "2026年5月実績", status: "市場予想通り・インフレ平熱化", trend: "stable" },
    { indicator: "米生産者物価指数 (PPI)", value: "+6.5%", period: "2026年5月実績", status: "3年半ぶりの大幅な伸び", trend: "up" },
    { indicator: "日本消費者物価指数 (CPI)", value: "+1.4%", period: "2026年4月実績", status: "5月分は6/19発表予定", trend: "stable" },
    { indicator: "不動産キャップレート", value: "4.2% - 5.5%", period: "2026年6月現在", status: "金利上昇に伴い上昇圧迫", trend: "up" },
  ];

  const newsData = [
    {
      source: "日本経済新聞",
      time: "15:15",
      title: "日経平均大引け、急騰3297円高の6万9317円 過去2番目の上げ幅で史上最高値更新",
      desc: "米国とイランの戦闘終結合意の報道を受けリスクオン。半導体、建設株中心に全面高の展開。",
      badge: "株式市場",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    },
    {
      source: "株探 (Kabutan)",
      time: "15:00",
      title: "キオクシアHDが急騰で初の9万円台。村田製、三井ハイテはストップ高比例配分",
      desc: "AI関連需要と地政学リスク後退のダブルの追い風。電子部品・半導体材料セクターに巨額の買い。",
      badge: "注目銘柄",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20"
    },
    {
      source: "日本経済新聞",
      time: "09:00",
      title: "日銀、金融政策決定会合がスタート。国債買い入れ減額の具体策を協議へ",
      desc: "15-16日の2日間の日程。長期金利上昇局面における国債減額プランのペースと利上げ時期が焦点。",
      badge: "金融政策",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20"
    },
  ];

  return (
    <div className="flex flex-col h-full justify-between">
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
      <div className="flex-grow min-h-[180px] overflow-y-auto custom-scrollbar pr-1">
        {activeTab === "prices" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {pricesData.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-white/[0.01] border border-white/5 hover:border-emerald-500/20 transition-all flex flex-col justify-between"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[9px] font-mono text-zinc-500 uppercase">
                    {item.category}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.25 rounded-md ${
                      item.isPositive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {item.change}
                  </span>
                </div>
                <h4 className="text-[11px] font-bold text-zinc-300 truncate">
                  {item.label}
                </h4>
                <p className="text-lg font-mono font-bold text-white mt-1">
                  {item.value}
                </p>
              </div>
            ))}
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
            {newsData.map((news, idx) => (
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
                <h3 className="text-xs font-bold text-white leading-normal hover:text-emerald-400 transition-colors cursor-pointer">
                  {news.title}
                </h3>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  {news.desc}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>データソース: 日経平均・株探・Yahoo Finance API (LIVE)</span>
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
