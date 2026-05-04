"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Shield, CloudLightning, Compass, BrainCircuit, RefreshCcw, Download, TerminalSquare, BookOpen, AlertTriangle, Navigation } from "lucide-react";
import { CytoscapeNetwork } from "./CytoscapeNetwork";
import { BaziReport, BaziData } from "./BaziReport";
import { VedicReport, VedicData } from "./VedicReport";

export interface NBAData {
  micro: {
    hrv: number;
    gsr: number;
    ansLoad?: number;
    shieldCapacity?: number;
  };
  macro: {
    environmentalNoise: string;
    streams?: {
      ephemeris: {
        sun: string;
        moon: string;
        mercury: string;
        venus: string;
        mars: string;
        jupiter: string;
        saturn: string;
        lunarNode: string;
      };
      environmentalBazi?: BaziData & { context: string };
      personalBazi?: (BaziData & { context: string; voidZodiac: string }) | null;
      westernAstrology: {
        aspects: string[];
        retrogrades: string[];
      };
      vedicAstrology: VedicData;
    };
  };
  nba: {
    stateVector: {
      ansLoad: number;
      shieldCapacity: number;
      environmentalNoise: string;
      environmentalRisk?: number;
      solarPhase: number;
      ephemerisData?: {
        source: string;
        planetaryPositions: any;
      };
      astrologyData?: {
        source: string;
        transits: any;
      };
      ragContext?: {
        source: string;
        classicalRules: any;
      };
      ichingHexagram?: {
        number: number;
        name: string;
        riskModifier: number;
        confidenceBoost: number;
        actionAdvice: string;
      };
    };
    actionResult: {
      suggestedAction: string;
      confidence: number;
      expectedReward: number;
      policyType: string;
      qValues?: Record<string, number>;
      probabilities?: Record<string, number>;
      logicTrace?: string[];
    };
  };
}

