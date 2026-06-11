"use client";

import React from "react";
import { motion } from "framer-motion";
import { Star, Moon, Sun, Compass } from "lucide-react";

export interface VedicData {
  nakshatra: string;
  moonProgress?: number;
  sunNakshatra?: string;
  sunProgress?: number;
  tithi: string;
  ayanamsa?: string;
}

export const VedicReport = ({ data }: { data: VedicData }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-orange-500/20">
          <Star className="w-5 h-5 text-orange-400" />
        </div>
        <h3 className="font-semibold text-orange-100">
          インド占星術 (Jyotish) 分析
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lunar Data (Janma Nakshatra & Tithi) */}
        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/10 to-transparent border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Moon className="w-24 h-24 text-indigo-400" />
          </div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-400" />
            月の配置 (Mind & Emotions)
          </h4>

          <div className="space-y-6 relative z-10">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                Nakshatra (宿)
              </p>
              <p className="text-2xl font-black text-white text-indigo-300">
                {data.nakshatra}
              </p>

              {data.moonProgress !== undefined && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono">
                    <span>度数進行 (Pada Progress)</span>
                    <span>{(data.moonProgress * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${data.moonProgress * 100}%` }}
                      className="h-full rounded-full bg-indigo-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                Tithi (太陰暦日)
              </p>
              <p className="text-lg font-bold text-gray-300">{data.tithi}</p>
            </div>
          </div>
        </div>

        {/* Solar Data & Ayanamsa */}
        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-amber-500/10 to-transparent border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Sun className="w-24 h-24 text-amber-400" />
          </div>
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            太陽の配置 (Soul & Vitality)
          </h4>

          <div className="space-y-6 relative z-10">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">
                Surya Nakshatra (太陽の宿)
              </p>
              <p className="text-2xl font-black text-white text-amber-300">
                {data.sunNakshatra || "計算中..."}
              </p>

              {data.sunProgress !== undefined && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1 font-mono">
                    <span>度数進行 (Pada Progress)</span>
                    <span>{(data.sunProgress * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${data.sunProgress * 100}%` }}
                      className="h-full rounded-full bg-amber-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Ayanamsa (歳差補正)
                </p>
                <p className="text-sm font-mono text-gray-300">
                  {data.ayanamsa ? `${data.ayanamsa}° (Lahiri)` : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
