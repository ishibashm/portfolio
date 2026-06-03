"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Loader2, MapPin, TrendingUp, Sparkles, Filter, ChevronRight, Download, Search, Settings, RefreshCw } from "lucide-react";
import { ArbitrageMap } from "@/components/ArbitrageMap";
import { MetaphysicalConfigBar, MetaphysicalConfig } from "@/components/layout/MetaphysicalConfigBar";
import { AstroGridCalendar } from "@/components/realestate/AstroGridCalendar";

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

export default function ArbitrageScannerPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTransitioningDate, setIsTransitioningDate] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Relocation & Fortune Settings States
  const [baseLat, setBaseLat] = useState("34.9911"); // Default Kyoto
  const [baseLon, setBaseLon] = useState("135.7248");
  const [birthLat, setBirthLat] = useState("34.3952"); // Default Birth Location (Hiroshima)
  const [birthLon, setBirthLon] = useState("132.4482");
  const [birthDate, setBirthDate] = useState("1988-11-25"); // Default Birth Date
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
  const [localBirthDate, setLocalBirthDate] = useState("1988-11-25");
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
    let bDate = "1988-11-25";
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
          const dStr = config.birth_date.split('T')[0];
          bDate = dStr;
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
    setBirthLat(bLat);
    setBirthLon(bLon);
    setBirthDate(bDate); setLocalBirthDate(bDate);
    setTargetDate(tDate); setLocalTargetDate(tDate);
    setRadiusKm(rKm);
    setPrefecture(pref);
    setUseClassical(classical);
    setLayerMode(layer);
    setUseTrueNorth(trueNorth);
    setDirectionFilterMode(filter);
    setActionIntent(intent);

    setInitialLoaded(true);
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
  }, [baseLat, baseLon, birthDate, targetDate, radiusKm, prefecture, useClassical, layerMode, useTrueNorth, lunarPhaseModifier, directionFilterMode, actionIntent, mapBounds, initialLoaded]);

  const saveUnifiedConfig = async (updatedFields: any) => {
    try {
      const localData = localStorage.getItem('tactical_config_v1');
      let currentLocal = {};
      if (localData) {
        try { currentLocal = JSON.parse(localData); } catch (e) {}
      }
      localStorage.setItem('tactical_config_v1', JSON.stringify({ ...currentLocal, ...updatedFields }));

      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
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

  const totalPages = Math.ceil(sortedTableData.length / itemsPerPage);
  const currentTableData = sortedTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSortChange = (newSort: SortColumn, e: React.MouseEvent) => {
    setSortConfigs(prev => {
      const isMultiSort = e.shiftKey;
      const existingSortIndex = prev.findIndex(config => config.key === newSort);
      let newConfigs = [...prev];

      if (isMultiSort) {
        if (existingSortIndex >= 0) {
          if (newConfigs[existingSortIndex].direction === 'desc') newConfigs[existingSortIndex].direction = 'asc';
          else newConfigs.splice(existingSortIndex, 1);
        } else {
          newConfigs.push({ key: newSort, direction: 'desc' });
        }
      } else {
        if (existingSortIndex >= 0 && prev.length === 1) {
          newConfigs = [{ key: newSort, direction: prev[0].direction === 'desc' ? 'asc' : 'desc' }];
        } else {
          newConfigs = [{ key: newSort, direction: 'desc' }];
        }
      }
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
    <div className="min-h-screen bg-white dark:bg-[#050505] p-4 sm:p-8 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-8">
        
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-900 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-indigo-500 animate-pulse" />
              不動産アービトラージ・スキャナー
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 text-sm max-w-2xl">
              吉方位（風水・九星気学）と市場の歪み（利回り偏差値）を算出し、110万件以上のデータベースから、運気とコスパが最強の割安物件をスキャンします。
            </p>
          </div>
          <button 
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0 self-start md:self-center"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            再スキャン
          </button>
        </div>

        {/* Astro & Proximity Control Panel */}
        <div className="bg-gray-50 dark:bg-[#09090b] rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-500" />
              <h2 className="text-md font-bold tracking-tight text-gray-900 dark:text-gray-100">
                スキャナー設定 (吉方位・リロケーション条件)
              </h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-end">
            {/* Target Prefecture */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                対象都道府県 (DBフィルタ)
              </label>
              <select
                value={prefecture}
                onChange={e => handlePrefectureChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none cursor-pointer"
              >
                <option value="all">全国 / すべて</option>
                <option value="愛知県">愛知県 (42,641件)</option>
                <option value="岐阜県">岐阜県 (26,623件)</option>
                <option value="滋賀県">滋賀県 (29,284件)</option>
              </select>
            </div>

            {/* Birth Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                生年月日 (吉方位計算用)
              </label>
              <input
                type="date"
                value={localBirthDate}
                onChange={e => {
                  setLocalBirthDate(e.target.value);
                  setBirthDate(e.target.value);
                  localStorage.setItem("arb_birthDate", e.target.value);
                  saveUnifiedConfig({ birth_date: e.target.value });
                }}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {/* Layer Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block">
                方位盤の計算レイヤー
              </label>
              <select
                value={layerMode}
                onChange={e => handleLayerModeChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-xl text-sm outline-none cursor-pointer"
              >
                <option value="year">年盤 (長期・引越し向き)</option>
                <option value="month">月盤 (中期・旅行向き)</option>
                <option value="day">日盤 (短期・出張向き)</option>
                <option value="final">総合ベクトル (全レイヤー統合)</option>
              </select>
            </div>

            {/* Toggles */}
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex flex-wrap gap-x-6 gap-y-2 mt-2 pt-2 lg:pt-0 lg:mt-0 col-span-full">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useTrueNorth}
                  onChange={e => handleTrueNorthToggle(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                真北を使用 (無効時は磁北で補正計算)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <span className="font-bold text-indigo-500">方位基準: {useClassical ? '暦基準' : '木星黄経'} (上部バーで設定)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lunarPhaseModifier}
                  onChange={e => {
                    setLunarPhaseModifier(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                月相タイミング補正 (日単位 +/-10点)
              </label>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Leaflet Map Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="h-[550px] rounded-2xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-800 relative bg-gray-50 dark:bg-gray-900">
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
                onDateChange={handleDateChange}
                onBoundsChange={(b) => {
                  // Debounce map bounds updates slightly to avoid hammering the API
                  setMapBounds(prev => {
                    if (!prev || Math.abs(prev.minLat - b.minLat) > 0.001 || Math.abs(prev.minLon - b.minLon) > 0.001 || prev.zoom !== b.zoom) {
                      return b;
                    }
                    return prev;
                  });
                }}
              />
              {loading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex flex-col items-center justify-center font-mono text-xs text-zinc-300">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                  データベースから割安物件を走査中...
                </div>
              )}
            </div>
          </div>

          {/* Top Rankings */}
          <div className="space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-md">
              <Sparkles className="w-5 h-5 text-amber-500 animate-bounce" />
              最強のアービトラージ物件 TOP 5
            </h3>
            
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-zinc-950 border border-gray-200 dark:border-gray-900 animate-pulse" />
                ))}
              </div>
            ) : filteredData.length === 0 ? (
              <div className="p-8 rounded-2xl bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-gray-900 text-center text-gray-500 text-xs">
                スキャン条件に合致する物件がありませんでした。半径を広げるか現在地を変更してください。
              </div>
            ) : (
              <div className="space-y-3">
                {filteredData.slice(0, 5).map((item, i) => (
                  <div key={item.id} className="block group">
                    <div className="flex justify-between items-center p-3.5 rounded-xl bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-gray-900 group-hover:border-indigo-500/50 transition-colors shadow-sm relative">
                      <div className="truncate pr-2">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate group-hover:text-indigo-500 transition-colors hover:underline">
                            {item.property_name}
                          </a>
                        ) : (
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{item.property_name}</div>
                        )}
                        <div className="text-xs text-gray-500 flex flex-col gap-1 mt-1.5">
                          <span className="font-semibold">
                            {item.direction ? `${item.direction} (${item.maxAstroFactor || '計算中'})` : '方位不明'}
                          </span>
                          {/* ミニバッジ表示 */}
                          {isTransitioningDate ? (
                            <div className="flex gap-1.5 mt-1 animate-pulse">
                              <div className="w-10 h-3.5 bg-zinc-800/40 rounded" />
                              <div className="w-12 h-3.5 bg-zinc-800/40 rounded" />
                            </div>
                          ) : (
                            renderFactorBadges(item)
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                          {Math.round((item.totalRent || 0) / 10000)}万円
                        </div>
                        {/* おすすめ度（星マーク）を小さく表示 */}
                        <div className="mt-1 flex justify-end">
                          {renderStars(item.arbitrageScore)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50 dark:bg-zinc-950/20">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">物件データベース</h2>
              <div className="text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-2">
                <span>
                  条件に合致する全 <b>{metadata?.totalCount?.toLocaleString() || data.length}</b> 件のうち、スコア上位 <b>{data.length}</b> 件を取得しています。
                  (全体平均平米単価: {metadata?.meanSqmRent ? `${Math.round(metadata.meanSqmRent).toLocaleString()}円` : '...'})
                </span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="物件名・住所で検索..."
                  value={filterName}
                  onChange={handleFilterNameChange}
                  className="pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-48 transition-all"
                />
              </div>
              <select
                value={filterStatus}
                onChange={handleFilterStatusChange}
                className="bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none cursor-pointer"
              >
                <option value="ALL">全ステータス</option>
                <option value="OPTIMAL">OPTIMAL (大吉)</option>
                <option value="SAFE">SAFE (吉)</option>
                <option value="NOISE">NOISE (凶)</option>
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">家賃≦</span>
                <input
                  type="number"
                  placeholder="例: 15"
                  value={filterMaxRent}
                  onChange={e => { setFilterMaxRent(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
                <span className="text-xs text-gray-500">万円</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">築年数≦</span>
                <input
                  type="number"
                  placeholder="例: 15"
                  value={filterMaxAge}
                  onChange={e => { setFilterMaxAge(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
                <span className="text-xs text-gray-500">年</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">利回り偏差値≧</span>
                <input
                  type="number"
                  placeholder="例: 60"
                  value={filterMinYield}
                  onChange={e => { setFilterMinYield(e.target.value); setCurrentPage(1); }}
                  className="w-16 px-2 py-1.5 bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-800 rounded-lg text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-zinc-950/20 border-b border-gray-100 dark:border-gray-900">
                  <tr>
                    <th className="px-6 py-4">おすすめ度</th>
                    <th className="px-6 py-4">物件名 / 住所</th>
                    <th className="px-6 py-4">方位・吉凶</th>
                    <th className="px-6 py-4 text-right">総家賃(円)</th>
                    <th className="px-6 py-4 text-right">利回り偏差値</th>
                    <th className="px-6 py-4 text-right">平米 / 築年 / 駅徒歩</th>
                  </tr>
                </thead>
                <tbody>
                  {renderCardSkeletons()}
                </tbody>
              </table>
            ) : sortedTableData.length === 0 ? (
              <div className="flex items-center justify-center p-12 text-gray-500 text-sm">
                該当する物件がありません。
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-zinc-950/20 border-b border-gray-100 dark:border-gray-900">
                  <tr>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('arbitrage', e)}>
                      おすすめ度 {renderSortIndicator('arbitrage')}
                    </th>
                    <th className="px-6 py-4">物件名 / 住所</th>
                    <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('astrology', e)}>
                      方位・吉凶 {renderSortIndicator('astrology')}
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('rent', e)}>
                      総家賃(円) {renderSortIndicator('rent')}
                    </th>
                    <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors" onClick={(e) => handleSortChange('yield', e)}>
                      利回り偏差値 {renderSortIndicator('yield')}
                    </th>
                    <th className="px-6 py-4 text-right">平米 / 築年 / 駅徒歩</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTableData.map((item, i) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold">
                        {renderStars(item.arbitrageScore)}
                      </td>
                      <td className="px-6 py-4">
                        {item.url ? (
                           <a href={item.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                            {item.property_name}
                          </a>
                        ) : (
                          <span className="font-semibold text-gray-800 dark:text-gray-200">{item.property_name}</span>
                        )}
                        <div className="text-xs text-gray-500 mt-1 truncate max-w-xs">{item.address || '住所情報なし'}</div>
                        <div className="mt-2.5">
                          <AstroGridCalendar 
                            dateScores={item.dateScores} 
                            onDateChange={handleDateChange}
                            isTransitioning={isTransitioningDate}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {item.direction ? `${item.direction} (${item.maxAstroFactor})` : '不明'}
                            </span>
                          </div>
                          {isTransitioningDate ? (
                            <div className="flex gap-1.5 mt-2 animate-pulse">
                              <div className="w-12 h-4 bg-zinc-800/40 rounded" />
                              <div className="w-16 h-4 bg-zinc-800/40 rounded" />
                              <div className="w-14 h-4 bg-zinc-800/40 rounded" />
                            </div>
                          ) : (
                            renderFactorBadges(item)
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {item.totalRent.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        <span className={item.yieldScore > 60 ? "text-emerald-500 font-bold" : ""}>
                          {item.yieldScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500 text-xs font-mono">
                        {item.size_sqm}㎡ / 築{item.building_age || 0}年 / {item.minutes_to_station || '不明'}分
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && !loading && (
            <div className="p-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-900 bg-gray-50/50 dark:bg-zinc-950/20">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-xs disabled:opacity-50 transition-all font-semibold"
              >
                前へ
              </button>
              <span className="text-xs text-gray-500">
                {currentPage} / {totalPages} ページ (全 {sortedTableData.length} 件)
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg text-xs disabled:opacity-50 transition-all font-semibold"
              >
                次へ
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
