"use client";

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Compass, Calendar, Sliders, PlayCircle, Info, RefreshCw } from 'lucide-react';

export interface MetaphysicalConfig {
  targetDate: string; // YYYY-MM-DD
  useClassicalBoard: boolean; // true = 暦基準, false = 木星黄経基準
  physicalMonthMode?: 'coupled' | 'independent';
  directionFilterMode: 'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental';
  actionIntent: 'DEFAULT' | 'REST' | 'BUSINESS' | 'MIGRATION';
  birthDate?: string;
  birthLat?: number;
  birthLon?: number;
  baseLat?: number;
  baseLon?: number;
}

const DEFAULT_CONFIG: MetaphysicalConfig = {
  targetDate: new Date().toISOString().split('T')[0],
  useClassicalBoard: true,
  physicalMonthMode: 'independent',
  directionFilterMode: 'composite',
  actionIntent: 'DEFAULT',
};

interface MetaphysicalConfigBarProps {
  onConfigChange?: (config: MetaphysicalConfig) => void;
}

export const MetaphysicalConfigBar: React.FC<MetaphysicalConfigBarProps> = ({ onConfigChange }) => {
  const [config, setConfig] = useState<MetaphysicalConfig>(DEFAULT_CONFIG);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      let loadedConfig = { ...DEFAULT_CONFIG };

      // 1. Try local storage
      const localData = localStorage.getItem('tactical_config_v1');
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (parsed.use_classical_board !== undefined) loadedConfig.useClassicalBoard = parsed.use_classical_board;
          if (parsed.physical_month_mode !== undefined) loadedConfig.physicalMonthMode = parsed.physical_month_mode;
          if (parsed.direction_filter_mode !== undefined) loadedConfig.directionFilterMode = parsed.direction_filter_mode;
          if (parsed.action_intent !== undefined) loadedConfig.actionIntent = parsed.action_intent;
          if (parsed.target_date) loadedConfig.targetDate = parsed.target_date;
          if (parsed.birth_date) loadedConfig.birthDate = parsed.birth_date;
          if (parsed.birth_lat !== undefined) loadedConfig.birthLat = parsed.birth_lat;
          if (parsed.birth_lon !== undefined) loadedConfig.birthLon = parsed.birth_lon;
          if (parsed.base_lat !== undefined) loadedConfig.baseLat = parsed.base_lat;
          if (parsed.base_lon !== undefined) loadedConfig.baseLon = parsed.base_lon;
        } catch (e) {
          console.error("Failed to parse localStorage config:", e);
        }
      }

      // 2. Try API user-config (overwrite/merge)
      try {
        const res = await fetch('/api/user-config');
        if (res.ok) {
          const apiData = await res.json();
          if (apiData.use_classical_board !== undefined) loadedConfig.useClassicalBoard = apiData.use_classical_board;
          if (apiData.physical_month_mode !== undefined) loadedConfig.physicalMonthMode = apiData.physical_month_mode;
          if (apiData.direction_filter_mode !== undefined) loadedConfig.directionFilterMode = apiData.direction_filter_mode;
          if (apiData.action_intent !== undefined) loadedConfig.actionIntent = apiData.action_intent;
          if (apiData.target_date) loadedConfig.targetDate = apiData.target_date;
          if (apiData.birth_date) loadedConfig.birthDate = apiData.birth_date;
          if (apiData.birth_lat !== undefined) loadedConfig.birthLat = apiData.birth_lat;
          if (apiData.birth_lon !== undefined) loadedConfig.birthLon = apiData.birth_lon;
          if (apiData.base_lat !== undefined) loadedConfig.baseLat = apiData.base_lat;
          if (apiData.base_lon !== undefined) loadedConfig.baseLon = apiData.base_lon;
        }
      } catch (e) {
        console.warn("Failed to load user config from API, relying on localStorage:", e);
      }

      setConfig(loadedConfig);
      if (onConfigChange) onConfigChange(loadedConfig);
    };

    loadConfig();

    // Listen to updates from other instances
    const handleGlobalUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<MetaphysicalConfig>;
      if (customEvent.detail) {
        setConfig(customEvent.detail);
        if (onConfigChange) onConfigChange(customEvent.detail);
      }
    };

    window.addEventListener('metaphysical-config-updated', handleGlobalUpdate);
    return () => {
      window.removeEventListener('metaphysical-config-updated', handleGlobalUpdate);
    };
  }, []);

  const saveConfig = async (newConfig: MetaphysicalConfig) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    setIsSyncing(true);

    const apiBody: any = {
      use_classical_board: updatedConfig.useClassicalBoard,
      physical_month_mode: updatedConfig.physicalMonthMode || 'independent',
      direction_filter_mode: updatedConfig.directionFilterMode,
      action_intent: updatedConfig.actionIntent,
      target_date: updatedConfig.targetDate
    };
    if (updatedConfig.birthDate) apiBody.birth_date = updatedConfig.birthDate;
    if (updatedConfig.birthLat !== undefined) apiBody.birth_lat = updatedConfig.birthLat;
    if (updatedConfig.birthLon !== undefined) apiBody.birth_lon = updatedConfig.birthLon;
    if (updatedConfig.baseLat !== undefined) apiBody.base_lat = updatedConfig.baseLat;
    if (updatedConfig.baseLon !== undefined) apiBody.base_lon = updatedConfig.baseLon;

    // Save locally
    try {
      const localData = localStorage.getItem('tactical_config_v1');
      let currentLocal = {};
      if (localData) {
        try { currentLocal = JSON.parse(localData); } catch (e) {}
      }
      localStorage.setItem('tactical_config_v1', JSON.stringify({
        ...currentLocal,
        ...apiBody
      }));
    } catch (e) {
      console.error("Failed to save config to localStorage:", e);
    }

    // Save to API
    try {
      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiBody)
      });
    } catch (e) {
      console.error("Failed to save config to API:", e);
    }

    // Dispatch global event for instant synchrony across same-page components
    const event = new CustomEvent<MetaphysicalConfig>('metaphysical-config-updated', { detail: updatedConfig });
    window.dispatchEvent(event);

    // Trigger parent callback
    if (onConfigChange) {
      onConfigChange(updatedConfig);
    }

    setTimeout(() => setIsSyncing(false), 400);
  };

  const handleToggleClassical = () => {
    saveConfig({ ...config, useClassicalBoard: !config.useClassicalBoard });
  };

  const handleFilterChange = (mode: MetaphysicalConfig['directionFilterMode']) => {
    saveConfig({ ...config, directionFilterMode: mode });
  };

  const handleIntentChange = (intent: MetaphysicalConfig['actionIntent']) => {
    saveConfig({ ...config, actionIntent: intent });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    saveConfig({ ...config, targetDate: e.target.value });
  };

  const getFilterLabel = (mode: MetaphysicalConfig['directionFilterMode']) => {
    const labels = {
      composite: '総合判定 (Composite)',
      personal_kigaku: '個人吉凶のみ (Nine Star Ki)',
      personal_bazi: '個人天中殺のみ (Void Zodiac)',
      environmental: '環境方位のみ (Environmental)',
    };
    return labels[mode];
  };

  const getIntentLabel = (intent: MetaphysicalConfig['actionIntent']) => {
    const labels = {
      DEFAULT: '標準 (Default)',
      REST: '休息・健康 (Rest)',
      BUSINESS: 'ビジネス (Business)',
      MIGRATION: '長期移住 (Migration)',
    };
    return labels[intent];
  };

  return (
    <div className="w-full bg-zinc-950/80 border border-zinc-800 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden text-zinc-100 transition-all font-mono text-xs select-none">
      
      {/* 1. Header (Compact Display Bar) */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-zinc-900/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse">
            <Compass className="w-4 h-4" />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold uppercase tracking-wider">目標日:</span>
              <span className="text-white font-bold">{config.targetDate}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold uppercase tracking-wider">基準:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                config.useClassicalBoard ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {config.useClassicalBoard 
                  ? '古典暦基準 (立春基準)' 
                  : `物理天体基準 (木星黄経 - ${config.physicalMonthMode === 'coupled' ? '伝統連動' : '物理独立'})`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold uppercase tracking-wider">フィルタ:</span>
              <span className="text-zinc-300 font-semibold">{getFilterLabel(config.directionFilterMode).split(' ')[0]}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold uppercase tracking-wider">目的:</span>
              <span className="text-zinc-300 font-semibold">{getIntentLabel(config.actionIntent).split(' ')[0]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {isSyncing && (
            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
              Syncing...
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </div>

      {/* 2. Expanded Options (Accordion Settings Panel) */}
      {isExpanded && (
        <div className="border-t border-zinc-900 bg-zinc-950/40 p-5 space-y-5 animate-slideDown">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            
            {/* Target Date */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" /> 目標年月日
              </label>
              <input 
                type="date" 
                value={config.targetDate}
                onChange={handleDateChange}
                className="w-full px-3 py-2 bg-black border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-indigo-500/40 transition-colors shadow-inner"
              />
            </div>

            {/* Board Standard */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" /> 方位盤基準
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-black rounded-xl border border-zinc-900">
                <button
                  type="button"
                  onClick={() => saveConfig({ ...config, useClassicalBoard: true })}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    config.useClassicalBoard 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  暦基準 (古典)
                </button>
                <button
                  type="button"
                  onClick={() => saveConfig({ ...config, useClassicalBoard: false })}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    !config.useClassicalBoard 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  木星黄経 (物理)
                </button>
              </div>

              {/* Sub-option for Physical Month Star Calculation */}
              {!config.useClassicalBoard && (
                <div className="pt-1 space-y-1">
                  <span className="text-[9px] text-zinc-500 block">月盤の算出方法:</span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-black rounded-lg border border-zinc-900">
                    <button
                      type="button"
                      onClick={() => saveConfig({ ...config, physicalMonthMode: 'independent' })}
                      className={`py-1 rounded text-[9px] font-bold transition-all ${
                        config.physicalMonthMode === 'independent' || !config.physicalMonthMode
                          ? 'bg-zinc-800 text-white shadow-sm'
                          : 'bg-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                      title="物理独立型: 年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。"
                    >
                      物理独立
                    </button>
                    <button
                      type="button"
                      onClick={() => saveConfig({ ...config, physicalMonthMode: 'coupled' })}
                      className={`py-1 rounded text-[9px] font-bold transition-all ${
                        config.physicalMonthMode === 'coupled'
                          ? 'bg-zinc-800 text-white shadow-sm'
                          : 'bg-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                      title="伝統連動型: 木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"
                    >
                      伝統連動
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Direction Filter Mode */}
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-indigo-400" /> 吉凶方位フィルター
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-black rounded-xl border border-zinc-900">
                {(['composite', 'personal_kigaku', 'personal_bazi', 'environmental'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleFilterChange(mode)}
                    className={`py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                      config.directionFilterMode === mode 
                        ? 'bg-zinc-800 text-white border-zinc-700 shadow-sm' 
                        : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {mode === 'composite' ? '総合 (ALL)' : 
                     mode === 'personal_kigaku' ? '個人吉凶' : 
                     mode === 'personal_bazi' ? '天中殺のみ' : '環境のみ'}
                  </button>
                ))}
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-zinc-900/50">
            
            {/* Action Intent Weighting */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
                <PlayCircle className="w-3.5 h-3.5 text-indigo-400" /> アクション目的 (重みづけ)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-black rounded-xl border border-zinc-900">
                {(['DEFAULT', 'REST', 'BUSINESS', 'MIGRATION'] as const).map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    onClick={() => handleIntentChange(intent)}
                    className={`py-1.5 rounded-lg text-[9px] font-bold transition-all border ${
                      config.actionIntent === intent 
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' 
                        : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {intent === 'DEFAULT' ? '標準' :
                     intent === 'REST' ? '休息・健康' :
                     intent === 'BUSINESS' ? 'ビジネス' : '長期移住'}
                  </button>
                ))}
              </div>
            </div>

            {/* Explanation box */}
            <div className="p-3 bg-black/60 rounded-xl border border-zinc-900/80 flex items-start gap-2.5 text-[10px] text-zinc-500 leading-normal">
              <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-zinc-400 block mb-0.5">フィルター/目的の効果説明</span>
                {config.directionFilterMode === 'personal_kigaku' && '「個人吉凶」が選択されているため、本命星や相性星のみを評価します。五黄殺等の共通環境凶方位や天中殺は計算から無視されます。'}
                {config.directionFilterMode === 'personal_bazi' && '「個人天中殺のみ」が選択されています。生誕の日干支から算出される空亡（天中殺）方位のみをペナルティとして抽出します。'}
                {config.directionFilterMode === 'environmental' && '「環境方位のみ」が選択されています。五黄殺・暗剣殺・各種「破」といった万人共通の環境凶方位のみをマッピングします。'}
                {config.directionFilterMode === 'composite' && '「総合判定」が選択されています。環境の地磁気および天体干渉と、個人のバイオリズムを重ね合わせて統合評価します。'}
                {!config.useClassicalBoard && (
                  <span className="block mt-1 text-amber-400">
                    {config.physicalMonthMode === 'coupled' 
                      ? '※物理月盤は「伝統連動型」で動作中：木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。'
                      : '※物理月盤は「物理独立型」で動作中：年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。'}
                  </span>
                )}
                <span className="block mt-1">
                  {config.actionIntent === 'REST' && '※「休息目的」に合わせたバイオリズム・月相・気学の吉方位の重み付け補正がアクティブです。'}
                  {config.actionIntent === 'BUSINESS' && '※「ビジネス目的」に合わせたタイミング・方位価値（Q値）の活性化補正がアクティブです。'}
                  {config.actionIntent === 'MIGRATION' && '※「長期移住目的」に特化し、年盤・月盤の長期レイヤーを最重要視する評価ロジックが働いています。'}
                  {config.actionIntent === 'DEFAULT' && '※「標準目的」で動作中。各レイヤーをフラットに評価します。'}
                </span>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
