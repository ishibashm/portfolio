'use client';

import { useState } from 'react';

interface ExpertCouncilPanelProps {
  actionIntent: string;
  targetDate: Date | null;
  honmeiStar: number | null;
  environmentalFrequencies: any;
  birthFrequencies: any;
  finalVectors: Record<string, string>;
  isPersonalVoid: boolean;
  kpIndex: number | null;
  xrayFlux: string | null;
  magneticF: number | null;
  magneticD: number | null;
  magneticI: number | null;
  hrv: number;
  gsr: number;
  ansLoad: number;
  shieldCapacity: number;
  
  timingDetails?: { name: string; phenomenon: string; detail: string }[];
  timingRecommendation?: string;
  
}

export default function ExpertCouncilPanel({
  actionIntent,
  targetDate,
  honmeiStar,
  environmentalFrequencies,
  birthFrequencies,
  finalVectors,
  isPersonalVoid,
  kpIndex,
  xrayFlux,
  magneticF,
  magneticD,
  magneticI,
  hrv,
  gsr,
  ansLoad,
  shieldCapacity,
  timingScore,
  timingDetails,
  timingRecommendation,
  isTimingOptimal
}: ExpertCouncilPanelProps) {

  // Map "4 External Agencies" concepts to the underlying data feeds
  const agencyData = [
    {
      agency: "Geomancy / 気学空間",
      icon: "🧭",
      description: "現在地からの各方位の吉凶ベクトル (外部環境)",
      dataItems: Object.entries(finalVectors || {}).map(([dir, status]) => ({ label: dir, value: status })),
      status: (Object.values(finalVectors || {}).some(s => typeof s === 'string' && s.includes('NOISE'))) ? 'WARNING' : 'SAFE'
    },
    {
      agency: "Astrophysics / 天体位相",
      icon: "🔭",
      description: "天体配置に基づく時間的最適性スコア (外部環境)",
      dataItems: [
        { label: "Optimal Score", value: timingScore !== undefined ? `${Math.round(timingScore * 100)}%` : '--' },
        ...(timingDetails?.map(d => ({ label: d.name, value: `${Math.round(d.score * 100)}%` })) || [])
      ],
      status: 'OBSERVED'
    },
    {
      agency: "Tactical GIS / 物理環境",
      icon: "🎖️",
      description: "局所地磁気・災害リスクなどの物理的安全性 (外部環境)",
      dataItems: [
        { label: "Magnetic F", value: magneticF ? `${magneticF.toFixed(0)} nT` : '--' },
        { label: "Magnetic D", value: magneticD ? `${magneticD.toFixed(1)}°` : '--' },
        { label: "Hazard Risk", value: environmentalFrequencies?.hazardScore || 'N/A' }
      ],
      status: (magneticF && (magneticF > 60000 || magneticF < 25000)) ? 'WARNING' : 'SAFE'
    },
    {
      agency: "Data Science / 総合特異点",
      icon: "📊",
      description: "システム全体から見た致命的バグの有無 (外部環境)",
      dataItems: [
        { label: "Personal Void", value: isPersonalVoid ? 'YES' : 'NO' },
        { label: "Kp-Index", value: kpIndex !== null ? kpIndex.toString() : '--' }
      ],
      status: (isPersonalVoid || (kpIndex && kpIndex > 4)) ? 'CRITICAL' : 'SAFE'
    }
  ];

  return (
    <div className="w-full bg-zinc-950/80 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-5 flex flex-col shadow-2xl z-10 transition-all duration-300">
      <div className="flex justify-between items-center mb-4 border-b border-zinc-800/50 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 animate-pulse text-lg">●</span>
          <div>
            <h3 className="text-sm text-zinc-100 font-bold uppercase tracking-widest leading-none">External Telemetry</h3>
            <span className="text-[10px] text-zinc-500 font-normal">外部環境データ監視グリッド</span>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.1)]">
          Live Feed Active
        </div>
      </div>
      
      <p className="text-[11px] text-zinc-400 mb-5 font-sans leading-relaxed">
        生体データを除外した外部環境データ（気学・天体・地磁気・GIS等）のリアルタイム監視パネルです。各パラメータの現在値を監視し、日々の移住・長期滞在インサイトとして蓄積します。
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agencyData.map((agency, idx) => (
          <div key={idx} className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col hover:bg-zinc-900/50 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">{agency.icon}</span>
                <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">{agency.agency}</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-sm font-mono font-bold tracking-wider ${
                agency.status === 'OPTIMAL' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                agency.status === 'WARNING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                agency.status === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                {agency.status}
              </span>
            </div>
            
            <div className="text-[10px] text-zinc-500 mb-3 border-b border-white/5 pb-2">
              {agency.description}
            </div>
            
            <div className="flex flex-col gap-1.5 mt-auto">
              {agency.dataItems.map((item, i) => (
                <div key={i} className="flex justify-between items-center bg-white/[0.02] px-2 py-1.5 rounded-md">
                  <span className="text-[10px] text-zinc-400 font-mono">{item.label}</span>
                  <span className={`text-[11px] font-mono font-bold ${
                    String(item.value).includes('NOISE') ? 'text-red-400' :
                    String(item.value).includes('SAFE') || String(item.value).includes('OPTIMAL') ? 'text-emerald-400' :
                    item.value === 'YES' ? 'text-yellow-400' :
                    'text-zinc-200'
                  }`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
