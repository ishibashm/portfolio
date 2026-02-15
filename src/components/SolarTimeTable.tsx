"use client";

import React, { useMemo, useState } from "react";
import { getDailySolarSchedule, KimonScheduleItem } from "../utils/solarTime";
import { KigakuBoard } from "./KigakuBoard";

interface SolarTimeTableProps {
  date: Date;
  longitude: number;
}

export function SolarTimeTable({ date, longitude }: SolarTimeTableProps) {
  const schedule = useMemo(
    () => getDailySolarSchedule(date, longitude),
    [date, longitude]
  );
  
  // State for expanded row
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleRow = (index: number) => {
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else {
      setExpandedIndex(index);
    }
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleDownloadCsv = () => {
    // Header
    const headers = ["Eto", "Branch Name", "Stem Name", "Reading", "Nine Stars", "Eight Gates", "Note", "Standard Start", "Standard End"];
    
    // Rows
    const rows = schedule.map((item) => [
      item.etoKanji,
      item.name,
      item.stemName,
      item.reading,
      item.kyusei.japanese,
      item.hachimon.japanese,
      item.note || "",
      formatTime(item.startStandard),
      formatTime(item.endStandard),
    ]);

    // CSV Content
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + // BOM for Excel
      [headers, ...rows]
        .map((e) => e.map((c) => `"${c}"`).join(",")) // Quote fields
        .join("\n");

    // Download Link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = date.toLocaleDateString().replace(/\//g, "-");
    link.setAttribute("download", `solar_schedule_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-12 w-full max-w-2xl bg-zinc-900/30 p-8 rounded-2xl backdrop-blur-md border border-zinc-800/50 shadow-2xl relative overflow-hidden group hover:border-zinc-700/50 transition-colors duration-500">
      
      {/* Decorative Shine */}
      <div className="absolute top-0 left-0 w-full h-px bg-linear-to-r from-transparent via-zinc-700/50 to-transparent"></div>

      <div className="flex justify-between items-end mb-6">
        <div>
           <h2 className="text-base font-light tracking-[0.3em] text-zinc-400 uppercase mb-1">
             Daily Schedule
           </h2>
           <p className="text-[10px] text-zinc-600 tracking-wider">
             Time Board (Click to Expand)
           </p>
        </div>
        <button
          onClick={handleDownloadCsv}
          className="px-4 py-2 text-[10px] uppercase tracking-widest border border-zinc-800 text-zinc-500 rounded hover:bg-zinc-800 hover:text-zinc-300 transition-all active:scale-95 cursor-pointer"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left text-zinc-500">
          <thead className="text-[10px] uppercase bg-black/20 text-zinc-600 tracking-wider font-light">
            <tr>
              <th className="px-4 py-3 font-normal">Kimon</th>
              <th className="px-4 py-3 font-normal text-center">Star</th>
              <th className="px-4 py-3 font-normal text-center">Gate</th>
              <th className="px-4 py-3 font-normal text-right">Start</th>
              <th className="px-4 py-3 font-normal text-right">End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {schedule.map((item, index) => {
               // Check if current time falls within this slot
               const now = new Date();
               const isCurrent = now >= item.startStandard && now < item.endStandard;
               const isExpanded = expandedIndex === index;
               
               return (
                <React.Fragment key={index}>
                  <tr 
                    onClick={() => toggleRow(index)}
                    className={`transition-colors duration-300 group/row cursor-pointer ${isCurrent ? "bg-emerald-900/10" : "hover:bg-zinc-800/30"} ${isExpanded ? "bg-zinc-800/30" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                          <span className={`text-xl font-serif font-light ${isCurrent ? "text-emerald-400 text-glow" : "text-zinc-400 group-hover/row:text-zinc-300"}`}>
                              {item.etoKanji}
                          </span>
                          <div className="flex flex-col">
                              <span className="text-xs opacity-70 tracking-tight">{item.reading}</span>
                              {item.note && (
                                  <span className="text-[9px] text-amber-500/90 uppercase tracking-wider mt-0.5">{item.note}</span>
                              )}
                          </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-serif ${isCurrent ? "text-zinc-300" : "text-zinc-500"}`}>
                          {item.kyusei.japanese}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-serif ${item.hachimon.auspicious ? "text-amber-600/80" : "text-zinc-600"} ${isCurrent ? "opacity-100" : "opacity-70"}`}>
                          {item.hachimon.japanese}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-mono text-xs text-right ${isCurrent ? "text-emerald-300" : ""}`}>
                      {formatTime(item.startStandard)}
                    </td>
                    <td className={`px-4 py-3 font-mono text-xs text-right ${isCurrent ? "text-emerald-300" : ""}`}>
                      {formatTime(item.endStandard)}
                    </td>
                  </tr>
                  
                  {/* Expanded Content: Board Visualization */}
                  <tr>
                    <td colSpan={5} className={`px-0 py-0 transition-all duration-500 ease-in-out border-b-0 ${isExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0 hidden"}`}>
                      <div className="bg-zinc-950/50 p-6 flex flex-col items-center border-b border-zinc-800/50 shadow-inner">
                          <div className="mb-4 text-center">
                            <h3 className="text-sm font-serif text-zinc-300 mb-1">
                              {item.etoKanji} Hour Board
                            </h3>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                              Center: {item.kyusei.japanese}
                            </p>
                          </div>
                          <KigakuBoard centerStar={item.kyusei} />
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-[9px] text-center text-zinc-700 tracking-widest uppercase">
         Kyoto Solar Time • {date.toLocaleDateString()}
      </div>
    </div>
  );
}
