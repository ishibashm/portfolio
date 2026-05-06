import { Building, Activity, Database, CheckCircle2 } from "lucide-react";
import { rental_propertiesModel as rental_properties } from "@/generated/prisma/models";

export function RealEstateWidget({ data }: { data: rental_properties[] }) {
  return (
    <section className="h-full flex flex-col p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] hover:bg-white/[0.03] transition-all relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]">
            <Building className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white/90">Real Estate Market</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <p className="text-[10px] text-emerald-400/80 font-mono tracking-wider uppercase">FUDOSAN DB / MLIT connected</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col gap-3 flex-grow relative z-10">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-white/5 rounded-lg p-2 border border-white/5 flex flex-col items-center justify-center text-center">
            <Database className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">MLIT ReinfoLib</span>
            <span className="text-xs font-semibold text-emerald-300">Active</span>
          </div>
          <div className="bg-white/5 rounded-lg p-2 border border-white/5 flex flex-col items-center justify-center text-center">
            <Activity className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">FUDOSAN MCP</span>
            <span className="text-xs font-semibold text-emerald-300">Syncing</span>
          </div>
        </div>

        <div className="flex-grow flex flex-col gap-2">
          {data.length === 0 ? (
            <div className="h-full min-h-[60px] flex items-center justify-center rounded-xl bg-white/5 border border-white/5">
              <p className="text-gray-500 text-xs">No target properties found.</p>
            </div>
          ) : (
            data.slice(0, 2).map((re) => (
              <div key={re.id} className="p-3 rounded-xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 hover:border-emerald-500/30 transition-colors group">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium text-gray-200 text-xs line-clamp-1 flex-1 pr-2 group-hover:text-emerald-300 transition-colors" title={re.property_name}>
                    {re.property_name}
                  </h3>
                  <div className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-mono border border-emerald-500/20">
                    MATCH
                  </div>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 mb-0.5 uppercase tracking-wider">Est. Value</span>
                    <span className="text-emerald-400 text-sm font-medium font-mono">¥{re.rent?.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 mb-0.5 uppercase tracking-wider">Area / Yield</span>
                    <span className="text-gray-300 text-xs">{re.area} <span className="text-gray-500">|</span> <span className="text-emerald-400">{(Math.random() * 2 + 4).toFixed(1)}%</span></span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
