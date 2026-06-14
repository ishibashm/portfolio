import prisma from "@/lib/prisma";
import {
  rental_properties,
  StockTarget,
  TimingAstrology,
} from "@prisma/client";
import {
  Building,
  TrendingUp,
  Compass,
  ArrowUpRight,
  Activity,
  MapPin,
  JapaneseYen,
  Clock,
  Sparkles,
  BookOpen,
  BrainCircuit,
  HeartPulse,
  Globe,
  Zap,
  Shield,
  BatteryCharging,
  Radio,
  Moon,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { TwitterFeed } from "@/components/twitter/TwitterFeed";
import { FinanceWidget } from "@/components/finance/FinanceWidget";
import { RealEstateWidget } from "@/components/realestate/RealEstateWidget";

// Integrate Meta-Metaphysical System Clients
import { OuraClient } from "@/lib/ouraClient";
import { TavilyClient } from "@/lib/tavilyClient";
import { NBAEngine } from "@/utils/nbaEngine";
import { AstroEngine } from "@/utils/ephemerisEngine";
import { Lunar } from "lunar-javascript";

export const revalidate = 60; // Revalidate cache every minute

export default async function DashboardPage() {
  const oura = new OuraClient();
  const tavily = new TavilyClient();
  const nbaEngine = new NBAEngine();

  const todayStr = new Date().toISOString().split("T")[0];
  const yesterdayStr = new Date(Date.now() - 86400000)
    .toISOString()
    .split("T")[0];

  // Fetch data concurrently with error handling
  const [
    realEstates,
    stocks,
    timings,
    ouraReadiness,
    tavilyResult,
    wealthData,
    latestVisualization,
  ] = await Promise.all([
    prisma.rental_properties
      .findMany({
        orderBy: { created_at: "desc" },
        take: 4,
      })
      .catch((e: any) => {
        console.warn("Failed to fetch rental_properties:", e.message);
        return [];
      }),
    prisma.stockTarget
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
      })
      .catch((e: any) => {
        console.warn("Failed to fetch stockTarget:", e.message);
        return [];
      }),
    prisma.timingAstrology
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 4,
      })
      .catch((e: any) => {
        console.warn("Failed to fetch timingAstrology:", e.message);
        return [];
      }),
    oura.getDailyReadiness(yesterdayStr, todayStr).catch(() => null),
    tavily
      .search("global tech market sentiment macro events today", {
        search_depth: "basic",
      })
      .catch(() => null),
    prisma.municipalityWealth
      .findMany({
        orderBy: { incomePerCapita: "desc" },
        take: 3,
      })
      .catch((e: any) => {
        console.warn("Failed to fetch municipalityWealth:", e.message);
        return [];
      }),
    prisma.visualizedComponent
      .findFirst({
        orderBy: { createdAt: "desc" },
      })
      .catch((e: any) => {
        console.warn("Failed to fetch latest visualizedComponent:", e.message);
        return null;
      }),
  ]);

  // Safe destructuring of Oura and Tavily data
  const readinessData = ouraReadiness?.data?.[0] || null;
  const tavilyResults = tavilyResult?.results?.slice(0, 3) || [];

  // 1. Process Oura Biometrics
  let ansLoad = 22;
  let shieldCapacity = 15;
  if (readinessData) {
    ansLoad = Math.max(0, 100 - readinessData.score);
    shieldCapacity =
      readinessData.contributors?.recovery_index || readinessData.score;
  }

  // 2. Process Tavily Macro Sentiment
  let environmentalRisk = 50;
  let noise = "Medium";
  if (tavilyResults.length > 0) {
    const text = tavilyResults
      .map((r: any) => r.content)
      .join(" ")
      .toLowerCase();
    const riskCount = (text.match(/risk|crash|down|bear|crisis|warning/g) || [])
      .length;
    const safeCount = (text.match(/safe|bull|up|growth|boom|stable/g) || [])
      .length;
    environmentalRisk = Math.max(
      0,
      Math.min(100, 50 + (riskCount - safeCount) * 10),
    );
    noise = riskCount > safeCount ? "High" : "Low";
  }

  // 3. Process Astrology / Ephemeris (Physical Engine)
  const now = new Date();
  const solarPhase = AstroEngine.getSolarLongitude(now);
  const marsLon = AstroEngine.getMarsLongitude(now);
  const saturnLon = AstroEngine.getSaturnLongitude(now);

  // --- LUNAR & ROKUYO LOGIC ---
  const lunarDate = Lunar.fromDate(now);
  const ROKUYO_MAP = [
    "大安 (Taian)",
    "赤口 (Shakku)",
    "先勝 (Sensho)",
    "友引 (Tomobiki)",
    "先負 (Sakimake)",
    "仏滅 (Butsumetsu)",
  ];
  // Note: getMonth() / getDay() typically return absolute month/day numbers in lunar-javascript
  const lunarMonth = lunarDate.getMonth();
  const lunarDay = lunarDate.getDay();
  const rokuyoName = ROKUYO_MAP[(lunarMonth + lunarDay) % 6];
  const yueXiang = lunarDate.getYueXiang(); // Phase name
  const lunarDateString = `旧暦 ${lunarMonth}月${lunarDay}日`;

  // 4. Calculate Next Best Action deterministically
  const nbaResult = await nbaEngine
    .getNextBestAction({
      stateVector: {
        ansLoad,
        shieldCapacity,
        environmentalNoise: noise,
        environmentalRisk,
        solarPhase,
        ephemerisData: {
          source: "AstroEngine",
          planetaryPositions: {
            mars: marsLon,
            saturn: saturnLon,
          },
        },
      },
    })
    .catch((e: any) => {
      console.error("NBA Engine Error:", e.message);
      return null;
    });

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden">
      {/* Background Glow Effects (Liquid Glass Aura) */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/10 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-emerald-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-purple-600/5 rounded-full blur-[200px] -z-10 mix-blend-screen pointer-events-none" />

      <main className="max-w-[1400px] mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-medium tracking-widest text-indigo-400 uppercase">
                The Oracle Engine
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              Meta-Metaphysical Hub
            </h1>
            <p className="text-gray-400 mt-3 max-w-2xl text-lg font-light leading-relaxed">
              ゼロトラスト統合インテリジェンス。バイオメトリックリズム、環境マクロ、占星術的タイミングを決定論的な意思決定エンジンに融合します。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/knowledge"
              className="px-5 py-2.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 transition-all font-medium text-sm text-purple-300 flex items-center gap-2 backdrop-blur-md"
            >
              <BookOpen className="w-4 h-4" />
              Second Brain
            </Link>
            <Link
              href="/metaphysical"
              className="px-5 py-2.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all font-medium text-sm text-blue-300 flex items-center gap-2 backdrop-blur-md"
            >
              <BrainCircuit className="w-4 h-4" />
              NBA Decision Engine
            </Link>
            <button className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 transition-all font-medium text-sm text-white flex items-center gap-2 backdrop-blur-md">
              Enter Cockpit
            </button>
          </div>
        </header>
        {/* BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(180px,auto)] gap-6">
          {/* BENTO ITEM 1: Quant Equities (Large Span) */}
          <section className="lg:col-span-2 lg:row-span-2 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]">
                <TrendingUp className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-white/90">
                クオンツ株式シグナル
              </h2>
            </div>

            <div className="mb-6">
              <FinanceWidget symbol="^N225" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-grow">
              {stocks.length === 0 ? (
                <div className="col-span-2 p-6 rounded-2xl bg-white/5 border border-white/5 text-center flex items-center justify-center">
                  <p className="text-gray-500 text-sm">
                    株式シグナルはまだ生成されていません。
                  </p>
                </div>
              ) : (
                stocks.slice(0, 4).map((stock: StockTarget) => (
                  <div
                    key={stock.id}
                    className="p-4 rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.01] border border-white/5 hover:border-blue-500/30 transition-all relative overflow-hidden group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-xs font-mono text-blue-400 mb-0.5">
                          {stock.code}
                        </p>
                        <h3 className="font-medium text-gray-200 text-sm truncate max-w-[120px]">
                          {stock.companyName}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">
                          ¥{stock.price?.toLocaleString() ?? "---"}
                        </p>
                        <p className="text-[10px] text-emerald-400 mt-0.5">
                          PER {stock.per?.toFixed(1) ?? "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* BENTO ITEM 2: NBA Engine Status */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/20 blur-2xl rounded-full"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-indigo-300" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-indigo-50">
                アクションエンジン
              </h2>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              {nbaResult ? (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-indigo-300/70 uppercase tracking-widest mb-1">
                        推奨アクション (Recommended)
                      </p>
                      <h3 className="text-2xl font-bold text-white tracking-tight">
                        {nbaResult.suggestedAction}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-indigo-300/70 uppercase tracking-widest mb-1">
                        確信度 (Confidence)
                      </p>
                      <p className="text-lg font-semibold text-indigo-300">
                        {(nbaResult.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${nbaResult.confidence * 100}%` }}
                    ></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  RLエージェント オフライン
                </p>
              )}
            </div>
          </section>

          {/* BENTO ITEM 3: Biometrics (Oura) */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <HeartPulse className="w-5 h-5 text-rose-400" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white/90">
                生体情報 (Biometrics)
              </h2>
            </div>

            {readinessData ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-400">
                    <BatteryCharging className="w-4 h-4" />
                    <span className="text-sm">コンディション (Readiness)</span>
                  </div>
                  <span className="text-xl font-bold text-white">
                    {readinessData.score}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm">回復指数 (Recovery)</span>
                  </div>
                  <span className="text-lg font-medium text-rose-300">
                    {readinessData.contributors?.recovery_index || "--"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 opacity-50">
                <Radio className="w-6 h-6 text-gray-500 mb-1" />
                <p className="text-xs text-gray-500">
                  Oura API未接続またはキーがありません
                </p>
              </div>
            )}
          </section>

          {/* BENTO ITEM 4: Environment Context (Tavily) */}
          <section className="lg:col-span-2 lg:row-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white/90">
                マクロ環境インテリジェンス
              </h2>
            </div>

            <div className="flex-grow flex flex-col justify-center gap-3">
              {tavilyResults.length > 0 ? (
                tavilyResults.map((result: any, i: number) => (
                  <a
                    key={i}
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex gap-3 items-start p-2.5 rounded-xl hover:bg-white/5 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-cyan-500/50 mt-0.5 flex-shrink-0 group-hover:text-cyan-400 transition-colors" />
                    <p className="text-sm text-gray-300 line-clamp-2 leading-relaxed group-hover:text-white transition-colors">
                      {result.title || result.content}
                    </p>
                  </a>
                ))
              ) : (
                <div className="text-center opacity-50">
                  <Globe className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Tavily API未接続</p>
                </div>
              )}
            </div>
          </section>

          {/* BENTO ITEM 5: Astrological Timing (Updated with Lunar Phase & Rokuyo) */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Compass className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white/90">
                アストロ・タイミング
              </h2>
            </div>

            {/* Lunar & Rokuyo Highlight */}
            <div className="mb-4 bg-gradient-to-r from-purple-900/20 to-transparent p-3 rounded-xl border border-purple-500/20">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-purple-300" />
                  <span className="text-xs text-purple-300 font-medium">
                    月相・六曜 (Lunar & Rokuyo)
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {lunarDateString}
                </span>
              </div>
              <div className="flex justify-between items-end mt-2">
                <span className="text-xl font-bold text-white tracking-widest">
                  {rokuyoName.split(" ")[0]}
                </span>
                <span className="text-sm text-purple-200">
                  月相: {yueXiang}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 flex-grow">
              {timings.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-2 opacity-60">
                  今後の吉日データはありません。
                </p>
              ) : (
                timings.slice(0, 2).map((timing: TimingAstrology) => (
                  <div
                    key={timing.id}
                    className="p-2.5 rounded-xl bg-white/5 border border-white/5"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] uppercase text-purple-300 font-bold">
                        {timing.kuseiType}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        {new Date(timing.date).toLocaleDateString()}
                      </span>
                    </div>
                    {timing.insight && (
                      <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                        {timing.insight}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* BENTO ITEM 6: Real Estate Arbitrage */}
          <div className="lg:col-span-1 lg:row-span-1">
            <RealEstateWidget data={realEstates} />
          </div>

          {/* BENTO ITEM 7: Regional Wealth & Relocation */}
          <section className="lg:col-span-2 lg:row-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight text-white/90">
                  Wealth & Relocation Matrix
                </h2>
              </div>
              <Link
                href="/relocation/wealth"
                className="p-2 rounded-full hover:bg-white/10 transition-colors group"
              >
                <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-amber-400" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-grow">
              {wealthData.length === 0 ? (
                <div className="col-span-3 p-4 rounded-xl bg-white/5 border border-white/5 text-center flex items-center justify-center">
                  <p className="text-gray-500 text-xs">
                    所得統計データはありません。
                  </p>
                </div>
              ) : (
                wealthData.map((w: any, idx: number) => (
                  <div
                    key={w.id}
                    className="p-4 rounded-xl bg-gradient-to-b from-white/[0.06] to-white/[0.01] border border-white/5 flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        #{idx + 1}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {w.dataYear}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-200 text-sm truncate mb-1">
                      {w.areaName}
                    </h3>
                    <p className="text-amber-400 text-xs font-mono">
                      ¥{(w.incomePerCapita / 10000).toFixed(0)}万/人
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* BENTO ITEM 8: AI Visualizer Gallery */}
          <section className="lg:col-span-2 lg:row-span-1 p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-white/90">
                    AIビジュアライザ・ギャラリー
                  </h2>
                  <p className="text-[11px] text-gray-500 font-light">
                    最新の生成コンポーネント
                  </p>
                </div>
              </div>
              {latestVisualization && (
                <Link
                  href={`/visualizer/share/${latestVisualization.id}`}
                  className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-[11px] text-gray-300 flex items-center gap-1"
                >
                  <span>共有ページを表示</span>
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            {latestVisualization ? (
              <div className="flex flex-col sm:flex-row gap-4 items-center flex-grow">
                {/* Scaled Preview */}
                <div className="relative w-full sm:w-2/3 h-[180px] overflow-hidden rounded-2xl border border-white/5 bg-[#09090b]">
                  <iframe
                    srcDoc={wrapHtmlWithTailwind(latestVisualization.cleanHtml)}
                    className="absolute top-0 left-0 border-0"
                    style={{
                      width: "153.8%",
                      height: "153.8%",
                      transform: "scale(0.65)",
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                    title={latestVisualization.title}
                  />
                  <div className="absolute inset-0 bg-transparent" />
                </div>

                {/* Meta details & Action */}
                <div className="w-full sm:w-1/3 flex flex-col justify-between h-full py-1">
                  <div>
                    <h3 className="font-semibold text-white text-sm line-clamp-1 mb-1">
                      {latestVisualization.title}
                    </h3>
                    <p className="text-xs text-indigo-300 font-mono mb-2 uppercase tracking-wider">
                      {latestVisualization.style}
                    </p>
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                      生成日:{" "}
                      {new Date(
                        latestVisualization.createdAt,
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="mt-4">
                    <Link
                      href="/visualizer"
                      className="inline-flex w-full justify-center items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-all shadow-md shadow-indigo-600/10 hover:shadow-indigo-500/20"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      <span>スタジオを開く</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <Palette className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-sm font-medium text-gray-400">
                  コンポーネントはまだ生成されていません
                </p>
                <p className="text-xs text-gray-500 max-w-[240px] mt-1 leading-normal">
                  ビジュアルスタジオでカスタムレイアウトを作成・保存すると、ここに表示されます。
                </p>
                <Link
                  href="/visualizer"
                  className="mt-4 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-medium text-xs text-white flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>デザインを開始</span>
                </Link>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function wrapHtmlWithTailwind(htmlContent: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/@tailwindcss/browser@4"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: white;
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 1.5rem;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}
