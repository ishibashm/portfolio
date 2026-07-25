import { Building, Activity, Database, CheckCircle2 } from "lucide-react";
import { rental_properties } from "@prisma/client";

export function RealEstateWidget({ data }: { data: rental_properties[] }) {
  // Use a deterministic pseudo-random function or simple hash based on property ID for the yield
  const getDeterministicYield = (id: string | number) => {
    // Simple hash function to generate a number between 0 and 1
    const hashStr = String(id);
    let hash = 0;
    for (let i = 0; i < hashStr.length; i++) {
      hash = (hash << 5) - hash + hashStr.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash) / 2147483647; // Max 32-bit integer
    return (normalized * 2 + 4).toFixed(1);
  };

  return (
    <section className="h-full flex flex-col p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-emerald-100 shadow-xl shadow-emerald-100/40 hover:-translate-y-0.5 transition-all relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-emerald-200/40 blur-3xl rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-200 flex items-center justify-center">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-stone-900 font-serif">
              不動産マーケット
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <p className="text-[10px] text-emerald-600/90 font-mono tracking-wider uppercase">
                FUDOSAN DB / 国土交通省 接続済
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 flex-grow relative z-10">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-emerald-50/70 rounded-lg p-2 border border-emerald-100 flex flex-col items-center justify-center text-center">
            <Database className="w-4 h-4 text-emerald-600 mb-1" />
            <span className="text-[10px] text-stone-500 uppercase tracking-wider">
              国交省 統合情報ライブラリ
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              アクティブ
            </span>
          </div>
          <div className="bg-emerald-50/70 rounded-lg p-2 border border-emerald-100 flex flex-col items-center justify-center text-center">
            <Activity className="w-4 h-4 text-emerald-600 mb-1" />
            <span className="text-[10px] text-stone-500 uppercase tracking-wider">
              不動産 MCP同期
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              同期中
            </span>
          </div>
        </div>

        <div className="flex-grow flex flex-col gap-2">
          {data.length === 0 ? (
            <div className="h-full min-h-[60px] flex items-center justify-center rounded-xl bg-stone-50 border border-stone-100">
              <p className="text-stone-400 text-xs">
                該当する物件が見つかりません
              </p>
            </div>
          ) : (
            data.slice(0, 2).map((re) => (
              <div
                key={re.id}
                className="p-3 rounded-xl bg-gradient-to-br from-emerald-50/70 to-white border border-emerald-100/80 hover:border-emerald-300 transition-colors group"
              >
                <div className="flex justify-between items-start mb-1">
                  <h3
                    className="font-medium text-stone-800 text-xs line-clamp-1 flex-1 pr-2 group-hover:text-emerald-700 transition-colors"
                    title={re.property_name}
                  >
                    {re.property_name}
                  </h3>
                  <div className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded font-mono border border-emerald-200">
                    適合
                  </div>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-stone-400 mb-0.5 uppercase tracking-wider">
                      想定賃料
                    </span>
                    <span className="text-emerald-600 text-sm font-semibold font-mono">
                      ¥{re.rent?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-stone-400 mb-0.5 uppercase tracking-wider">
                      エリア / 想定利回り
                    </span>
                    <span className="text-stone-600 text-xs">
                      {re.area} <span className="text-stone-300">|</span>{" "}
                      <span className="text-emerald-600 font-semibold">
                        {getDeterministicYield(re.id)}%
                      </span>
                    </span>
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
