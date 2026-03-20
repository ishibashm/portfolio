import React from "react";
import { Database, MapPin, CalendarClock, Crosshair } from "lucide-react";

interface PersonalProfileProps {
  birthDate: string;
  setBirthDate: (v: string) => void;
  birthLat: number;
  setBirthLat: (v: number) => void;
  birthLon: number;
  setBirthLon: (v: number) => void;
  baseLat: number;
  setBaseLat: (v: number) => void;
  baseLon: number;
  setBaseLon: (v: number) => void;
  onSave?: () => void;
  isSaving?: boolean;
  onLoad?: () => void;
  onGetGPS?: () => void;
  onAuth?: () => void;
  isLoggedIn?: boolean;
}

export function PersonalProfileConfig({
  birthDate, setBirthDate,
  birthLat, setBirthLat,
  birthLon, setBirthLon,
  baseLat, setBaseLat,
  baseLon, setBaseLon,
  onSave, isSaving, onLoad, onGetGPS, onAuth, isLoggedIn
}: PersonalProfileProps) {
  
  return (
    <div className="w-full max-w-4xl mt-4 bg-zinc-950/80 border border-zinc-800/80 p-4 rounded-sm shadow-2xl md:backdrop-blur-md relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <Database size={120} className="text-zinc-600" />
      </div>
      
      <div className="flex items-center gap-2 mb-4 relative z-10 border-b border-zinc-800/50 pb-2 justify-between">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-blue-500 md:animate-pulse" />
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">
            Hardware Initialization & Anchor Sync / 初期設定・ベース同期座標
          </h2>
        </div>
        <div className="flex items-center">
          {isLoggedIn ? (
            <span className="text-[9px] font-mono text-emerald-500 tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 md:animate-pulse"></span>
              LINK ESTABLISHED
            </span>
          ) : (
            <button 
              onClick={onAuth}
              className="text-[9px] font-mono tracking-[0.2em] text-zinc-500 hover:text-white hover:underline transition-all"
            >
              [ AUTHENTICATE ]
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10 font-mono text-xs">
        
        {/* Factory Settings (Birth) */}
        <div className="space-y-4">
           <div className="flex items-center gap-1.5 mb-2 border-b border-zinc-900 pb-1">
              <CalendarClock size={12} className="text-zinc-500" />
              <span className="text-[9px] text-zinc-400 tracking-wider">HARDWARE INIT (生年月日・出生地)</span>
           </div>
           
           <div className="flex flex-col gap-1">
              <label className="text-[8px] text-zinc-500 uppercase">Birth Timestamp / 宇宙エネルギー初期入力値</label>
              <input 
                type="datetime-local" 
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full"
              />
              <span className="text-[7px] text-zinc-600 mt-0.5 text-justify">自律神経の初期ベースライン（本命星システム）を設定。</span>
           </div>

           <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                 <label className="text-[8px] text-zinc-500 uppercase">Birth Lat (緯度)</label>
                 <input 
                   type="number" step="0.000001"
                   value={birthLat}
                   onChange={(e) => setBirthLat(Number(e.target.value))}
                   className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full uppercase text-center"
                 />
              </div>
              <div className="flex flex-col gap-1">
                 <label className="text-[8px] text-zinc-500 uppercase">Birth Lon (経度)</label>
                 <input 
                   type="number" step="0.000001"
                   value={birthLon}
                   onChange={(e) => setBirthLon(Number(e.target.value))}
                   className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1.5 rounded-sm outline-none focus:border-blue-500 transition-colors w-full uppercase text-center"
                 />
              </div>
              <div className="col-span-2 text-[7px] text-zinc-600 mt-0.5 text-justify">生まれた瞬間の磁場（磁束密度と伏角）がハードの防御力係数を決定。</div>
           </div>
        </div>

        {/* Current Anchor (Base) */}
        <div className="space-y-4">
           <div className="flex items-center gap-1.5 mb-2 border-b border-zinc-900 pb-1">
              <Crosshair size={12} className="text-zinc-500" />
              <span className="text-[9px] text-zinc-400 tracking-wider">CURRENT ANCHOR (現在の居住地・±0V基準)</span>
           </div>
           
           <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                 <label className="text-[8px] text-zinc-500 uppercase">Current Base Lat (緯度)</label>
                 <input 
                   type="number" step="0.000001"
                   value={baseLat}
                   onChange={(e) => setBaseLat(Number(e.target.value))}
                   className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1.5 rounded-sm outline-none focus:border-emerald-500 transition-colors w-full uppercase text-center"
                 />
              </div>
              <div className="flex flex-col gap-1">
                 <label className="text-[8px] text-zinc-500 uppercase">Current Base Lon (経度)</label>
                 <input 
                   type="number" step="0.000001"
                   value={baseLon}
                   onChange={(e) => setBaseLon(Number(e.target.value))}
                   className="bg-zinc-900 border border-zinc-700 text-zinc-300 px-2 py-1.5 rounded-sm outline-none focus:border-emerald-500 transition-colors w-full uppercase text-center"
                 />
              </div>
              <div className="col-span-2 text-[7px] text-zinc-600 mt-0.5 text-justify">
                現在の自律神経が同調（順化）している絶対的な磁気ゼロポイント。電位差（ダメージ/回復）の方位ベクトル計算の起点。
              </div>
           </div>

           <div className="mt-4 p-2 bg-blue-950/20 border border-blue-900/50 rounded-sm">
             <div className="flex gap-2 items-start">
               <MapPin size={10} className="text-blue-400 mt-0.5 min-w-[10px]" />
               <p className="text-[8px] text-blue-200/70 leading-relaxed text-justify">
                 現在位置のGPS（{baseLat.toFixed(2)}, {baseLon.toFixed(2)}）を基準に、タクティカルマップの磁気偏角とベクトルがリアルタイム生成されています。
               </p>
             </div>
           </div>

         </div>
         
         <div className="md:col-span-2 pt-4 flex justify-between gap-2 border-t border-zinc-900 mt-2 flex-wrap">
            <div className="flex gap-2">
              <button
                 onClick={onGetGPS}
                 className="px-4 py-2 rounded-sm font-mono text-[10px] uppercase border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              >
                 [ GET DEVICE GPS ]
              </button>
              <button
                 onClick={onLoad}
                 className="px-4 py-2 rounded-sm font-mono text-[10px] uppercase border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 transition-colors"
               >
                 [ SYNC FROM CLOUD ]
              </button>
            </div>
            <button
               onClick={onSave}
               disabled={isSaving}
               className={`px-8 py-2 rounded-sm font-mono text-[10px] uppercase tracking-[0.2em] transition-all relative overflow-hidden group ${
                  isSaving 
                  ? "bg-zinc-800 text-zinc-500 cursor-wait" 
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] active:scale-95"
               }`}
            >
               {isSaving ? "[ SYNCING... ]" : "[ COMMIT PERSISTENCE ]"}
               <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-full transition-transform duration-500 skew-x-[-20deg]"></div>
            </button>
         </div>

      </div>
    </div>
  );
}
