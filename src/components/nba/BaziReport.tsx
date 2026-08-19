"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Sparkles,
  Wind,
  Flame,
  Mountain,
  Scissors,
  Droplets,
} from "lucide-react";

export interface BaziPillar {
  gan: string;
  zhi: string;
  ganTenGod: string;
  hiddenStems: string[];
  hiddenStemTenGods: string[];
  lifeStage: string;
  nayin: string;
  wuxing: string;
}

export interface BaziData {
  pillars: {
    year: BaziPillar;
    month: BaziPillar;
    day: BaziPillar;
    hour: BaziPillar;
  };
  fiveElements: Record<string, number>;
  summary: {
    dayMaster: string;
    dayMasterWuxing: string;
    description: string;
    strength: string;
  };
  shenSha: string[];
  solarTerms: Record<string, string>;
  luckCycles: Array<{ startYear: number; endYear: number; ganZhi: string }>;
}

export const BaziReport = ({
  data,
  title = "四柱推命 精密命式分析",
}: {
  data: BaziData;
  title?: string;
}) => {
  const getElementIcon = (wuxing: string) => {
    if (wuxing.includes("木"))
      return <Wind className="w-4 h-4 text-emerald-600" />;
    if (wuxing.includes("火"))
      return <Flame className="w-4 h-4 text-red-600" />;
    if (wuxing.includes("土"))
      return <Mountain className="w-4 h-4 text-amber-600" />;
    if (wuxing.includes("金"))
      return <Scissors className="w-4 h-4 text-stone-600" />;
    if (wuxing.includes("水"))
      return <Droplets className="w-4 h-4 text-blue-600" />;
    return null;
  };

  const renderPillar = (title: string, pillar: BaziPillar) => (
    <div className="flex flex-col items-center p-4 bg-white/70 border border-stone-200/60 rounded-2xl">
      <span className="text-[10px] text-stone-600 uppercase tracking-widest mb-3 font-bold">
        {title}
      </span>
      <div className="flex flex-col items-center gap-1 mb-3">
        <div className="text-3xl font-black text-stone-900 flex gap-1">
          <span className="hover:text-emerald-600 transition-colors cursor-default">
            {pillar.gan}
          </span>
          <span className="hover:text-blue-600 transition-colors cursor-default">
            {pillar.zhi}
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-200">
          {pillar.ganTenGod}
        </span>
      </div>
      <div className="w-full space-y-2 border-t border-stone-200/60 pt-3">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-stone-600">蔵干</span>
          <span className="text-stone-600 font-mono">
            {pillar.hiddenStems?.join(", ")}
          </span>
        </div>
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-stone-600">十二運</span>
          <span className="text-emerald-600 font-bold">{pillar.lifeStage}</span>
        </div>
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-stone-600">納音</span>
          <span className="text-purple-600 truncate ml-2">{pillar.nayin}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-purple-500/20">
          <BookOpen className="w-5 h-5 text-purple-600" />
        </div>
        <h3 className="font-semibold text-purple-700">{title}</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {renderPillar("時柱", data.pillars.hour)}
        {renderPillar("日柱", data.pillars.day)}
        {renderPillar("月柱", data.pillars.month)}
        {renderPillar("年柱", data.pillars.year)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-white/5 to-transparent border border-stone-200/80">
          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />{" "}
            基本性格とエネルギー状態
          </h4>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-4xl font-black text-stone-900 bg-stone-100/80 w-16 h-16 rounded-2xl flex items-center justify-center border border-stone-200/80">
                {data.summary.dayMaster}
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                  日主: {data.summary.dayMaster} ({data.summary.dayMasterWuxing}
                  ){getElementIcon(data.summary.dayMasterWuxing)}
                </p>
                <p className="text-lg font-bold text-stone-900">
                  身強/身弱: {data.summary.strength}
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-500 leading-relaxed italic">
              「{data.summary.description}」
            </p>
            <div className="pt-4 border-t border-stone-200/60">
              <p className="text-[10px] text-stone-600 uppercase font-bold mb-2">
                神殺 / 特殊星
              </p>
              <div className="flex flex-wrap gap-2">
                {data.shenSha?.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-1 rounded-md bg-white/70 border border-stone-200/80 text-[10px] text-amber-600"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-[2rem] bg-white/70 border border-stone-200/60">
          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">
            五行バランス (Five Elements)
          </h4>
          <div className="space-y-4">
            {Object.entries(data.fiveElements).map(([element, count]) => (
              <div key={element}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-600 flex items-center gap-2">
                    {getElementIcon(element)}
                    {element}
                  </span>
                  <span className="text-stone-500 font-mono">{count} units</span>
                </div>
                <div className="h-1.5 w-full bg-stone-100/80 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(count / 8) * 100}%` }}
                    className={`h-full rounded-full ${
                      element === "木"
                        ? "bg-emerald-500"
                        : element === "火"
                          ? "bg-red-500"
                          : element === "土"
                            ? "bg-amber-600"
                            : element === "金"
                              ? "bg-zinc-300"
                              : "bg-blue-500"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Solar Terms & Extra Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="p-6 rounded-[2rem] bg-stone-100/80 border border-stone-200/80">
          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            二十四節気 (Solar Terms)
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {Object.entries(data.solarTerms || {}).map(([term, time]) => (
              <div
                key={term}
                className="flex justify-between border-b border-stone-200/60 pb-1"
              >
                <span className="text-emerald-600">{term}</span>
                <span className="text-stone-600">{time?.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-[2rem] bg-stone-100/80 border border-stone-200/80">
          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">
            システム解析詳細
          </h4>
          <div className="space-y-2 text-[10px] text-stone-500">
            <div className="flex justify-between">
              <span>真太陽時補正 (TST)</span>
              <span className="text-blue-600 font-mono">Active</span>
            </div>
            <div className="flex justify-between">
              <span>国立天文台データ同期</span>
              <span className="text-blue-600 font-mono">
                1900-2100 Accurate
              </span>
            </div>
            <div className="flex justify-between">
              <span>蔵干通変星抽出</span>
              <span className="text-blue-600 font-mono">Full Trace</span>
            </div>
          </div>
        </div>
      </div>

      {/* Luck Cycles */}
      <div className="p-6 rounded-[2rem] bg-stone-100/80 border border-stone-200/80">
        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">
          大運サイクル (Da Yun)
        </h4>
        <div className="overflow-x-auto custom-scrollbar">
          <div className="flex gap-4 pb-2">
            {data.luckCycles?.map((cycle, i) => (
              <div
                key={i}
                className="flex-shrink-0 w-24 p-3 rounded-xl bg-white/70 border border-stone-200/60 text-center"
              >
                <p className="text-[10px] text-stone-600 mb-1">
                  {cycle.startYear} -
                </p>
                <p className="text-xl font-bold text-stone-900 mb-1">
                  {cycle.ganZhi}
                </p>
                <p className="text-[9px] text-purple-600 font-bold">10年運</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