export function NBADashboard({ externalData, onRefresh }: { externalData?: NBAData | null, onRefresh?: () => void }) {
  const [internalData, setInternalData] = useState<NBAData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = externalData !== undefined ? externalData : internalData;

  const fetchNBAData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/nba", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!res.ok) throw new Error("Failed to fetch NBA data");
      const json = await res.json();
      if (json.success) {
        setInternalData(json.data);
      } else {
        throw new Error(json.error || "Unknown error");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalData === undefined) {
      fetchNBAData();
    }
  }, [externalData]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  const exportDataJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nba-state-export-${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportDataCSV = () => {
    if (!data) return;
    
    // Flatten the data for CSV to include ALL parameters
    const row = {
      timestamp: new Date().toISOString(),
      // Micro (Biometrics)
      hrv: data.micro.hrv,
      gsr: data.micro.gsr,
      ansLoad: data.micro.ansLoad ?? '',
      shieldCapacity: data.micro.shieldCapacity ?? '',
      
      // Macro (Ephemeris & Astrology)
      envRisk: data.nba.stateVector.environmentalRisk ?? 50,
      solarPhase: data.nba.stateVector.solarPhase ?? '',
      ephemeris_sun: data.macro.streams?.ephemeris?.sun ?? '',
      ephemeris_moon: data.macro.streams?.ephemeris?.moon ?? '',
      ephemeris_jupiter: data.macro.streams?.ephemeris?.jupiter ?? '',
      ephemeris_lunarNode: data.macro.streams?.ephemeris?.lunarNode ?? '',
      bazi_dayMaster: data.macro.streams?.personalBazi?.summary?.dayMaster ?? data.macro.streams?.environmentalBazi?.summary?.dayMaster ?? '',
      western_aspects: data.macro.streams?.westernAstrology?.aspects?.join(' | ') ?? '',
      vedic_nakshatra: data.macro.streams?.vedicAstrology?.nakshatra ?? '',
      vedic_moon_progress: data.macro.streams?.vedicAstrology?.moonProgress ?? '',
      vedic_sun_nakshatra: data.macro.streams?.vedicAstrology?.sunNakshatra ?? '',
      vedic_sun_progress: data.macro.streams?.vedicAstrology?.sunProgress ?? '',
      vedic_tithi: data.macro.streams?.vedicAstrology?.tithi ?? '',
      vedic_ayanamsa: data.macro.streams?.vedicAstrology?.ayanamsa ?? '',
      
      // I-Ching
      ichingHexagramNumber: data.nba.stateVector.ichingHexagram?.number ?? '',
      ichingHexagramName: data.nba.stateVector.ichingHexagram?.name ?? '',
      ichingRiskModifier: data.nba.stateVector.ichingHexagram?.riskModifier ?? '',
      ichingConfidenceBoost: data.nba.stateVector.ichingHexagram?.confidenceBoost ?? '',
      
      // Output & Engine Logic
      suggestedAction: data.nba.actionResult.suggestedAction,
      confidence: data.nba.actionResult.confidence,
      expectedReward: data.nba.actionResult.expectedReward,
      
      // Full Logic Trace Array joined into one cell
      logicTrace: data.nba.actionResult.logicTrace?.join(' \n ') ?? ''
    };

    const headers = Object.keys(row).join(',');
    const values = Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    
    const csvContent = `${headers}\n${values}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nba-full-telemetry-${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-8 text-white relative">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-blue-400" />
            Agency Metaphysical System
          </h1>
          <p className="text-gray-400 mt-2">Next Best Action (NBA) エンジンインターフェース</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onRefresh || fetchNBAData}
            disabled={loading || (externalData !== undefined && !onRefresh)}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            title="データを更新"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        {/* Export buttons removed: unified globally in SolarTimeClock */}
        </div>
      </header>

      {error ? (
        <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
          データの読み込みエラー: {error}
        </div>
      ) : loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
          <div className="h-48 bg-white/5 rounded-3xl border border-white/10"></div>
        </div>
      ) : data ? (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 auto-rows-[minmax(180px,auto)]"
        >
          {/* Main Action Card - Spans 2 cols, 2 rows */}
          <motion.div 
            variants={itemVariants}
            className="md:col-span-2 md:row-span-2 p-8 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 backdrop-blur-md relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-40 transition-opacity">
              <Compass className="w-32 h-32 text-indigo-400" strokeWidth={1} />
            </div>
            <div className="relative z-10 h-full flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-4 border border-indigo-500/30">
                  Calculated Dominant Policy
                </div>
                <h2 className="text-5xl font-black text-white mb-2 tracking-tight">
                  {data.nba.actionResult.suggestedAction}
                </h2>
                
                {/* Q-Value and Probability Distribution Matrix */}
                <div className="mt-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/20 backdrop-blur-sm">
                  <div className="flex justify-between items-end mb-3">
                    <h4 className="text-[10px] text-indigo-300 uppercase font-bold tracking-widest flex items-center gap-2">
                      <BrainCircuit className="w-3 h-3" /> Policy Probability Matrix
                    </h4>
                    <span className="text-[8px] text-indigo-400/70 font-mono">Q = 期待報酬 / PROB = 選択確率</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(data.nba.actionResult.probabilities || {}).sort(([,a], [,b]) => b - a).map(([action, prob]) => {
                      const qValue = data.nba.actionResult.qValues?.[action] || 0;
                      const isMax = prob === Math.max(...Object.values(data.nba.actionResult.probabilities || {}));
                      return (
                        <div key={action} className={`p-2 rounded-lg transition-all ${isMax ? 'bg-white/5 border border-white/10' : 'bg-transparent border border-transparent'}`}>
                          <div className="flex justify-between items-center text-[10px] font-mono mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={isMax ? "text-white font-bold tracking-wide" : "text-gray-400"}>{action.replace('_', ' ')}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] ${qValue > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : qValue < 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}`}>
                                Q: {qValue > 0 ? '+' : ''}{qValue.toFixed(3)}
                              </span>
                            </div>
                            <span className={isMax ? "text-emerald-400 font-bold text-xs" : "text-gray-400"}>{(prob * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden flex">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${prob * 100}%` }}
                              className={`h-full rounded-full ${isMax ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-indigo-500/50"}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <p className="text-gray-400 text-xs uppercase font-medium mb-1">確信度</p>
                  <p className="text-2xl font-bold text-emerald-400">{(data.nba.actionResult.confidence * 100).toFixed(1)}%</p>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <p className="text-gray-400 text-xs uppercase font-medium mb-1">ポリシー</p>
                  <p className="text-lg font-medium text-blue-300">{data.nba.actionResult.policyType.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Micro Environment - Oura */}
          <motion.div 
            variants={itemVariants}
            className="md:col-span-1 p-6 rounded-[2rem] bg-gradient-to-b from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-emerald-500/20">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-emerald-100">マイクロ状態 (生体)</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">コンディション</span>
                  <span className="text-emerald-300 font-medium">{data.micro.hrv}</span>
                </div>
                <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${data.micro.hrv}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">睡眠スコア</span>
                  <span className="text-emerald-300 font-medium">{data.micro.gsr}</span>
                </div>
                <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${data.micro.gsr}%` }} />
                </div>
              </div>
              {data.micro.ansLoad !== undefined && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">ストレスレベル</span>
                    <span className="text-emerald-300 font-medium">{data.micro.ansLoad}</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${data.micro.ansLoad}%` }} />
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Macro Environment - Streams */}
          <motion.div 
            variants={itemVariants}
            className="md:col-span-1 p-6 rounded-[2rem] bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/20 backdrop-blur-md flex flex-col max-h-[350px]"
          >
            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="p-2 rounded-xl bg-orange-500/20">
                <CloudLightning className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="font-semibold text-orange-100">マクロ状態 (環境)</h3>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {data.macro.streams ? (
                <>
                  <div className="p-3 rounded-xl bg-black/40 border border-orange-500/20">
                    <p className="text-[10px] text-orange-400 uppercase font-bold mb-2">天体観測 (Ephemeris Data)</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">☉</span>{data.macro.streams.ephemeris.sun}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">☽</span>{data.macro.streams.ephemeris.moon}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">☿</span>{data.macro.streams.ephemeris.mercury}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">♀</span>{data.macro.streams.ephemeris.venus}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">♂</span>{data.macro.streams.ephemeris.mars}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">♃</span>{data.macro.streams.ephemeris.jupiter}</div>
                      <div className="text-gray-300"><span className="text-orange-500/70 mr-1">♄</span>{data.macro.streams.ephemeris.saturn}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/20">
                    <p className="text-[10px] text-emerald-400 uppercase font-bold mb-2">四柱推命 (Bazi Summary)</p>
                    <div className="text-xs text-gray-300 font-medium">
                      日主 (あなた): {data.macro.streams.personalBazi ? `${data.macro.streams.personalBazi.summary.dayMaster} (${data.macro.streams.personalBazi.summary.dayMasterWuxing}) - ${data.macro.streams.personalBazi.summary.strength}` : '未設定'}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      環境日盤: {data.macro.streams.environmentalBazi?.pillars?.day?.gan}{data.macro.streams.environmentalBazi?.pillars?.day?.zhi}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-indigo-500/20">
                    <p className="text-[10px] text-indigo-400 uppercase font-bold mb-2">西洋占星術 (Western Transits)</p>
                    <div className="text-xs space-y-1">
                      {data.macro.streams.westernAstrology.aspects.map((asp, i) => (
                        <div key={i} className="text-gray-300 flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-indigo-500"></span>{asp}</div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-300 leading-relaxed">
                  {data.macro.environmentalNoise}
                </p>
              )}
            </div>
          </motion.div>

          {/* BaZi Detailed Report - Spans full width */}
          {data.macro.streams?.personalBazi && (
            <motion.div 
              variants={itemVariants}
              className="md:col-span-4 p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md"
            >
              <h3 className="text-xl font-bold text-white mb-4">個人宿命 (Personal Natal)</h3>
              <BaziReport data={data.macro.streams.personalBazi} />
            </motion.div>
          )}
          {data.macro.streams?.environmentalBazi && (
            <motion.div 
              variants={itemVariants}
              className="md:col-span-4 p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md"
            >
              <h3 className="text-xl font-bold text-white mb-4">環境位相 (Environmental Transit)</h3>
              <BaziReport data={data.macro.streams.environmentalBazi} />
            </motion.div>
          )}

          {/* Vedic Astrology Detailed Report - Spans full width */}
          {data.macro.streams?.vedicAstrology && (
            <motion.div 
              variants={itemVariants}
              className="md:col-span-4 p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md"
            >
              <VedicReport data={data.macro.streams.vedicAstrology} />
            </motion.div>
          )}

          {/* State Vector Details */}
          <motion.div 
            variants={itemVariants}
            className="md:col-span-2 p-6 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-blue-500/20">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="font-semibold text-blue-100">FQI 状態ベクトル</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center overflow-hidden">
                <p className="text-[10px] md:text-xs text-gray-500 uppercase mb-1">自律神経負荷</p>
                <p className="text-lg md:text-xl font-mono text-white">{Number(data.nba.stateVector.ansLoad).toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center overflow-hidden">
                <p className="text-[10px] md:text-xs text-gray-500 uppercase mb-1">シールド容量</p>
                <p className="text-lg md:text-xl font-mono text-white">{Number(data.nba.stateVector.shieldCapacity).toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center overflow-hidden">
                <p className="text-[10px] md:text-xs text-orange-500/70 uppercase mb-1">環境リスク</p>
                <p className="text-lg md:text-xl font-mono text-white">{Number(data.nba.stateVector.environmentalRisk || 50).toFixed(2)}</p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center overflow-hidden">
                <p className="text-[10px] md:text-xs text-gray-500 uppercase mb-1">太陽位相</p>
                <p className="text-lg md:text-xl font-mono text-white">{Number(data.nba.stateVector.solarPhase).toFixed(2)}°</p>
              </div>
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center overflow-hidden">
                <p className="text-[10px] md:text-xs text-gray-500 uppercase mb-1">期待報酬</p>
                <p className="text-lg md:text-xl font-mono text-emerald-400">+{data.nba.actionResult.expectedReward.toFixed(2)}</p>
              </div>
            </div>
          </motion.div>

          {/* System Logic Trace (因果推論ログ) */}
          {data.nba.actionResult.logicTrace && (
            <motion.div 
              variants={itemVariants}
              className="md:col-span-4 p-6 rounded-[2rem] bg-black/40 border border-white/5 backdrop-blur-md"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-gray-500/20">
                  <TerminalSquare className="w-5 h-5 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-100">System Logic Trace (因果推論ログ)</h3>
              </div>
              <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-green-400/80 overflow-y-auto max-h-[300px] custom-scrollbar border border-white/5 shadow-inner">
                {data.nba.actionResult.logicTrace.map((log: string, idx: number) => (
                  <div key={idx} className="mb-2 break-all">
                    <span className="text-gray-500 select-none mr-2">{String(idx + 1).padStart(2, '0')}</span>
                    {log}
                  </div>
                ))}
              </div>
              
              <div className="mt-8 pt-4 border-t border-white/5">
                 <CytoscapeNetwork nbaData={data.nba} />
              </div>
            </motion.div>
          )}

        </motion.div>
      ) : null}
    </div>
  );
}
