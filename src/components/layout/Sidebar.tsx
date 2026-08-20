import React from "react";
import { useOmniStore } from "@/store/omniStore";
import {
  Folder,
  Settings,
  BarChart2,
  MessageSquare,
  Hexagon,
  Activity,
  Zap,
} from "lucide-react";

export const Sidebar = () => {
  const { activeWorkspaceId, setActiveWorkspace } = useOmniStore();

  return (
    <aside className="w-[280px] flex-shrink-0 border-r border-slate-800/80 bg-[#070b14] flex flex-col font-sans">
      {/* Logo Area */}
      <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
        <div className="relative">
          <Hexagon size={28} className="text-blue-500" strokeWidth={1.5} />
          <Zap
            size={14}
            className="text-emerald-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 fill-emerald-400/20"
          />
        </div>
        <div>
          <h1 className="text-base font-extrabold text-white tracking-widest leading-none">
            OMNI-TERMINAL
          </h1>
          <p className="text-[9px] text-blue-500/80 font-mono mt-0.5 tracking-[0.2em] uppercase">
            Enterprise Edition
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-6 custom-scrollbar">
        {/* Workspaces */}
        <div className="px-4 mb-8">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
            <Folder size={12} />
            Workspaces
          </h2>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setActiveWorkspace("ws-1")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group ${
                  activeWorkspaceId === "ws-1"
                    ? "bg-blue-600/10 text-blue-400 font-semibold shadow-[inset_2px_0_0_0_#3b82f6]"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <BarChart2
                  size={16}
                  className={
                    activeWorkspaceId === "ws-1"
                      ? "text-blue-500"
                      : "text-slate-500 group-hover:text-slate-400"
                  }
                />
                1. 投資・リサーチ (X/業績)
              </button>
            </li>
          </ul>
        </div>

        {/* Agent Status */}
        <div className="px-4">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
            <Activity size={12} />
            Agent Runtime Status
          </h2>
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-1">
            <ul className="space-y-0.5">
              <li className="flex items-center justify-between text-xs px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2.5 text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] relative">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>
                  </div>
                  Finance Agent
                </div>
                <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  IDLE
                </span>
              </li>
              <li className="flex items-center justify-between text-xs px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2.5 text-slate-300">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] relative">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></span>
                  </div>
                  Researcher Agent
                </div>
                <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  IDLE
                </span>
              </li>
              <li className="flex items-center justify-between text-xs px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2.5 text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-slate-600 border border-slate-500"></div>
                  Publisher Agent
                </div>
                <span className="text-[9px] font-mono text-slate-500">
                  SLEEP
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer Settings */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
        <ul className="space-y-1">
          <li>
            <button className="flex items-center gap-3 text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 w-full px-3 py-2 rounded-lg transition-colors">
              <MessageSquare size={14} className="text-slate-500" />
              Social Credentials
            </button>
          </li>
          <li>
            <button className="flex items-center gap-3 text-xs text-slate-400 hover:text-white hover:bg-slate-800/80 w-full px-3 py-2 rounded-lg transition-colors">
              <Settings size={14} className="text-slate-500" />
              Terminal Settings
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
};
