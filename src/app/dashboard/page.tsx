import prisma from "@/lib/prisma";
import {
  rental_properties,
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
import { RealEstateWidget } from "@/components/realestate/RealEstateWidget";
import { SubdomainLauncherGrid } from "@/domains/launcher";

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
  let solarPhase = 0;
  let marsLon = 0;
  let saturnLon = 0;

  try {
    solarPhase = AstroEngine.getSolarLongitude(now);
    marsLon = AstroEngine.getMarsLongitude(now);
    saturnLon = AstroEngine.getSaturnLongitude(now);
  } catch (astroErr) {
    console.error("AstroEngine Calculation Error:", astroErr);
  }

  // --- LUNAR & ROKUYO LOGIC ---
  let rokuyoName = "大安 (Taian)";
  let yueXiang = "不明";
  let lunarMonth = 1;
  let lunarDay = 1;
  let lunarDateString = "旧暦 1月1日";

  try {
    const lunarDate = Lunar.fromDate(now);
    const ROKUYO_MAP = [
      "大安 (Taian)",
      "赤口 (Shakku)",
      "先勝 (Sensho)",
      "友引 (Tomobiki)",
      "先負 (Sakimake)",
      "仏滅 (Butsumetsu)",
    ];
    lunarMonth = lunarDate.getMonth();
    lunarDay = lunarDate.getDay();
    
    const rawIndex = lunarMonth + lunarDay;
    const absIndex = isNaN(rawIndex) ? 0 : Math.abs(rawIndex) % 6;
    rokuyoName = ROKUYO_MAP[absIndex] || "大安 (Taian)";
    yueXiang = lunarDate.getYueXiang() || "不明";
    lunarDateString = `旧暦 ${lunarMonth}月${lunarDay}日`;
  } catch (lunarErr) {
    console.error("Lunar Calendar Calculation Error:", lunarErr);
  }

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
    <div className="min-h-screen bg-gradient-to-br from-rose-50/80 via-stone-50 to-amber-50/50 text-stone-800 selection:bg-rose-500/20 font-sans relative overflow-hidden">
      {/* Background Soft Glow Effects */}
      <div className="fixed top-[-10vw] left-[-10vw] w-[50vw] h-[50vw] bg-rose-200/30 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-[-10vw] right-[-10vw] w-[50vw] h-[50vw] bg-amber-200/30 rounded-full blur-[160px] pointer-events-none -z-10" />

      <main className="max-w-[1400px] mx-auto px-6 py-10 relative z-10">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6 border-b border-rose-200/60 pb-8 bg-white/70 backdrop-blur-xl p-8 rounded-3xl border shadow-xl shadow-rose-100/30">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
              <span className="text-xs font-semibold tracking-widest text-rose-600 uppercase">
                The Oracle Engine
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold font-serif tracking-tight text-stone-900">
              Meta-Metaphysical Hub
            </h1>
            <p className="text-stone-600 mt-2 max-w-2xl text-base font-normal leading-relaxed">
              知性と直感に寄り添う統合インテリジェンス。バイオメトリック、環境マクロ、アストロタイミングをシームレスに同期します。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="https://katmer.cloud-palette.com/brain"
              className="px-5 py-2.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 font-semibold text-xs flex items-center gap-2 transition-all shadow-md shadow-rose-200"
            >
              <BookOpen className="w-4 h-4" />
              Second Brain
            </Link>
            <Link
              href="/metaphysical"
              className="px-5 py-2.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 font-semibold text-xs text-stone-700 flex items-center gap-2 transition-all shadow-sm"
            >
              <BrainCircuit className="w-4 h-4 text-purple-500" />
              Decision Engine
            </Link>
          </div>
        </header>

        {/* Subdomain Launcher Grid */}
        <SubdomainLauncherGrid />

        {/* BENTO GRID LAYOUT */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(180px,auto)] gap-6">
          {/* BENTO ITEM 2: NBA Engine Status */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-indigo-100 shadow-xl shadow-indigo-100/40 relative overflow-hidden hover:-translate-y-0.5 transition-all">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-200/40 blur-2xl rounded-full"></div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-200 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
                アクションエンジン
              </h2>
            </div>

            <div className="relative z-10 flex flex-col gap-3">
              {nbaResult ? (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs text-indigo-400 uppercase tracking-widest mb-1">
                        推奨アクション (Recommended)
                      </p>
                      <h3 className="text-2xl font-bold text-stone-900 tracking-tight">
                        {nbaResult.suggestedAction}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-indigo-400 uppercase tracking-widest mb-1">
                        確信度 (Confidence)
                      </p>
                      <p className="text-lg font-semibold text-indigo-600">
                        {(nbaResult.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${nbaResult.confidence * 100}%` }}
                    ></div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-stone-400">
                  RLエージェント オフライン
                </p>
              )}
            </div>
          </section>

          {/* BENTO ITEM 3: Biometrics (Oura) */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-rose-100 shadow-xl shadow-rose-100/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500 text-white shadow-md shadow-rose-200 flex items-center justify-center">
                <HeartPulse className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
                生体情報 (Biometrics)
              </h2>
            </div>

            {readinessData ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-stone-500">
                    <BatteryCharging className="w-4 h-4" />
                    <span className="text-sm">コンディション (Readiness)</span>
                  </div>
                  <span className="text-xl font-bold text-stone-900">
                    {readinessData.score}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-stone-500">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm">回復指数 (Recovery)</span>
                  </div>
                  <span className="text-lg font-medium text-rose-500">
                    {readinessData.contributors?.recovery_index || "--"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 opacity-60">
                <Radio className="w-6 h-6 text-stone-400 mb-1" />
                <p className="text-xs text-stone-400">
                  Oura API未接続またはキーがありません
                </p>
              </div>
            )}
          </section>

          {/* BENTO ITEM 4: Environment Context (Tavily) */}
          <section className="lg:col-span-2 lg:row-span-1 p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-cyan-100 shadow-xl shadow-cyan-100/40 hover:-translate-y-0.5 transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500 text-white shadow-md shadow-cyan-200 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
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
                     className="group flex gap-3 items-start p-2.5 rounded-xl hover:bg-cyan-50/80 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0 group-hover:text-cyan-600 transition-colors" />
                    <p className="text-sm text-stone-600 line-clamp-2 leading-relaxed group-hover:text-stone-900 transition-colors">
                      {result.title || result.content}
                    </p>
                  </a>
                ))
              ) : (
                <div className="text-center opacity-60">
                  <Globe className="w-6 h-6 text-stone-400 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Tavily API未接続</p>
                </div>
              )}
            </div>
          </section>

          {/* BENTO ITEM 5: Astrological Timing (Updated with Lunar Phase & Rokuyo) */}
          <section className="lg:col-span-1 lg:row-span-1 p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-purple-100 shadow-xl shadow-purple-100/40 hover:-translate-y-0.5 transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500 text-white shadow-md shadow-purple-200 flex items-center justify-center">
                <Compass className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
                アストロ・タイミング
              </h2>
            </div>

            {/* Lunar & Rokuyo Highlight */}
            <div className="mb-4 bg-gradient-to-r from-purple-50 to-transparent p-3 rounded-xl border border-purple-200/60">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-purple-500" />
                  <span className="text-xs text-purple-600 font-medium">
                    月相・六曜 (Lunar & Rokuyo)
                  </span>
                </div>
                <span className="text-[10px] text-stone-400">
                  {lunarDateString}
                </span>
              </div>
              <div className="flex justify-between items-end mt-2">
                <span className="text-xl font-bold text-stone-900 tracking-widest">
                  {rokuyoName?.split(" ")[0] ?? "大安"}
                </span>
                <span className="text-sm text-purple-600">
                  月相: {yueXiang}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 flex-grow">
              {timings.length === 0 ? (
                <p className="text-stone-400 text-xs text-center py-2">
                  今後の吉日データはありません。
                </p>
              ) : (
                timings.slice(0, 2).map((timing: TimingAstrology) => (
                  <div
                    key={timing.id}
                    className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/80"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] uppercase text-purple-600 font-bold">
                        {timing.kuseiType}
                      </span>
                      <span className="text-[9px] text-stone-400">
                        {new Date(timing.date).toLocaleDateString()}
                      </span>
                    </div>
                    {timing.insight && (
                      <p className="text-[11px] text-stone-500 line-clamp-2 leading-relaxed">
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
          <section className="lg:col-span-2 lg:row-span-1 p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-amber-100 shadow-xl shadow-amber-100/40 hover:-translate-y-0.5 transition-all flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white shadow-md shadow-amber-200 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
                  Wealth & Relocation Matrix
                </h2>
              </div>
              <Link
                href="/relocation/wealth"
                className="p-2 rounded-full hover:bg-amber-50 transition-colors group"
              >
                <ArrowUpRight className="w-4 h-4 text-stone-400 group-hover:text-amber-500" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-grow">
              {wealthData.length === 0 ? (
                <div className="col-span-3 p-4 rounded-xl bg-stone-50 border border-stone-100 text-center flex items-center justify-center">
                  <p className="text-stone-400 text-xs">
                    所得統計データはありません。
                  </p>
                </div>
              ) : (
                wealthData.map((w: any, idx: number) => (
                  <div
                    key={w.id}
                    className="p-4 rounded-xl bg-gradient-to-b from-amber-50/80 to-white border border-amber-100/80 flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        #{idx + 1}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {w.dataYear}
                      </span>
                    </div>
                    <h3 className="font-medium text-stone-800 text-sm truncate mb-1">
                      {w.areaName}
                    </h3>
                    <p className="text-amber-600 text-xs font-mono font-semibold">
                      ¥{(w.incomePerCapita / 10000).toFixed(0)}万/人
                    </p>
                  </div>
                ))
              )}
            </div>
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
