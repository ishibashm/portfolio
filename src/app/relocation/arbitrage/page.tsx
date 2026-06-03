"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Loader2, MapPin, TrendingUp, Sparkles, Filter, ChevronRight, Download, Search, Settings, RefreshCw } from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { MetaphysicalConfigBar, MetaphysicalConfig } from "@/components/layout/MetaphysicalConfigBar";
import { AstroGridCalendar } from "@/components/realestate/AstroGridCalendar";
import { getPropertyPinColors } from "@/utils/arbitrageHelpers";

// 吉凶バッジ定義のインターフェース
interface BadgeItem {
  label: string;
  type: 'calendar' | 'individual'; // 枠線のみ or 塗りつぶし
  colorClass: string;
  priority: number;
}

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeDateTimeLocal = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } catch (e) {}
  if (dateStr.includes('T')) {
    return dateStr.substring(0, 16);
  }
  return `${dateStr}T12:00`;
};

import dynamic from "next/dynamic";

const LocationPickerInner = dynamic(() => import("@/components/LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-mono text-xs text-gray-500">
      マップを読み込み中...
    </div>
  ),
});

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTransitioningDate, setIsTransitioningDate] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Sidebar & Layout views states
  const [showListView, setShowListView] = useState(false);
  const [showTableView, setShowTableView] = useState(false);

  // Relocation & Fortune Settings States
  const [baseLat, setBaseLat] = useState("34.9911"); // Default Kyoto
  const [baseLon, setBaseLon] = useState("135.7248");
  const [birthLat, setBirthLat] = useState("34.3952"); // Default Birth Location (Hiroshima)
  const [birthLon, setBirthLon] = useState("132.4482");
  const [birthDate, setBirthDate] = useState("1988-11-25T04:26"); // Default Birth Date with time
  const [targetDate, setTargetDate] = useState(getTodayString()); // Default Target Date
  const [directionFilterMode, setDirectionFilterMode] = useState("composite");
  const [actionIntent, setActionIntent] = useState("MIGRATION");
  const [radiusKm, setRadiusKm] = useState("10"); // Scan Radius (km)
  const [prefecture, setPrefecture] = useState("all"); // Target Prefecture
  const [useClassical, setUseClassical] = useState(false);
  const [layerMode, setLayerMode] = useState("year");
  const [useTrueNorth, setUseTrueNorth] = useState(false);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState(true);
  const [dataLimit, setDataLimit] = useState(500);
  const [mapCenter, setMapCenter] = useState<[number, number]>([34.9911, 135.7248]);

  // Viewport bounds for map searching
  const [mapBounds, setMapBounds] = useState<{minLat: number; maxLat: number; minLon: number; maxLon: number; zoom: number} | null>(null);

  // 前回のパラメータを保持して比較する ref
  const prevParamsRef = useRef({
    baseLat,
    baseLon,
    birthLat,
    birthLon,
    birthDate,
    radiusKm,
    prefecture,
    useClassical,
    layerMode,
    useTrueNorth,
    lunarPhaseModifier,
    directionFilterMode,
    actionIntent,
    mapBounds
  });

  // Temporary local inputs to avoid API hammering during typing
  const [localLat, setLocalLat] = useState("34.9911");
  const [localLon, setLocalLon] = useState("135.7248");
  const [localBirthDate, setLocalBirthDate] = useState("1988-11-25T04:26");
  const [localBirthLat, setLocalBirthLat] = useState("34.3952");
  const [localBirthLon, setLocalBirthLon] = useState("132.4482");
  const [showBirthMapPicker, setShowBirthMapPicker] = useState(false);
  const [localTargetDate, setLocalTargetDate] = useState(getTodayString());

  // おすすめ度（星マーク）の描画
  const renderStars = (score: number) => {
    let starCount = 1;
    if (score >= 80) starCount = 5;
    else if (score >= 70) starCount = 4;
    else if (score >= 60) starCount = 3;
    else if (score >= 50) starCount = 2;

    return (
      <div className="flex gap-0.5 text-amber-400 text-xs" title={`おすすめ度: ${score.toFixed(1)}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < starCount ? "opacity-100 text-amber-400" : "opacity-20 text-zinc-600"}>
            ★
          </span>
        ))}
      </div>
    );
  };

  // 吉凶要因バッジの描画
  const renderFactorBadges = (item: any) => {
    const targetDay = item.dateScores?.[3];
    if (!targetDay) return null;
    const details = targetDay.scoreDetails;

    const badges: BadgeItem[] = [];

    // 1. 大凶要因
    if (item.astrologyStatus === 'NOISE_GOU') badges.push({ label: '五黄殺', type: 'individual', colorClass: 'bg-red-500/25 text-red-300 border border-red-500/40', priority: 1 });
    if (item.astrologyStatus === 'NOISE_ANKEN') badges.push({ label: '暗剣殺', type: 'individual', colorClass: 'bg-red-500/25 text-red-300 border border-red-500/40', priority: 1 });
    if (item.astrologyStatus === 'NOISE_HA') badges.push({ label: '歳破', type: 'individual', colorClass: 'bg-red-500/25 text-red-300 border border-red-500/40', priority: 1 });
    if (item.astrologyStatus === 'NOISE_HONMEI') badges.push({ label: '本命殺', type: 'individual', colorClass: 'bg-red-500/25 text-red-300 border border-red-500/40', priority: 1 });
    if (item.astrologyStatus === 'NOISE_TEKI') badges.push({ label: '本命的殺', type: 'individual', colorClass: 'bg-red-500/25 text-red-300 border border-red-500/40', priority: 1 });

    // 2. 最大吉要因
    if (item.isTendo) badges.push({ label: '天道方位', type: 'individual', colorClass: 'bg-gradient-to-br from-amber-400/25 to-yellow-500/25 text-amber-300 border border-amber-400/40 font-bold', priority: 2 });
    if (targetDay.luckyDays?.isTensho) badges.push({ label: '天赦日', type: 'calendar', colorClass: 'border border-yellow-400/50 text-yellow-300 bg-yellow-400/5', priority: 2 });

    // 3. 通常の吉要因
    if (targetDay.rokuyo?.includes("大安")) badges.push({ label: '大安', type: 'calendar', colorClass: 'border border-indigo-400/50 text-indigo-300 bg-indigo-400/5', priority: 3 });
    if (targetDay.luckyDays?.isIchiryumanbai) badges.push({ label: '一粒万倍', type: 'calendar', colorClass: 'border border-emerald-400/50 text-emerald-300 bg-emerald-400/5', priority: 3 });
    if (item.astroFlags?.includes("JUPITER_LINE")) badges.push({ label: '木星ライン', type: 'individual', colorClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', priority: 3 });
    if (item.astroFlags?.includes("VENUS_LINE")) badges.push({ label: '金星ライン', type: 'individual', colorClass: 'bg-blue-500/15 text-blue-300 border border-blue-500/30', priority: 3 });
    if (item.astroFlags?.includes("SUN_LINE")) badges.push({ label: '太陽ライン', type: 'individual', colorClass: 'bg-purple-500/15 text-purple-300 border border-purple-500/30', priority: 3 });

    // 4. 軽い凶や警告
    if (targetDay.status === 'NOISE_VOID' || (details && details.voidPenalty < 0) || item.astroFlags?.includes("VOID_TIME_HAZARD")) {
      const isBlocker = item.maxAstroFactor === "天中殺期間 (移転NG)";
      badges.push({
        label: isBlocker ? '天中殺 (移転NG)' : '天中殺',
        type: 'individual',
        colorClass: isBlocker ? 'bg-red-500/25 text-red-300 border border-red-500/40 font-bold' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
        priority: isBlocker ? 1 : 4
      });
    }
    if (item.astroFlags?.includes("DOYOU_HAZARD") || (details && details.doyouPenalty < 0)) badges.push({ label: '土用期間', type: 'calendar', colorClass: 'border border-zinc-600 text-zinc-400 bg-zinc-700/5', priority: 4 });
    if (item.astrologyStatus === 'NOISE_GETSUMEI') badges.push({ label: '月命殺', type: 'individual', colorClass: 'bg-zinc-800 text-zinc-400 border border-zinc-700', priority: 4 });
    if (item.astrologyStatus === 'NOISE_GETSUTEKI') badges.push({ label: '月命的殺', type: 'individual', colorClass: 'bg-zinc-800 text-zinc-400 border border-zinc-700', priority: 4 });
    if (item.astrologyStatus === 'NOISE_NODE') badges.push({ label: '月交点', type: 'individual', colorClass: 'bg-zinc-800 text-zinc-400 border border-zinc-700', priority: 4 });
    if (item.astroFlags?.includes("DECLINATION_WARNING")) badges.push({ label: '偏角ズレ', type: 'individual', colorClass: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20', priority: 4 });

    // 優先度順、かつ同じ優先度なら「カレンダー共通（暦）」を左、「個別」を右に配置
    badges.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.type !== b.type) return a.type === 'calendar' ? -1 : 1;
      return 0;
    });

    const displayLimit = 5;
    const visibleBadges = badges.slice(0, displayLimit);
    const hiddenCount = badges.length - displayLimit;

    return (
      <div className="flex flex-wrap gap-1.5 items-center mt-2.5">
        {visibleBadges.map((badge, idx) => (
          <span 
            key={idx}
            className={`px-2 py-0.5 rounded text-[9.5px] font-medium leading-none ${badge.colorClass}`}
          >
            {badge.label}
          </span>
        ))}
        {hiddenCount > 0 && (
          <div className="group relative">
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200 cursor-help leading-none">
              +{hiddenCount}
            </span>
            {/* ポップオーバー */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 bg-zinc-950/95 border border-zinc-800 rounded-lg p-2.5 shadow-xl text-[10px] text-zinc-300 hidden group-hover:block z-50 backdrop-blur-sm">
              <div className="font-bold text-zinc-400 border-b border-zinc-800 pb-1 mb-1.5">すべての吉凶要因:</div>
              <div className="flex flex-wrap gap-1.5">
                {badges.map((badge, idx) => (
                  <span key={idx} className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium leading-none ${badge.colorClass}`}>
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 全体ロード時のカード型スケルトン
  const renderCardSkeletons = () => {
    return Array.from({ length: 4 }).map((_, idx) => (
      <tr key={idx} className="border-b border-gray-100 dark:border-gray-900 animate-pulse">
        <td className="px-6 py-4">
          <div className="w-16 h-4 bg-zinc-800/40 rounded-md" />
        </td>
        <td className="px-6 py-4 space-y-2">
          <div className="w-48 h-4 bg-zinc-800/40 rounded-md" />
          <div className="w-32 h-3 bg-zinc-800/25 rounded-md" />
          <div className="w-40 h-8 bg-zinc-800/20 rounded-md mt-2" />
        </td>
        <td className="px-6 py-4 space-y-1.5">
          <div className="w-20 h-4 bg-zinc-800/40 rounded-md" />
          <div className="w-24 h-3 bg-zinc-800/25 rounded-md" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-16 h-4 bg-zinc-800/40 rounded-md ml-auto" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-12 h-4 bg-zinc-800/40 rounded-md ml-auto" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="w-24 h-3 bg-zinc-800/25 rounded-md ml-auto" />
        </td>
      </tr>
    ));
  };

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMaxRent, setFilterMaxRent] = useState<string>("");
  const [filterMinYield, setFilterMinYield] = useState<string>("");
  const [filterMaxAge, setFilterMaxAge] = useState<string>("");
  const itemsPerPage = 50;

  // Sorting state
  type SortColumn = 'arbitrage' | 'yield' | 'astrology' | 'rent' | 'distance';
  interface SortConfig { key: SortColumn; direction: 'desc' | 'asc' }
  const [sortConfigs, setSortConfigs] = useState<SortConfig[]>([{ key: 'arbitrage', direction: 'desc' }]);

  // Load from localStorage on mount
  useEffect(() => {
    let bsLat = "34.9911";
    let bsLon = "135.7248";
    let bLat = "34.3952";
    let bLon = "132.4482";
    let bDate = "1988-11-25T04:26";
    let tDate = getTodayString();
    let rKm = "10";
    let pref = "all";
    let classical = false;
    let layer = "year";
    let trueNorth = false;

    // Load from unified tactical config
    const tacticalConfig = localStorage.getItem('tactical_config_v1');
    let filter = "composite";
    let intent = "MIGRATION";
    if (tacticalConfig) {
      try {
        const config = JSON.parse(tacticalConfig);
        if (config.birth_date) {
          bDate = config.birth_date;
        }
        if (config.birth_lat !== undefined) bLat = config.birth_lat.toString();
        if (config.birth_lon !== undefined) bLon = config.birth_lon.toString();
        if (config.base_lat !== undefined) bsLat = config.base_lat.toString();
        if (config.base_lon !== undefined) bsLon = config.base_lon.toString();
        if (config.use_classical_board !== undefined) classical = config.use_classical_board;
        if (config.use_true_north !== undefined) trueNorth = config.use_true_north;
        if (config.layer_mode !== undefined) layer = config.layer_mode;
        if (config.target_date) tDate = config.target_date;
        if (config.direction_filter_mode !== undefined) filter = config.direction_filter_mode;
        if (config.action_intent !== undefined) intent = config.action_intent;
      } catch (e) { }
    } else {
      // Fallback to legacy isolated keys
      const storedLat = localStorage.getItem("arb_baseLat");
      const storedLon = localStorage.getItem("arb_baseLon");
      const storedBirth = localStorage.getItem("arb_birthDate");
      const storedTarget = localStorage.getItem("arb_targetDate");
      const storedRadius = localStorage.getItem("arb_radiusKm");
      const storedPrefecture = localStorage.getItem("arb_prefecture");
      const storedClassical = localStorage.getItem("arb_useClassical");
      const storedLayer = localStorage.getItem("arb_layerMode");
      const storedTrueNorth = localStorage.getItem("arb_useTrueNorth");

      if (storedLat) bsLat = storedLat;
      if (storedLon) bsLon = storedLon;
      if (storedBirth) bDate = storedBirth;
      if (storedTarget) tDate = storedTarget;
      if (storedRadius) rKm = storedRadius;
      if (storedPrefecture) pref = storedPrefecture;
      if (storedClassical) classical = storedClassical === "true";
      if (storedLayer) layer = storedLayer;
      if (storedTrueNorth) trueNorth = storedTrueNorth === "true";
    }

    setBaseLat(bsLat); setLocalLat(bsLat);
    setBaseLon(bsLon); setLocalLon(bsLon);
    setMapCenter([parseFloat(bsLat), parseFloat(bsLon)]);
    setBirthLat(bLat); setLocalBirthLat(bLat);
    setBirthLon(bLon); setLocalBirthLon(bLon);
    setBirthDate(bDate); setLocalBirthDate(normalizeDateTimeLocal(bDate));
    setTargetDate(tDate); setLocalTargetDate(tDate);
    setRadiusKm(rKm);
    setPrefecture(pref);
    setUseClassical(classical);
    setLayerMode(layer);
    setUseTrueNorth(trueNorth);
    setDirectionFilterMode(filter);
    setActionIntent(intent);

    setInitialLoaded(true);

    const handleGlobalConfigUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail) {
        const detail = customEvent.detail;
        
        const newTargetDate = detail.targetDate || detail.target_date;
        const newUseClassical = detail.useClassicalBoard !== undefined ? detail.useClassicalBoard : detail.use_classical_board;
        const newFilterMode = detail.directionFilterMode || detail.direction_filter_mode;
        const newIntent = detail.actionIntent || detail.action_intent;
        const newBirthDate = detail.birthDate || detail.birth_date;
        const newBirthLat = detail.birthLat !== undefined ? detail.birthLat.toString() : (detail.birth_lat !== undefined ? detail.birth_lat.toString() : undefined);
        const newBirthLon = detail.birthLon !== undefined ? detail.birthLon.toString() : (detail.birth_lon !== undefined ? detail.birth_lon.toString() : undefined);
        const newBaseLat = detail.baseLat !== undefined ? detail.baseLat.toString() : (detail.base_lat !== undefined ? detail.base_lat.toString() : undefined);
        const newBaseLon = detail.baseLon !== undefined ? detail.baseLon.toString() : (detail.base_lon !== undefined ? detail.base_lon.toString() : undefined);

        if (newTargetDate) {
          setTargetDate(newTargetDate);
          setLocalTargetDate(newTargetDate);
        }
        if (newUseClassical !== undefined) {
          setUseClassical(newUseClassical);
        }
        if (newFilterMode) {
          setDirectionFilterMode(newFilterMode);
        }
        if (newIntent) {
          setActionIntent(newIntent);
        }
        if (newBirthDate) {
          setBirthDate(newBirthDate);
          setLocalBirthDate(normalizeDateTimeLocal(newBirthDate));
        }
        if (newBirthLat) {
          setBirthLat(newBirthLat);
          setLocalBirthLat(newBirthLat);
        }
        if (newBirthLon) {
          setBirthLon(newBirthLon);
          setLocalBirthLon(newBirthLon);
        }
        if (newBaseLat && newBaseLon) {
          setBaseLat(newBaseLat);
          setLocalLat(newBaseLat);
          setBaseLon(newBaseLon);
          setLocalLon(newBaseLon);
          setMapCenter([parseFloat(newBaseLat), parseFloat(newBaseLon)]);
        }
      }
    };

    window.addEventListener('metaphysical-config-updated', handleGlobalConfigUpdate);
    return () => {
      window.removeEventListener('metaphysical-config-updated', handleGlobalConfigUpdate);
    };
  }, []);

  const fetchData = async (isDateChange = false) => {
    if (!initialLoaded) return;
    if (isDateChange) {
      setIsTransitioningDate(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.append("limit", dataLimit.toString());
      params.append("baseLat", baseLat);
      params.append("baseLon", baseLon);
      params.append("birthLat", birthLat);
      params.append("birthLon", birthLon);
      if (birthDate) params.append("birthDate", birthDate);
      if (targetDate) params.append("targetDate", targetDate);
      
      // Send either radius or map bounding box depending on mapBounds
      if (mapBounds && mapBounds.zoom >= 10) { // Only use bounds if reasonably zoomed in
        params.append("minLat", mapBounds.minLat.toString());
        params.append("maxLat", mapBounds.maxLat.toString());
        params.append("minLon", mapBounds.minLon.toString());
        params.append("maxLon", mapBounds.maxLon.toString());
        params.append("radiusKm", "all"); // Disable radius when using bounds
      } else {
        params.append("radiusKm", radiusKm);
      }

      params.append("prefecture", prefecture);
      params.append("useClassical", useClassical.toString());
      params.append("layerMode", layerMode);
      params.append("useTrueNorth", useTrueNorth.toString());
      params.append("lunarPhaseModifier", lunarPhaseModifier.toString());
      params.append("directionFilterMode", directionFilterMode);
      params.append("actionIntent", actionIntent);

      const res = await fetch(`/api/rentals/arbitrage?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.properties || []);
        setMetadata(json.metadata || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsTransitioningDate(false);
    }
  };

  const handleDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
    setLocalDateChange(newDateStr);
  };

  const setLocalDateChange = (newDateStr: string) => {
    setTargetDate(newDateStr);
    setLocalTargetDate(newDateStr);
    localStorage.setItem("arb_targetDate", newDateStr);
    saveUnifiedConfig({ target_date: newDateStr });

    // Dispatch global event for instant sync
    const event = new CustomEvent("metaphysical-config-updated", {
      detail: {
        targetDate: newDateStr,
        useClassicalBoard: useClassical,
        directionFilterMode: directionFilterMode,
        actionIntent: actionIntent
      }
    });
    window.dispatchEvent(event);
  };

  // Re-fetch data whenever params change
  useEffect(() => {
    if (!initialLoaded) return;

    const prev = prevParamsRef.current;
    const isOtherChanged = 
      prev.baseLat !== baseLat ||
      prev.baseLon !== baseLon ||
      prev.birthLat !== birthLat ||
      prev.birthLon !== birthLon ||
      prev.birthDate !== birthDate ||
      prev.radiusKm !== radiusKm ||
      prev.prefecture !== prefecture ||
      prev.useClassical !== useClassical ||
      prev.layerMode !== layerMode ||
      prev.useTrueNorth !== useTrueNorth ||
      prev.lunarPhaseModifier !== lunarPhaseModifier ||
      prev.directionFilterMode !== directionFilterMode ||
      prev.actionIntent !== actionIntent ||
      JSON.stringify(prev.mapBounds) !== JSON.stringify(mapBounds);

    prevParamsRef.current = {
      baseLat,
      baseLon,
      birthLat,
      birthLon,
      birthDate,
      radiusKm,
      prefecture,
      useClassical,
      layerMode,
      useTrueNorth,
      lunarPhaseModifier,
      directionFilterMode,
      actionIntent,
      mapBounds
    };

    fetchData(!isOtherChanged);
  }, [baseLat, baseLon, birthLat, birthLon, birthDate, targetDate, radiusKm, prefecture, useClassical, layerMode, useTrueNorth, lunarPhaseModifier, directionFilterMode, actionIntent, mapBounds, initialLoaded]);

  const saveUnifiedConfig = async (updatedFields: any) => {
    try {
      const localData = localStorage.getItem('tactical_config_v1');
      let currentLocal: any = {};
      if (localData) {
        try { currentLocal = JSON.parse(localData); } catch (e) {}
      }
      
      const mergedConfig = {
        ...currentLocal,
        ...updatedFields
      };
      
      localStorage.setItem('tactical_config_v1', JSON.stringify(mergedConfig));

      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });

      // Dispatch global config update event for instant sync
      const event = new CustomEvent("metaphysical-config-updated", {
        detail: {
          targetDate: mergedConfig.target_date || targetDate,
          useClassicalBoard: mergedConfig.use_classical_board !== undefined ? mergedConfig.use_classical_board : useClassical,
          directionFilterMode: mergedConfig.direction_filter_mode || directionFilterMode,
          actionIntent: mergedConfig.action_intent || actionIntent,
          birthDate: mergedConfig.birth_date || birthDate,
          birthLat: mergedConfig.birth_lat !== undefined ? mergedConfig.birth_lat : parseFloat(birthLat),
          birthLon: mergedConfig.birth_lon !== undefined ? mergedConfig.birth_lon : parseFloat(birthLon),
          baseLat: mergedConfig.base_lat !== undefined ? mergedConfig.base_lat : parseFloat(baseLat),
          baseLon: mergedConfig.base_lon !== undefined ? mergedConfig.base_lon : parseFloat(baseLon)
        }
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error("Failed to sync config in arbitrage page:", e);
    }
  };

  // Handle manual submit of location/birth date
  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setBaseLat(localLat);
    setBaseLon(localLon);
    setBirthDate(localBirthDate);
    setMapCenter([parseFloat(localLat), parseFloat(localLon)]);

    localStorage.setItem("arb_baseLat", localLat);
    localStorage.setItem("arb_baseLon", localLon);
    localStorage.setItem("arb_birthDate", localBirthDate);

    saveUnifiedConfig({
      base_lat: parseFloat(localLat),
      base_lon: parseFloat(localLon),
      birth_date: localBirthDate
    });
  };

  // Sync radius changes instantly
  const handleRadiusChange = (newRadius: string) => {
    setRadiusKm(newRadius);
    localStorage.setItem("arb_radiusKm", newRadius);
    setCurrentPage(1);
    saveUnifiedConfig({ radius_km: newRadius });
  };

  // Sync prefecture changes instantly
  const handlePrefectureChange = (newPref: string) => {
    setPrefecture(newPref);
    localStorage.setItem("arb_prefecture", newPref);
    setCurrentPage(1);

    // 都道府県が指定された場合はスキャン半径制限を「制限なし」にし、地図の表示中心を代表座標に移動する
    let nextRadius = radiusKm;
    let nextCenter: [number, number] = mapCenter;

    if (newPref === "愛知県") {
      nextCenter = [35.1815, 136.9064];
      nextRadius = "all";
    } else if (newPref === "岐阜県") {
      nextCenter = [35.4233, 136.7607];
      nextRadius = "all";
    } else if (newPref === "滋賀県") {
      nextCenter = [35.0178, 135.8547];
      nextRadius = "all";
    } else if (newPref === "all") {
      // 全国が選ばれた場合は、日本中心に移動して半径制限を解除する
      nextCenter = [36.2048, 138.2529];
      nextRadius = "all";
    }

    setRadiusKm(nextRadius);
    setMapCenter(nextCenter);
    
    localStorage.setItem("arb_radiusKm", nextRadius);

    saveUnifiedConfig({ 
      prefecture: newPref,
      radius_km: nextRadius
    });
  };

  const applyPreset = (presetName: string, lat: string, lon: string, pref: string) => {
    setLocalLat(lat);
    setLocalLon(lon);
    setBaseLat(lat);
    setBaseLon(lon);
    setPrefecture(pref);
    localStorage.setItem("arb_baseLat", lat);
    localStorage.setItem("arb_baseLon", lon);
    localStorage.setItem("arb_prefecture", pref);
    setCurrentPage(1);
    saveUnifiedConfig({
      base_lat: parseFloat(lat),
      base_lon: parseFloat(lon),
      prefecture: pref
    });
  };

  // Sync toggles instantly
  const handleClassicalToggle = (val: boolean) => {
    setUseClassical(val);
    localStorage.setItem("arb_useClassical", val.toString());
    setCurrentPage(1);
    saveUnifiedConfig({ use_classical_board: val });

    // Dispatch global event for instant sync
    const event = new CustomEvent("metaphysical-config-updated", {
      detail: {
        targetDate: targetDate,
        useClassicalBoard: val,
        directionFilterMode: directionFilterMode,
        actionIntent: actionIntent
      }
    });
    window.dispatchEvent(event);
  };

  const handleTrueNorthToggle = (val: boolean) => {
    setUseTrueNorth(val);
    localStorage.setItem("arb_useTrueNorth", val.toString());
    setCurrentPage(1);
    saveUnifiedConfig({ use_true_north: val });
  };

  const handleLayerModeChange = (val: string) => {
    setLayerMode(val);
    localStorage.setItem("arb_layerMode", val);
    setCurrentPage(1);
    saveUnifiedConfig({ layer_mode: val });
  };

  // Geolocation trigger
  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latStr = position.coords.latitude.toFixed(5);
          const lonStr = position.coords.longitude.toFixed(5);
          setLocalLat(latStr);
          setLocalLon(lonStr);
          setBaseLat(latStr);
          setBaseLon(lonStr);
          localStorage.setItem("arb_baseLat", latStr);
          localStorage.setItem("arb_baseLon", lonStr);
        },
        (error) => {
          alert("位置情報の取得に失敗しました: " + error.message);
        }
      );
    } else {
      alert("お使いのブラウザは位置情報をサポートしていません。");
    }
  };

  // Filters logic
  const handleFilterNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterName(e.target.value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1);
  };

  const safeData = data.filter(d => d.astrologyScore >= 0);

  const filteredData = safeData.filter(d => {
    if (filterStatus !== "ALL" && (!d.astrologyStatus || !d.astrologyStatus.includes(filterStatus))) return false;
    
    if (filterMaxRent) {
      const maxRent = Number(filterMaxRent) * 10000;
      if (d.totalRent > maxRent) return false;
    }

    if (filterMinYield) {
      const minYield = Number(filterMinYield);
      if (d.yieldScore < minYield) return false;
    }

    if (filterMaxAge) {
      const maxAge = Number(filterMaxAge);
      if (d.building_age === null || d.building_age === undefined || d.building_age > maxAge) return false;
    }

    if (filterName) {
      const term = filterName.toLowerCase();
      const addr = (d.address || '').toLowerCase();
      const name = (d.property_name || '').toLowerCase();
      if (!addr.includes(term) && !name.includes(term)) return false;
    }
    return true;
  });

  const sortedTableData = [...filteredData].sort((a, b) => {
    for (const config of sortConfigs) {
      let result = 0;
      const key = config.key;
      if (key === 'arbitrage') result = b.arbitrageScore - a.arbitrageScore;
      else if (key === 'yield') result = b.yieldScore - a.yieldScore;
      else if (key === 'astrology') result = b.astrologyScore - a.astrologyScore;
      else if (key === 'rent') result = b.totalRent - a.totalRent;
      else if (key === 'distance') result = (a.distanceKm || 0) - (b.distanceKm || 0);

      if (result !== 0) {
        return config.direction === 'desc' ? result : -result;
      }
    }
    return 0;
  });

  const propertiesInBounds = useMemo(() => {
    if (!mapBounds) return sortedTableData;
    return sortedTableData.filter(d => {
      if (d.lat === null || d.lon === null) return false;
      return d.lat >= mapBounds.minLat &&
             d.lat <= mapBounds.maxLat &&
             d.lon >= mapBounds.minLon &&
             d.lon <= mapBounds.maxLon;
    });
  }, [sortedTableData, mapBounds]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterName !== "") count++;
    if (filterStatus !== "ALL") count++;
    if (filterMaxRent !== "") count++;
    if (filterMinYield !== "") count++;
    if (filterMaxAge !== "") count++;
    return count;
  }, [filterName, filterStatus, filterMaxRent, filterMinYield, filterMaxAge]);

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSortChange = (newSort: SortColumn, e: React.MouseEvent) => {
    setSortConfigs(prev => {
      const isMultiSort = e.shiftKey;
      const existingSortIndex = prev.findIndex(config => config.key === newSort);
      let newConfigs = [...prev];

      if (newConfigs.length === 0) newConfigs = [{ key: 'arbitrage', direction: 'desc' }];
      return newConfigs;
    });
    setCurrentPage(1);
  };

  const renderSortIndicator = (key: SortColumn) => {
    const configIndex = sortConfigs.findIndex(c => c.key === key);
    if (configIndex === -1) return <span className="inline-block w-4 text-transparent group-hover:text-gray-400">↑</span>;
    const config = sortConfigs[configIndex];
    return (
      <span className="inline-flex items-center text-indigo-500">
        <span className="w-3">{config.direction === 'desc' ? '↓' : '↑'}</span>
        {sortConfigs.length > 1 && <span className="text-[10px] ml-0.5 opacity-70 font-mono">{configIndex + 1}</span>}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] p-3 sm:p-5 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* Metaphysical Configuration Bar */}
        <MetaphysicalConfigBar 
          onConfigChange={(newConfig) => {
            setTargetDate(newConfig.targetDate);
            setUseClassical(newConfig.useClassicalBoard);
            setDirectionFilterMode(newConfig.directionFilterMode);
            setActionIntent(newConfig.actionIntent);
          }}
        />
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-900 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-indigo-500 animate-pulse" />
              不動産アービトラージ・スキャナー
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-xs max-w-2xl">
              吉方位（風水・九星気学）と市場の歪み（利回り偏差値）を算出し、運気とコスパが最強の割安物件をスキャンします。
            </p>
          </div>
          <button 
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-semibold transition-all shadow-sm shrink-0 self-start md:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            再スキャン
          </button>
        </div>

        {/* 2-Column Split Dashboard Layout */}
        <div className="flex flex-col lg:flex-row gap-5 items-stretch min-h-[650px] relative">
          
          {/* Left Column: Sidebar (expands from 33% to 55% in Table Mode) */}
          <div 
            className={`transition-all duration-300 ease-in-out ${
              showTableView && showListView ? 'w-full lg:w-[55%]' : 'w-full lg:w-1/3'
            } bg-gray-50 dark:bg-[#09090b] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col h-[680px] relative z-10`}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 bg-gray-50/95 dark:bg-[#09090b]/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 p-3 flex items-center justify-between z-30 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800/40">
                  条件 ({activeFiltersCount})
                </span>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  表示範囲内: <b className="text-gray-900 dark:text-white font-mono text-xs">{propertiesInBounds.length}</b> 件
                </span>
              </div>
              
              {/* Toggle Button for Filter/List View (Only when <= 100 properties) */}
              {propertiesInBounds.length <= 100 ? (
                <button
                  onClick={() => setShowListView(!showListView)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    showListView 
                      ? 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300' 
                      : 'bg-teal-500 hover:bg-teal-600 text-white shadow-sm'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {showListView ? "絞込に戻る" : "一覧を表示"}
                </button>
              ) : (
                <span className="text-[10px] text-zinc-500 font-medium">
                  ※100件以下で一覧表示可能
                </span>
              )}
            </div>

            {/* Sidebar Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!showListView ? (
                // VIEW 1: Filter Screen & Settings
                <>
                  {/* Geographic & Calculations Settings */}
                  <div className="space-y-4 bg-white dark:bg-zinc-950 p-4 rounded-2xl border border-gray-100 dark:border-zinc-900 shadow-xs">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">スキャン地域と計算方式</h3>
                    
                    {/* Prefecture Selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">
                        対象都道府県 (DBフィルタ)
                      </label>
                      <select
                        value={prefecture}
                        onChange={e => handlePrefectureChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="all">全国 / すべて</option>
                        <option value="愛知県">愛知県 (42,641件)</option>
                        <option value="岐阜県">岐阜県 (26,623件)</option>
                        <option value="滋賀県">滋賀県 (29,284件)</option>
                      </select>
                    </div>

                    {/* Birth Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block flex items-center justify-between">
                        <span>生年月日 (吉方位用)</span>
                        <span className="text-[9px] text-zinc-500 font-normal">時間指定可</span>
                      </label>
                      <input
                        type="datetime-local"
                        value={localBirthDate}
                        onChange={e => {
                          setLocalBirthDate(e.target.value);
                          setBirthDate(e.target.value);
                          localStorage.setItem("arb_birthDate", e.target.value);
                          saveUnifiedConfig({ birth_date: e.target.value });
                        }}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {/* Birth Location coordinates */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">
                          出生地座標 (天体ライン用)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowBirthMapPicker(!showBirthMapPicker)}
                          className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors ${showBirthMapPicker ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' : 'bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-800'}`}
                        >
                          {showBirthMapPicker ? '閉じる' : '地図で検索'}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.00001"
                          value={localBirthLat}
                          onChange={e => {
                            setLocalBirthLat(e.target.value);
                            setBirthLat(e.target.value);
                            saveUnifiedConfig({ birth_lat: parseFloat(e.target.value) });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="緯度"
                        />
                        <input
                          type="number"
                          step="0.00001"
                          value={localBirthLon}
                          onChange={e => {
                            setLocalBirthLon(e.target.value);
                            setBirthLon(e.target.value);
                            saveUnifiedConfig({ birth_lon: parseFloat(e.target.value) });
                          }}
                          className="w-1/2 px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono"
                          placeholder="経度"
                        />
                      </div>
                    </div>

                    {showBirthMapPicker && (
                      <div className="w-full h-48 rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 relative z-20">
                        <LocationPickerInner
                          initialLat={Number(birthLat) || 34.3952}
                          initialLon={Number(birthLon) || 132.4482}
                          onSelect={(newLat: number, newLon: number) => {
                            const latStr = newLat.toFixed(5);
                            const lonStr = newLon.toFixed(5);
                            setLocalBirthLat(latStr);
                            setBirthLat(latStr);
                            setLocalBirthLon(lonStr);
                            setBirthLon(lonStr);
                            saveUnifiedConfig({ birth_lat: newLat, birth_lon: newLon });
                          }}
                        />
                      </div>
                    )}

                    {/* Layer Mode */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">
                        方位盤の計算レイヤー
                      </label>
                      <select
                        value={layerMode}
                        onChange={e => handleLayerModeChange(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="year">年盤 (長期・引越し向き)</option>
                        <option value="month">月盤 (中期・旅行向き)</option>
                        <option value="day">日盤 (短期・出張向き)</option>
                        <option value="final">総合ベクトル (全レイヤー統合)</option>
                      </select>
                    </div>

                    {/* Options Toggles */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-zinc-900">
                      <label className="flex items-center gap-2 text-[10px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useTrueNorth}
                          onChange={e => handleTrueNorthToggle(e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        真北を使用 (無効時は磁北補正)
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={lunarPhaseModifier}
                          onChange={e => {
                            setLunarPhaseModifier(e.target.checked);
                            setCurrentPage(1);
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        月相タイミング補正 (日単位 +/-10点)
                      </label>
                    </div>
                  </div>

                  {/* Filter Criteria Panel */}
                  <div className="space-y-4 bg-white dark:bg-zinc-950 p-4 rounded-2xl border border-gray-100 dark:border-zinc-900 shadow-xs">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-semibold">絞り込みフィルター</h3>
                    
                    {/* Search query input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">物件名・住所検索</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="物件名・住所で検索..."
                          value={filterName}
                          onChange={handleFilterNameChange}
                          className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Status Select */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">吉凶ステータス</label>
                      <select
                        value={filterStatus}
                        onChange={handleFilterStatusChange}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none cursor-pointer focus:border-indigo-500"
                      >
                        <option value="ALL">全ステータス</option>
                        <option value="OPTIMAL">OPTIMAL (大吉)</option>
                        <option value="SAFE">SAFE (吉)</option>
                        <option value="NOISE">NOISE (凶)</option>
                      </select>
                    </div>

                    {/* Rent & Age & Yield filters */}
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">総家賃上限 (万円)</label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxRent}
                          onChange={e => { setFilterMaxRent(e.target.value); setCurrentPage(1); }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">築年数上限 (年)</label>
                        <input
                          type="number"
                          placeholder="例: 15"
                          value={filterMaxAge}
                          onChange={e => { setFilterMaxAge(e.target.value); setCurrentPage(1); }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 block">最小利回り偏差値</label>
                        <input
                          type="number"
                          placeholder="例: 60"
                          value={filterMinYield}
                          onChange={e => { setFilterMinYield(e.target.value); setCurrentPage(1); }}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* TOP 5 お買い得アコーディオン (HTML5 details) */}
                  <details className="bg-white dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-900 overflow-hidden shadow-xs group" open>
                    <summary className="p-4 font-bold text-xs text-gray-900 dark:text-white flex items-center justify-between cursor-pointer select-none group-open:border-b group-open:border-gray-100 dark:group-open:border-zinc-900">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500 animate-bounce" />
                        最強のアービトラージ物件 TOP 5
                      </span>
                      <ChevronRight className="w-4 h-4 transition-transform duration-200 group-open:rotate-90 text-gray-400" />
                    </summary>
                    <div className="p-3.5 space-y-3.5">
                      {loading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />
                          ))}
                        </div>
                      ) : filteredData.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-[10px]">
                          合致する物件がありません。
                        </div>
                      ) : (
                        filteredData.slice(0, 5).map((item) => (
                          <div 
                            key={item.id}
                            onClick={() => {
                              setMapCenter([item.lat, item.lon]);
                            }}
                            className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200/50 dark:border-zinc-800/40 hover:border-indigo-500/50 cursor-pointer transition-colors shadow-2xs"
                          >
                            <div className="truncate pr-2 max-w-[70%]">
                              {item.url ? (
                                <a href={item.url} target="_blank" rel="noreferrer" className="font-bold text-gray-900 dark:text-gray-100 text-[11px] truncate hover:text-indigo-500 transition-colors hover:underline block">
                                  {item.property_name}
                                </a>
                              ) : (
                                <div className="font-bold text-gray-900 dark:text-gray-100 text-[11px] truncate">{item.property_name}</div>
                              )}
                              <div className="text-[10px] text-gray-500 mt-1 flex flex-col gap-0.5">
                                <span className="font-semibold">
                                  {item.direction ? `${item.direction} (${item.maxAstroFactor || '計算中'})` : '方位不明'}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-[11px]">
                                {Math.round((item.totalRent || 0) / 10000)}万円
                              </div>
                              <div className="mt-1 flex justify-end">
                                {renderStars(item.arbitrageScore)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </>
              ) : (
                // VIEW 2: Property List Screen (Cards or Table)
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-200 dark:border-zinc-800 pb-2">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      物件リスト ({sortedTableData.length}件中、表示範囲内)
                    </h3>
                    
                    {/* Card vs Table toggle switches */}
                    <div className="flex items-center gap-1 bg-zinc-200 dark:bg-zinc-900 p-0.5 rounded-lg shrink-0 select-none">
                      <button 
                        onClick={() => setShowTableView(false)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${!showTableView ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        カード
                      </button>
                      <button 
                        onClick={() => setShowTableView(true)}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${showTableView ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-xs' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        テーブル
                      </button>
                    </div>
                  </div>

                  {propertiesInBounds.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 text-xs">
                      現在の表示範囲内に条件合致する物件がありません。地図をドラッグするかズームアウトしてください。
                    </div>
                  ) : !showTableView ? (
                    // Card View List inside sidebar
                    <div className="space-y-3.5">
                      {propertiesInBounds.map(item => {
                        const pinColors = getPropertyPinColors(item);
                        return (
                          <div 
                            key={item.id} 
                            onClick={() => {
                              setMapCenter([item.lat, item.lon]);
                            }}
                            className="p-3.5 rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200/60 dark:border-zinc-900 hover:border-indigo-500/50 cursor-pointer transition-colors shadow-2xs relative group"
                          >
                            <div className="flex justify-between items-start gap-1 mb-1">
                              <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs leading-snug line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                {item.url ? (
                                  <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                                    {item.property_name}
                                  </a>
                                ) : (
                                  item.property_name
                                )}
                              </h4>
                              <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold shrink-0 leading-none ${pinColors.bgClass} ${pinColors.textClass}`}>
                                {pinColors.label}
                              </span>
                            </div>

                            <div className="text-[10px] text-gray-500 truncate max-w-xs">{item.address || '住所情報なし'}</div>
                            
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5 pt-2 border-t border-gray-100 dark:border-zinc-900 text-[10px] text-gray-600 dark:text-gray-400 font-mono">
                              <div className="flex justify-between">
                                <span>総賃料:</span>
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {item.totalRent ? `${(item.totalRent / 10000).toFixed(1)}万円` : "不明"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>利回り偏差値:</span>
                                <span className={`font-bold ${item.yieldScore > 60 ? 'text-emerald-500' : 'text-gray-900 dark:text-white'}`}>
                                  {item.yieldScore.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex justify-between col-span-2">
                                <span>広さ/築年/徒歩:</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                  {item.size_sqm}㎡ / 築{item.building_age || 0}年 / {item.minutes_to_station || '不明'}分
                                </span>
                              </div>
                              <div className="flex justify-between col-span-2 pt-1 border-t border-zinc-100 dark:border-zinc-900/60">
                                <span>方位・吉凶:</span>
                                <span className={`font-bold ${pinColors.textClass}`}>
                                  {item.direction ? `${item.direction} (${item.maxAstroFactor})` : '不明'}
                                </span>
                              </div>
                            </div>

                            <div className="mt-2.5 flex justify-between items-center bg-gray-50 dark:bg-zinc-900/40 rounded-lg px-2 py-1.5">
                              {renderStars(item.arbitrageScore)}
                              <span className="text-[8px] text-gray-400 font-semibold">推奨スコア: {item.arbitrageScore.toFixed(1)}</span>
                            </div>

                            {/* Small date calendar row inside card */}
                            <div className="mt-2.5">
                              <AstroGridCalendar 
                                dateScores={item.dateScores} 
                                onDateChange={handleDateChange}
                                isTransitioning={isTransitioningDate}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Table View Mode inside expanded sidebar (55% width)
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-900 bg-white dark:bg-zinc-950">
                      <table className="w-full text-xs text-left min-w-[500px]">
                        <thead className="text-[10px] text-gray-500 uppercase bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors font-bold" onClick={(e) => handleSortChange('arbitrage', e)}>
                              おすすめ度 {renderSortIndicator('arbitrage')}
                            </th>
                            <th className="px-4 py-2.5 font-bold">物件名 / 住所</th>
                            <th className="px-4 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors font-bold" onClick={(e) => handleSortChange('astrology', e)}>
                              方位・吉凶 {renderSortIndicator('astrology')}
                            </th>
                            <th className="px-4 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors font-bold" onClick={(e) => handleSortChange('rent', e)}>
                              総家賃 {renderSortIndicator('rent')}
                            </th>
                            <th className="px-4 py-2.5 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors font-bold" onClick={(e) => handleSortChange('yield', e)}>
                              利回り偏差 {renderSortIndicator('yield')}
                            </th>
                            <th className="px-4 py-2.5 text-right font-bold">平米 / 築年 / 徒歩</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propertiesInBounds.map((item) => {
                            const pinColors = getPropertyPinColors(item);
                            return (
                              <tr 
                                key={item.id} 
                                onClick={() => {
                                  setMapCenter([item.lat, item.lon]);
                                }}
                                className="border-b border-gray-100 dark:border-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
                              >
                                <td className="px-4 py-3 font-mono">
                                  {renderStars(item.arbitrageScore)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-bold text-gray-900 dark:text-gray-100 truncate max-w-[180px]">
                                    {item.url ? (
                                      <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                                        {item.property_name}
                                      </a>
                                    ) : (
                                      item.property_name
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[180px]">{item.address}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`font-semibold ${pinColors.textClass}`}>
                                      {item.direction ? `${item.direction} (${item.maxAstroFactor})` : '不明'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold">
                                  {item.totalRent.toLocaleString()}円
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                  <span className={item.yieldScore > 60 ? "text-emerald-500 font-bold" : ""}>
                                    {item.yieldScore.toFixed(1)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 font-mono text-[10px]">
                                  {item.size_sqm}㎡ / 築{item.building_age || 0}年 / {item.minutes_to_station || '不明'}分
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Leaflet Map (shrinks to 45% width when table mode is expanded) */}
          <div 
            className={`transition-all duration-300 ease-in-out ${
              showTableView && showListView ? 'w-full lg:w-[45%]' : 'w-full lg:w-2/3'
            } h-[680px] rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 relative bg-gray-50 dark:bg-gray-900 shrink-0`}
          >
            <ArbitrageMap
              properties={filteredData}
              baseLat={Number(baseLat)}
              baseLon={Number(baseLon)}
              mapCenter={mapCenter}
              useTrueNorth={useTrueNorth}
              layerMode={layerMode}
              radiusKm={radiusKm}
              prefecture={prefecture}
              isTransitioningDate={isTransitioningDate}
              showListView={showListView}
              onDateChange={handleDateChange}
              onBoundsChange={(b) => {
                setMapBounds(prev => {
                  if (!prev || Math.abs(prev.minLat - b.minLat) > 0.001 || Math.abs(prev.minLon - b.minLon) > 0.001 || prev.zoom !== b.zoom) {
                    return b;
                  }
                  return prev;
                });
              }}
            />
            {loading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-xs z-[1000] flex flex-col items-center justify-center font-mono text-xs text-zinc-300">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                データベースから割安物件を走査中...
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
