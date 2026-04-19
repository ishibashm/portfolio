import prisma from "@/lib/prisma"
import { rental_propertiesModel as rental_properties, StockTargetModel as StockTarget, TimingAstrologyModel as TimingAstrology } from "@/generated/prisma/models"
import { Building, TrendingUp, Compass, ArrowUpRight, Activity, MapPin, JapaneseYen, Clock, Sparkles, BookOpen } from "lucide-react"
import Link from "next/link"
import { TwitterFeed } from "@/components/twitter/TwitterFeed"
import { FinanceWidget } from "@/components/finance/FinanceWidget"

export const revalidate = 60 // Revalidate cache every minute

export default async function DashboardPage() {
  // Fetch data from Prisma concurrently with error handling to prevent build crashes
  const [realEstates, stocks, timings] = await Promise.all([
    prisma.rental_properties.findMany({
      orderBy: { created_at: 'desc' },
      take: 5
    }).catch((e: any) => {
      console.warn("Failed to fetch rental_properties:", e.message);
      return [];
    }),
    prisma.stockTarget.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    }).catch((e: any) => {
      console.warn("Failed to fetch stockTarget:", e.message);
      return [];
    }),
    prisma.timingAstrology.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    }).catch((e: any) => {
      console.warn("Failed to fetch timingAstrology:", e.message);
      return [];
    })
  ])

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30 font-sans relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] -z-10 mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[150px] -z-10 mix-blend-screen pointer-events-none" />
      
      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 border-b border-white/10 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-medium tracking-wider text-indigo-400 uppercase">The Oracle Engine</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-br from-white via-white to-white/40 bg-clip-text text-transparent">
              AI Asset Builder Hub
            </h1>
            <p className="text-gray-400 mt-2 max-w-xl text-lg">
              Unified quantitative market data, alternative real estate intelligence, and astrological timing for automated asset formation.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/knowledge" className="px-5 py-2.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all font-medium text-sm text-purple-300 hover:text-purple-200 flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.15)] hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]">
              <BookOpen className="w-4 h-4" />
              Second Brain
            </Link>
            <Link href="/" className="px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all font-medium text-sm text-gray-300 hover:text-white flex items-center gap-2">
              Enter Cockpit
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Column 1: Financial Market / Quant Research */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-100">Quant Equities</h2>
            </div>
            
            <FinanceWidget symbol="^N225" />
            
            <div className="mt-4 flex items-center gap-3 mb-2">
              <h2 className="text-xl font-semibold tracking-tight text-gray-100">Market Social Feed</h2>
            </div>
            <TwitterFeed initialQuery="(株 OR 日経 OR 投資) min_faves:50" type="search" />
            
            <div className="mt-6 flex flex-col gap-4">
              {stocks.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md text-center">
                  <p className="text-gray-500 text-sm">No equity signals generated yet.</p>
                </div>
              ) : (
                stocks.map((stock: StockTarget) => (
                  <div key={stock.id} className="group p-5 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-white/10 hover:border-blue-500/30 transition-all backdrop-blur-md cursor-pointer hover:shadow-[0_0_30px_-5px_var(--color-blue-500)]/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors" />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs font-mono text-blue-400 mb-1">{stock.code}</p>
                          <h3 className="font-medium text-gray-100">{stock.companyName}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">¥{stock.price?.toLocaleString() ?? '---'}</p>
                          <p className="text-xs text-emerald-400 mt-0.5">PER {stock.per ? stock.per.toFixed(1) : '-'}</p>
                        </div>
                      </div>
                      {stock.analysisReason && (
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                          {stock.analysisReason}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Column 2: Alternative Data / Real Estate */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Building className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-100">Real Estate Arbitrage</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {realEstates.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md text-center">
                  <p className="text-gray-500 text-sm">No real estate targets acquired.</p>
                </div>
              ) : (
                realEstates.map((re: rental_properties) => (
                  <div key={re.id} className="group p-5 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-white/10 hover:border-emerald-500/30 transition-all backdrop-blur-md cursor-pointer hover:shadow-[0_0_30px_-5px_var(--color-emerald-500)]/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition-colors" />
                    <div className="relative z-10">
                      <h3 className="font-medium text-gray-100 mb-2 truncate" title={re.property_name}>{re.property_name}</h3>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-3">
                        {re.area && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{re.area}</span>}
                        {re.size_sqm && <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{re.size_sqm.toString()}㎡</span>}
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-white/5">
                        <span className="flex items-center gap-1 text-emerald-400 font-medium text-sm">
                          <JapaneseYen className="w-4 h-4" />
                          {re.rent ? re.rent.toLocaleString() : '---'}
                        </span>
                        {re.url && (
                          <a href={re.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                            Reference <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Column 3: Astrological Timing */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Compass className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-100">Astrological Timing</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {timings.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md text-center">
                  <p className="text-gray-500 text-sm">Astrological engines offline or un-synced.</p>
                </div>
              ) : (
                timings.map((timing: TimingAstrology) => (
                  <div key={timing.id} className="group p-5 rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent border border-white/10 hover:border-purple-500/30 transition-all backdrop-blur-md">
                    <div className="flex justify-between items-start mb-3">
                      <div className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/20">
                        {timing.kuseiType}
                      </div>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(timing.date).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      {timing.dailyDirection && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Daily Optimal</span>
                          <span className="text-purple-200 font-medium">{timing.dailyDirection}</span>
                        </div>
                      )}
                      {timing.monthlyDirection && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Monthly Optimal</span>
                          <span className="text-purple-200 font-medium">{timing.monthlyDirection}</span>
                        </div>
                      )}
                    </div>
                    
                    {timing.insight && (
                      <div className="pt-3 border-t border-white/5 text-xs text-gray-300 leading-relaxed">
                        <span className="text-purple-400 font-medium mb-1 block">Oracle Insight</span>
                        {timing.insight}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
