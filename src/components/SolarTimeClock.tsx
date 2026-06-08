"use client";
import TelemetryChart from "./TelemetryChart";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { calculateBioMetrics } from "../utils/bioModelingEngine";
import { fetchSpaceWeather, SpaceWeatherData } from "../utils/spaceWeather";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";

import { ClockDisplay } from "./ClockDisplay";
import { getHonmeiStar, getClassicalMonthStar, getCurrentEnvironmentalFrequencies, generateBoard, calculateVectorCollision, getPersonalVoidZodiac, getCurrentZodiac, ActionIntent, Direction, StarFrequency, calculateLunarPhaseCondition, getPhysicalMonthStar } from "../utils/ephemerisEngine";
import { createPersonalizedOptimizer, OptimizationResult } from "../utils/timing-optimizer";
import { InlineMath, BlockMath } from 'react-katex';
import { TenChiJinEvaluation } from "./nba/TenChiJinEvaluation";
import 'katex/dist/katex.min.css';
import type { NBAData } from "./nba/NBADashboard";
import { Loader2, Sparkles } from "lucide-react";

const NBADashboard = dynamic(() => import("./nba/NBADashboard").then(mod => mod.NBADashboard), { ssr: false });
const SolarTimeTable = dynamic(() => import("./SolarTimeTable").then(mod => mod.SolarTimeTable), { ssr: false });
const TacticalActionCommand = dynamic(() => import("./TacticalActionCommand").then(mod => mod.TacticalActionCommand), { ssr: false });
const BioMagneticDashboard = dynamic(() => import("./BioMagneticDashboard").then(mod => mod.BioMagneticDashboard), { ssr: false });
const TacticalMagneticMap = dynamic(() => import("./TacticalMagneticMap").then(mod => mod.TacticalMagneticMap), { ssr: false });
const PersonalProfileConfig = dynamic(() => import("./PersonalProfileConfig").then(mod => mod.PersonalProfileConfig), { ssr: false });
const SystemTelemetryLog = dynamic(() => import("./SystemTelemetryLog").then(mod => mod.SystemTelemetryLog), { ssr: false });
const ExpertCouncilPanel = dynamic(() => import("./ExpertCouncilPanel"), { ssr: false });
const TenchusatsuVisualizer = dynamic(() => import("./TenchusatsuVisualizer").then(mod => mod.TenchusatsuVisualizer), { ssr: false });

const LocationPickerInner = dynamic(() => import("./LocationPickerInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-950 border border-zinc-800 flex items-center justify-center font-mono text-xs text-zinc-600">
      [ INITIALIZING MAP INTERFACE... ]
    </div>
  ),
});

const getVectorBreakdown = (
  dir: Direction,
  board: any,
  personalStar: StarFrequency,
  personalVoidZodiac: string[],
  layerType: 'year' | 'month' | 'day' | 'final',
  currentZodiac: { yearZodiac: string; monthZodiac: string; dayZodiac: string; hourZodiac: string; },
  lunarNodeLon: number | null
): { environmental: string; personal: string; } => {
  const getOpposite = (d: Direction): Direction => {
    const opposites: Record<string, Direction> = {
      'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
      'NE': 'SW', 'SW': 'NE', 'NW': 'SE', 'SE': 'NW'
    };
    return opposites[d];
  };

  const clashMap: Record<string, string> = {
    '子': '午', '丑': '未', '寅': '申', '卯': '酉',
    '辰': '戌', '巳': '亥', '午': '子', '未': '丑',
    '申': '寅', '酉': '卯', '戌': '辰', '亥': '巳'
  };

  const z2d: Record<string, Direction[]> = {
    '子': ['N'], '丑': ['NE'], '寅': ['NE'], '卯': ['E'],
    '辰': ['SE'], '巳': ['SE'], '午': ['S'], '未': ['SW'],
    '申': ['SW'], '酉': ['W'], '戌': ['NW'], '亥': ['NW']
  };

  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch(star) {
      case 1: return [6, 7, 3, 4]; 
      case 2: return [9, 6, 7]; 
      case 3: return [1, 9]; 
      case 4: return [1, 9];
      case 5: return [9, 6, 7];
      case 6: return [2, 5, 8, 1]; 
      case 7: return [2, 5, 8, 1];
      case 8: return [9, 6, 7];
      case 9: return [3, 4, 2, 5, 8]; 
      default: return [];
    }
  };

  const envFactors: string[] = [];
  
  if (board) {
    if (board[dir] === 5) {
      envFactors.push("五黄殺");
    }
    const oppositeDir = getOpposite(dir);
    if (board[oppositeDir] === 5) {
      envFactors.push("暗剣殺");
    }
  }

  const checkHa = (zodiac: string) => {
    const clashZodiac = clashMap[zodiac];
    if (clashZodiac) {
      const dirs = z2d[clashZodiac] || [];
      return dirs.includes(dir);
    }
    return false;
  };

  if (layerType === 'year' || layerType === 'final') {
    if (checkHa(currentZodiac.yearZodiac)) envFactors.push("歳破");
  }
  if (layerType === 'month' || layerType === 'final') {
    if (checkHa(currentZodiac.monthZodiac)) envFactors.push("月破");
  }
  if (layerType === 'day' || layerType === 'final') {
    if (checkHa(currentZodiac.dayZodiac)) envFactors.push("日破");
  }

  if (lunarNodeLon !== null) {
    const getBearing = (lon: number) => {
      let b = (lon - 90) % 360; 
      if (b < 0) b += 360;
      b = 360 - b; 
      const val = (b % 360 + 360) % 360;
      if (val >= 345 || val < 15) return 'N';
      if (val >= 15 && val < 75) return 'NE';
      if (val >= 75 && val < 105) return 'E';
      if (val >= 105 && val < 165) return 'SE';
      if (val >= 165 && val < 195) return 'S';
      if (val >= 195 && val < 255) return 'SW';
      if (val >= 255 && val < 285) return 'W';
      return 'NW';
    };
    const nodeDir = getBearing(lunarNodeLon);
    const oppNodeDir = getBearing((lunarNodeLon + 180) % 360);
    if (dir === nodeDir || dir === oppNodeDir) {
      envFactors.push("月交点");
    }
  }

  const environmental = envFactors.length > 0 ? envFactors.join("・") : "通常 (SAFE)";

  const persFactors: string[] = [];
  
  if (board) {
    if (board[dir] === personalStar) {
      persFactors.push("本命殺");
    }
    const oppositeDir = getOpposite(dir);
    if (board[oppositeDir] === personalStar) {
      persFactors.push("的殺");
    }
  }

  const personalVoidDirs = new Set<Direction>();
  personalVoidZodiac.forEach(z => {
    (z2d[z] || []).forEach(d => personalVoidDirs.add(d));
  });
  if (personalVoidDirs.has(dir)) {
    persFactors.push("天中殺");
  }

  if (board && persFactors.length === 0) {
    const compatibles = getCompatibleStars(personalStar);
    if (compatibles.includes(board[dir])) {
      persFactors.push("吉方位");
    }
  }

  const personal = persFactors.length > 0 ? persFactors.join("・") : "通常 (SAFE)";

  return { environmental, personal };
};

const filterLayerData = (
  layer: {
    yearLayer: Partial<Record<Direction, string>>;
    monthLayer: Partial<Record<Direction, string>>;
    dayLayer: Partial<Record<Direction, string>>;
    finalVectors: Record<Direction, string>;
    tendoDirection?: Direction;
    doyouState?: any;
  },
  personalStar: StarFrequency,
  getsuMeiStar: StarFrequency | null,
  voidZodiacArray: string[],
  directionFilterMode: 'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental',
  yBoard: any,
  mBoard: any,
  dBoard: any
) => {
  if (directionFilterMode === 'composite') {
    return layer;
  }

  const directions: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  const getCompatibleStars = (star: StarFrequency): StarFrequency[] => {
    switch(star) {
      case 1: return [6, 7, 3, 4];
      case 2: return [9, 6, 7];
      case 3: return [1, 9];
      case 4: return [1, 9];
      case 5: return [9, 6, 7];
      case 6: return [2, 5, 8, 1];
      case 7: return [2, 5, 8, 1];
      case 8: return [9, 6, 7];
      case 9: return [3, 4, 2, 5, 8];
      default: return [];
    }
  };
  const compatiblesHonmei = getCompatibleStars(personalStar);
  const compatiblesGetsumei = getsuMeiStar ? getCompatibleStars(getsuMeiStar) : [];

  const getOptimalStatus = (starNum: StarFrequency): 'OPTIMAL' | 'OPTIMAL_REGULAR' | 'SAFE' => {
    const isHonmeiComp = compatiblesHonmei.includes(starNum);
    if (!getsuMeiStar) {
      return isHonmeiComp ? 'OPTIMAL' : 'SAFE';
    }
    const isGetsumeiComp = compatiblesGetsumei.includes(starNum);
    if (isHonmeiComp && isGetsumeiComp) {
      return 'OPTIMAL';
    } else if (isHonmeiComp) {
      return 'OPTIMAL_REGULAR';
    }
    return 'SAFE';
  };

  const z2d: Record<string, Direction[]> = {
    '子': ['N'], '丑': ['NE'], '寅': ['NE'], '卯': ['E'],
    '辰': ['SE'], '巳': ['SE'], '午': ['S'], '未': ['SW'],
    '申': ['SW'], '酉': ['W'], '戌': ['NW'], '亥': ['NW']
  };
  const voidDirs = new Set<Direction>();
  voidZodiacArray.forEach(z => {
    (z2d[z] || []).forEach(d => voidDirs.add(d));
  });

  const getOpposite = (d: Direction): Direction => {
    const opposites: Record<string, Direction> = {
      'N': 'S', 'S': 'N', 'E': 'W', 'W': 'E',
      'NE': 'SW', 'SW': 'NE', 'NW': 'SE', 'SE': 'NW'
    };
    return opposites[d];
  };

  const filterStatus = (status: string | undefined, dir: Direction, activeBoard: any) => {
    if (!status) return 'SAFE';
    if (directionFilterMode === 'personal_kigaku') {
      let honmeiD: Direction | null = null;
      directions.forEach(d => {
        if (activeBoard && activeBoard[d] === personalStar) {
          honmeiD = d;
        }
      });
      if (dir === honmeiD) return 'NOISE_HONMEI';
      if (honmeiD && dir === getOpposite(honmeiD)) return 'NOISE_TEKI';
      const optStatus = getOptimalStatus(activeBoard ? activeBoard[dir] : 1);
      return optStatus;
    } else if (directionFilterMode === 'personal_bazi') {
      if (voidDirs.has(dir)) return 'NOISE_VOID';
      return 'SAFE';
    } else {
      let isGou = false;
      let isAnken = false;
      if (activeBoard) {
        directions.forEach(d => {
          if (activeBoard[d] === 5) {
            if (d === dir) isGou = true;
            if (getOpposite(d) === dir) isAnken = true;
          }
        });
      }
      if (isGou) return 'NOISE_GOU';
      if (isAnken) return 'NOISE_ANKEN';
      if (status === 'NOISE_HA') return 'NOISE_HA';
      if (status === 'NOISE_NODE') return 'NOISE_NODE';
      return 'SAFE';
    }
  };

  const newYearLayer: any = {};
  const newMonthLayer: any = {};
  const newDayLayer: any = {};
  const newFinalVectors: any = {};

  directions.forEach(d => {
    newYearLayer[d] = filterStatus(layer.yearLayer[d], d, yBoard);
    newMonthLayer[d] = filterStatus(layer.monthLayer[d], d, mBoard);
    newDayLayer[d] = filterStatus(layer.dayLayer[d], d, dBoard);
    
    if (directionFilterMode === 'personal_kigaku') {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasPurple = list.find(s => s === 'NOISE_HONMEI' || s === 'NOISE_TEKI');
      const hasOpt = list.find(s => s === 'OPTIMAL');
      const hasOptReg = list.find(s => s === 'OPTIMAL_REGULAR');

      if (hasPurple) newFinalVectors[d] = hasPurple;
      else if (hasOpt) newFinalVectors[d] = 'OPTIMAL';
      else if (hasOptReg) newFinalVectors[d] = 'OPTIMAL_REGULAR';
      else newFinalVectors[d] = 'SAFE';
    } else if (directionFilterMode === 'personal_bazi') {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasVoid = list.find(s => s === 'NOISE_VOID');
      if (hasVoid) newFinalVectors[d] = 'NOISE_VOID';
      else newFinalVectors[d] = 'SAFE';
    } else {
      const y = newYearLayer[d];
      const m = newMonthLayer[d];
      const dStatus = newDayLayer[d];
      const list = [y, m, dStatus];
      const hasRed = list.find(s => s === 'NOISE_GOU' || s === 'NOISE_ANKEN' || s === 'NOISE_HA');
      const hasNode = list.find(s => s === 'NOISE_NODE');

      if (hasRed) newFinalVectors[d] = hasRed;
      else if (hasNode) newFinalVectors[d] = hasNode;
      else newFinalVectors[d] = 'SAFE';
    }
  });

  return {
    ...layer,
    yearLayer: newYearLayer,
    monthLayer: newMonthLayer,
    dayLayer: newDayLayer,
    finalVectors: newFinalVectors
  };
};

const filterVectors = (
  vectorData: {
    yearLayer: Partial<Record<Direction, string>>;
    monthLayer: Partial<Record<Direction, string>>;
    dayLayer: Partial<Record<Direction, string>>;
    finalVectors: Record<Direction, string>;
  },
  personalStar: StarFrequency,
  voidZodiacs: string[],
  lunarNodeLon: number | null,
  yB: any,
  mB: any,
  dB: any,
  mode: 'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental',
  getsuMeiStar: StarFrequency | null = null,
  activeLayerMode: 'final' | 'year' | 'month' | 'day' = 'final'
): Record<Direction, string> => {
  const filtered = filterLayerData(
    vectorData,
    personalStar,
    getsuMeiStar,
    voidZodiacs,
    mode,
    yB,
    mB,
    dB
  );

  if (activeLayerMode === 'year') return filtered.yearLayer as Record<Direction, string>;
  if (activeLayerMode === 'month') return filtered.monthLayer as Record<Direction, string>;
  if (activeLayerMode === 'day') return filtered.dayLayer as Record<Direction, string>;
  return filtered.finalVectors as Record<Direction, string>;
};

export const SolarTimeClock = () => {
  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "destination" | "timing" | "consult" | "history" | "scorecard">("profile");

  // NBA State
  const [nbaData, setNbaData] = useState<NBAData | null>(null);

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [activeLayerMode, setActiveLayerMode] = useState<'final' | 'year' | 'month' | 'day'>('final');
  const [showOnlyNewBuild, setShowOnlyNewBuild] = useState(false);
  const [mapProperties, setMapProperties] = useState<any[]>([]);

  // Geo & Environment State (Default: Tokyo)
  const [lat, setLat] = useState<number>(35.6895);
  const [lon, setLon] = useState<number>(139.6917);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData | null>(
    null,
  );
  const [geoData, setGeoData] = useState<GeomagneticData | null>(null);

  // Hardware Init State (Personal Profile)
  const [birthDate, setBirthDate] = useState<string>("2000-01-01T00:00");
  const [birthLat, setBirthLat] = useState<number>(35.6895);
  const [birthLon, setBirthLon] = useState<number>(139.6917);

  // Bio-Sync State
  const [hrv, setHrv] = useState(30);
  const [gsr, setGsr] = useState(1.8);
  const [baseSyncDays, setBaseSyncDays] = useState(30);
  const [pressureDrop, setPressureDrop] = useState(0); // 過去3時間の気圧降下量 (hPa)

  // New Data Science Bio-Baselines
  const [baseSyncTimestamp, setBaseSyncTimestamp] = useState<string | null>(null);
  const [baselineHrvMean, setBaselineHrvMean] = useState<number>(38);
  const [baselineHrvStd, setBaselineHrvStd] = useState<number>(6.5);
  const [baselineGsrMean, setBaselineGsrMean] = useState<number>(4.5);
  const [baselineGsrStd, setBaselineGsrStd] = useState<number>(1.5);

  const [ansLoad, setAnsLoad] = useState(22);
  const [shieldCapacity, setShieldCapacity] = useState(15);
  const [zScoreHRV, setZScoreHRV] = useState(0);
  const [hardwareDisplacementPenalty, setHardwareDisplacementPenalty] = useState(0);
  const [circadianMultiplier, setCircadianMultiplier] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLog, setIsSavingLog] = useState(false);

  // Future Simulation & Intent State
  const [timeOffsetDays, setTimeOffsetDays] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedDays, setPlaySpeedDays] = useState(1);
  const [actionIntent, setActionIntent] = useState<ActionIntent>('DEFAULT');
  const [useClassicalBoard, setUseClassicalBoard] = useState<boolean>(true);
  const [physicalMonthMode, setPhysicalMonthMode] = useState<'coupled' | 'independent'>('independent');
  const [useTrueNorth, setUseTrueNorth] = useState<boolean>(false);
  const [lunarPhaseModifier, setLunarPhaseModifier] = useState<boolean>(true);

  const [heatmapMode, setHeatmapMode] = useState<'none' | '30days' | '12months'>('none');
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [directionFilterMode, setDirectionFilterMode] = useState<'composite' | 'personal_kigaku' | 'personal_bazi' | 'environmental'>('composite');


  const [targetLat, setTargetLat] = useState<number | null>(null);
  const [targetLon, setTargetLon] = useState<number | null>(null);
  const [targetElevation, setTargetElevation] = useState<number | null>(null);
  const [voidZodiacOverride, setVoidZodiacOverride] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [isAutoSearching, setIsAutoSearching] = useState(false);

  // Timing Optimizer Preferences & Results
  const [usePsychologyScorer, setUsePsychologyScorer] = useState(true);
  const [useKigakuScorer, setUseKigakuScorer] = useState(true);
  const [useAstrologyScorer, setUseAstrologyScorer] = useState(true);
  const [timingOptimization, setTimingOptimization] = useState<OptimizationResult | null>(null);

  // HUD Layer Visibility (Idea 3)
  const [hudLayers, setHudLayers] = useState({
    terrain: true,
    weather: true,
    bio: true,
    hazard: true
  });

  const [showAstrophysicalLogic, setShowAstrophysicalLogic] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Scorecard Tab States
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [wealthData, setWealthData] = useState<any[]>([]);
  const [propertiesData, setPropertiesData] = useState<any[]>([]);
  const [selectedDirection, setSelectedDirection] = useState<Direction | null>(null);
  const [showNoiseDirections, setShowNoiseDirections] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [scorecardPrefecture, setScorecardPrefecture] = useState<string>("愛知県");
  const [gridModelView, setGridModelView] = useState<'consensus' | 'classical' | 'physicalIndep' | 'physicalCoupled'>('consensus');
  const [scorecardActiveGridTab, setScorecardActiveGridTab] = useState<'dates' | 'stars'>('dates');


  useEffect(() => {
    if (activeTab === "scorecard") {
      const loadScorecardData = async () => {
        setScorecardLoading(true);
        try {
          const dateStr = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          
          // Fetch Wealth Matrix data
          const wParams = new URLSearchParams();
          wParams.append("limit", "2000");
          wParams.append("baseLat", lat.toString());
          wParams.append("baseLon", lon.toString());
          wParams.append("birthLat", birthLat.toString());
          wParams.append("birthLon", birthLon.toString());
          wParams.append("birthDate", birthDate);
          wParams.append("targetDate", dateStr);
          wParams.append("engineType", useClassicalBoard ? "classical" : "physical");
          wParams.append("nodeMapping", useClassicalBoard ? "traditional" : "physical");
          wParams.append("layerMode", activeLayerMode);
          wParams.append("useTrueNorth", useTrueNorth.toString());
          wParams.append("lunarPhaseModifier", lunarPhaseModifier.toString());
          wParams.append("prefecture", scorecardPrefecture);

          const wRes = await fetch(`/api/municipalities-wealth?${wParams.toString()}`);
          const wJson = await wRes.json();
          if (wJson.success) setWealthData(wJson.data || []);

          // Fetch Rental Arbitrage data
          const aParams = new URLSearchParams();
          aParams.append("limit", "1000");
          aParams.append("baseLat", lat.toString());
          aParams.append("baseLon", lon.toString());
          aParams.append("birthLat", birthLat.toString());
          aParams.append("birthLon", birthLon.toString());
          aParams.append("birthDate", birthDate);
          aParams.append("targetDate", dateStr);
          aParams.append("radiusKm", "all");
          aParams.append("prefecture", scorecardPrefecture);
          aParams.append("useClassical", useClassicalBoard.toString());
          aParams.append("nodeMapping", useClassicalBoard ? "traditional" : "physical");
          aParams.append("layerMode", activeLayerMode);
          aParams.append("useTrueNorth", useTrueNorth.toString());
          aParams.append("lunarPhaseModifier", lunarPhaseModifier.toString());

          const aRes = await fetch(`/api/rentals/arbitrage?${aParams.toString()}`);
          const aJson = await aRes.json();
          setPropertiesData(aJson.properties || []);
        } catch (e) {
          console.error("Failed to load scorecard data:", e);
        } finally {
          setScorecardLoading(false);
        }
      };
      loadScorecardData();
    }
  }, [activeTab, lat, lon, birthLat, birthLon, birthDate, baseTime, timeOffsetDays, useClassicalBoard, activeLayerMode, useTrueNorth, lunarPhaseModifier, scorecardPrefecture]);

  const fetchNBAData = async () => {
    try {
      const targetDateStr = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000).toISOString() : new Date().toISOString();
      const payload = {
        ansLoad,
        shieldCapacity,
        hrv,
        gsr,
        birthDate,
        lon,
        targetDate: targetDateStr,
        useClassical: useClassicalBoard
      };
      const res = await fetch("/api/nba", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch NBA data: ${res.status} ${res.statusText} - ${errorText}`);
      }
      const json = await res.json();
      if (json.success) {
        setNbaData(json.data);
      } else {
        console.warn("[fetchNBAData] Server returned success: false", json.error);
      }
    } catch (err: any) {
      console.error("[fetchNBAData] POST Request Error:", err.message || err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNBAData();
    }, 1000); // 1s debounce
    return () => clearTimeout(timer);
  }, [ansLoad, shieldCapacity, birthDate, lon, timeOffsetDays, baseTime, useClassicalBoard]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimeOffsetDays((prev) => prev + playSpeedDays);
      }, 500); // 0.5s per tick
    }
    return () => clearInterval(interval);
  }, [isPlaying, playSpeedDays]);

  const loadFromLocal = async () => {
    let isLoaded = false
    try {
      const res = await fetch('/api/user-config');
      if (res.ok) {
        const data = await res.json();
        if (Object.keys(data).length > 0) {
          if (data.birth_date) setBirthDate(data.birth_date);
          if (data.birth_lat !== undefined) setBirthLat(data.birth_lat);
          if (data.birth_lon !== undefined) setBirthLon(data.birth_lon);
          if (data.base_lat !== undefined) setLat(data.base_lat);
          if (data.base_lon !== undefined) setLon(data.base_lon);
          if (data.void_zodiac_override !== undefined) setVoidZodiacOverride(data.void_zodiac_override);
          if (data.gemini_key_exists) setGeminiKey("********");
          if (data.baseline_hrv_mean !== undefined) setBaselineHrvMean(data.baseline_hrv_mean);
          if (data.baseline_hrv_std !== undefined) setBaselineHrvStd(data.baseline_hrv_std);
          if (data.baseline_gsr_mean !== undefined) setBaselineGsrMean(data.baseline_gsr_mean);
          if (data.baseline_gsr_std !== undefined) setBaselineGsrStd(data.baseline_gsr_std);
          if (data.base_sync_timestamp !== undefined) setBaseSyncTimestamp(data.base_sync_timestamp);
          if (data.use_psychology_scorer !== undefined) setUsePsychologyScorer(data.use_psychology_scorer);
          if (data.use_kigaku_scorer !== undefined) setUseKigakuScorer(data.use_kigaku_scorer);
          if (data.use_astrology_scorer !== undefined) setUseAstrologyScorer(data.use_astrology_scorer);
          if (data.hrv !== undefined) setHrv(data.hrv);
          if (data.gsr !== undefined) setGsr(data.gsr);
          if (data.ansLoad !== undefined) setAnsLoad(data.ansLoad);
          if (data.shieldCapacity !== undefined) setShieldCapacity(data.shieldCapacity);
          // Load unified configurations
          if (data.use_classical_board !== undefined) setUseClassicalBoard(data.use_classical_board);
          if (data.physical_month_mode !== undefined) setPhysicalMonthMode(data.physical_month_mode);
          if (data.use_true_north !== undefined) setUseTrueNorth(data.use_true_north);
          if (data.lunar_phase_modifier !== undefined) setLunarPhaseModifier(data.lunar_phase_modifier);
          if (data.layer_mode !== undefined) setActiveLayerMode(data.layer_mode);
          if (data.direction_filter_mode !== undefined) setDirectionFilterMode(data.direction_filter_mode);
          isLoaded = true;
        }
      }
    } catch (e) {
      console.error("API config load error", e);
    }

    const localData = localStorage.getItem('tactical_config_v1');
    if (localData) {
      try {
        const data = JSON.parse(localData);
        if (data.birth_date) setBirthDate(data.birth_date);
        if (data.birth_lat !== undefined) setBirthLat(data.birth_lat);
        if (data.birth_lon !== undefined) setBirthLon(data.birth_lon);
        if (data.base_lat !== undefined) setLat(data.base_lat);
        if (data.base_lon !== undefined) setLon(data.base_lon);
        if (data.void_zodiac_override !== undefined) setVoidZodiacOverride(data.void_zodiac_override);
        if (data.gemini_key_exists) setGeminiKey("********");
        if (data.baseline_hrv_mean !== undefined) setBaselineHrvMean(data.baseline_hrv_mean);
        if (data.baseline_hrv_std !== undefined) setBaselineHrvStd(data.baseline_hrv_std);
        if (data.baseline_gsr_mean !== undefined) setBaselineGsrMean(data.baseline_gsr_mean);
        if (data.baseline_gsr_std !== undefined) setBaselineGsrStd(data.baseline_gsr_std);
        if (data.base_sync_timestamp !== undefined) setBaseSyncTimestamp(data.base_sync_timestamp);
        if (data.use_psychology_scorer !== undefined) setUsePsychologyScorer(data.use_psychology_scorer);
        if (data.use_kigaku_scorer !== undefined) setUseKigakuScorer(data.use_kigaku_scorer);
        if (data.use_astrology_scorer !== undefined) setUseAstrologyScorer(data.use_astrology_scorer);
        if (data.hrv !== undefined) setHrv(data.hrv);
        if (data.gsr !== undefined) setGsr(data.gsr);
        if (data.ansLoad !== undefined) setAnsLoad(data.ansLoad);
        if (data.shieldCapacity !== undefined) setShieldCapacity(data.shieldCapacity);
        // Load unified configurations
        if (data.use_classical_board !== undefined) setUseClassicalBoard(data.use_classical_board);
        if (data.physical_month_mode !== undefined) setPhysicalMonthMode(data.physical_month_mode);
        if (data.use_true_north !== undefined) setUseTrueNorth(data.use_true_north);
        if (data.lunar_phase_modifier !== undefined) setLunarPhaseModifier(data.lunar_phase_modifier);
        if (data.layer_mode !== undefined) setActiveLayerMode(data.layer_mode);
        if (data.direction_filter_mode !== undefined) setDirectionFilterMode(data.direction_filter_mode);
        isLoaded = true;
      } catch (e) {
        console.error("LocalStorage parse error", e);
      }
    }

    // Sync from Relocation Matrix Dashboard if available
    if (typeof window !== 'undefined') {
      const wBirthDate = localStorage.getItem('wealth_birthDate');
      const wBirthLat = localStorage.getItem('wealth_birthLat');
      const wBirthLon = localStorage.getItem('wealth_birthLon');
      const wBaseLat = localStorage.getItem('wealth_baseLat');
      const wBaseLon = localStorage.getItem('wealth_baseLon');

      if (wBirthDate) { setBirthDate(wBirthDate); isLoaded = true; }
      if (wBirthLat) { setBirthLat(Number(wBirthLat)); isLoaded = true; }
      if (wBirthLon) { setBirthLon(Number(wBirthLon)); isLoaded = true; }
      if (wBaseLat) { setLat(Number(wBaseLat)); isLoaded = true; }
      if (wBaseLon) { setLon(Number(wBaseLon)); isLoaded = true; }
    }

    setConfigLoaded(true);
    return isLoaded;
  };

  const handleLoadConfig = async (silent = true) => {
    const localFound = await loadFromLocal();
    if (!localFound && !silent) alert("保存された設定が見つかりませんでした。");
    return localFound;
  };

  useEffect(() => {
    handleLoadConfig(true);
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    
    const autoSave = async () => {
      try {
        const partialConfig = {
          use_classical_board: useClassicalBoard,
          physical_month_mode: physicalMonthMode,
          use_true_north: useTrueNorth,
          lunar_phase_modifier: lunarPhaseModifier,
          layer_mode: activeLayerMode,
          direction_filter_mode: directionFilterMode,
          base_lat: lat,
          base_lon: lon,
          birth_date: birthDate,
          birth_lat: birthLat,
          birth_lon: birthLon
        };
        
        // Save to localStorage
        const localData = localStorage.getItem('tactical_config_v1');
        let currentLocal = {};
        if (localData) {
          try { currentLocal = JSON.parse(localData); } catch(e){}
        }
        localStorage.setItem('tactical_config_v1', JSON.stringify({ ...currentLocal, ...partialConfig }));
        
        // POST to API
        await fetch('/api/user-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partialConfig)
        });
      } catch (e) {
        console.error("Auto-save configuration failed:", e);
      }
    };
    
    autoSave();
  }, [useClassicalBoard, physicalMonthMode, useTrueNorth, lunarPhaseModifier, activeLayerMode, directionFilterMode, lat, lon, birthDate, birthLat, birthLon, configLoaded]);

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLon(position.coords.longitude);

          const nowIso = new Date().toISOString();
          setBaseSyncTimestamp(nowIso);
          setBaseSyncDays(0);

          alert("現在のGPS座標をBase座標としてセットし、環境順化（シールド）のタイムスタンプをリセットしました。");
        },
        (error) => {
          console.error("GPS Error:", error);
          alert("GPS情報の取得に失敗しました。ブラウザの設定と権限をご確認ください。");
        }
      );
    } else {
      alert("ご使用のプラットフォームはGPSをサポートしていません。");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const configToSave = {
        birth_date: birthDate,
        birth_lat: birthLat,
        birth_lon: birthLon,
        base_lat: lat,
        base_lon: lon,
        void_zodiac_override: voidZodiacOverride,
        gemini_key_exists: geminiKey && geminiKey !== "",
        baseline_hrv_mean: baselineHrvMean,
        baseline_hrv_std: baselineHrvStd,
        baseline_gsr_mean: baselineGsrMean,
        baseline_gsr_std: baselineGsrStd,
        base_sync_timestamp: baseSyncTimestamp,
        use_psychology_scorer: usePsychologyScorer,
        use_kigaku_scorer: useKigakuScorer,
        use_astrology_scorer: useAstrologyScorer,
        hrv,
        gsr,
        ansLoad,
        shieldCapacity,
        // Persist unified configurations
        use_classical_board: useClassicalBoard,
        physical_month_mode: physicalMonthMode,
        use_true_north: useTrueNorth,
        lunar_phase_modifier: lunarPhaseModifier,
        layer_mode: activeLayerMode,
        direction_filter_mode: directionFilterMode
      };

      await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSave)
      });

      localStorage.setItem('tactical_config_v1', JSON.stringify(configToSave));

      // Sync back to Relocation Matrix Dashboard
      if (typeof window !== 'undefined') {
        localStorage.setItem('wealth_birthDate', birthDate);
        localStorage.setItem('wealth_birthLat', birthLat.toString());
        localStorage.setItem('wealth_birthLon', birthLon.toString());
        localStorage.setItem('wealth_baseLat', lat.toString());
        localStorage.setItem('wealth_baseLon', lon.toString());
      }

      alert("PC内のファイル (local_tactical_config.json) とブラウザに永久保存しました。");
      if (geminiKey && geminiKey !== "") {
        setGeminiKey("********");
      }
    } catch (err: any) {
      console.error("Save Error:", err);
      alert(`保存に失敗しました: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getTargetDirectionInfo = () => {
    if (targetLat !== null && targetLon !== null && lat && lon) {
      const toRad = (val: number) => val * Math.PI / 180;
      const toDeg = (val: number) => val * 180 / Math.PI;
      const dLon = toRad(targetLon - lon);
      const y = Math.sin(dLon) * Math.cos(toRad(targetLat));
      const x = Math.cos(toRad(lat)) * Math.sin(toRad(targetLat)) - Math.sin(toRad(lat)) * Math.cos(toRad(targetLat)) * Math.cos(dLon);
      let trueBrng = toDeg(Math.atan2(y, x));
      trueBrng = (trueBrng + 360) % 360;

      const declination = geoData?.declination ?? -8.2;
      const magBrng = (trueBrng - declination + 360) % 360;

      const getDir = (bearing: number): Direction => {
        const b = (bearing % 360 + 360) % 360;
        if (useClassicalBoard) {
          if (b >= 345 || b < 15) return 'N';
          if (b >= 15 && b < 75) return 'NE';
          if (b >= 75 && b < 105) return 'E';
          if (b >= 105 && b < 165) return 'SE';
          if (b >= 165 && b < 195) return 'S';
          if (b >= 195 && b < 255) return 'SW';
          if (b >= 255 && b < 285) return 'W';
          return 'NW';
        } else {
          const index = Math.floor(((b + 22.5) % 360) / 45);
          const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
          return dirs[index];
        }
      };

      return {
        trueDirection: getDir(trueBrng),
        magneticDirection: getDir(magBrng)
      };
    }
    return null;
  };

  const handleAutoSearch = () => {
    if (!baseTime || !honmeiStar) return;
    setIsAutoSearching(true);

    const targetDirInfo = getTargetDirectionInfo();

    setTimeout(() => {
      let offset = timeOffsetDays + 1;
      let foundOffset: number | null = null;
      const MAX_SEARCH_DAYS = 365;

      for (let i = 0; i < MAX_SEARCH_DAYS; i++) {
        const testDate = new Date(baseTime.getTime() + offset * 86400000);

        const cz = getCurrentZodiac(testDate, lon || 139.6917);
        if (personalVoidZodiac.includes(cz.yearZodiac) || personalVoidZodiac.includes(cz.monthZodiac) || personalVoidZodiac.includes(cz.dayZodiac)) {
          offset++;
          continue;
        }

        const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);
        const dB = generateBoard(useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, dB,
          personalVoidZodiac,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? 'traditional' : 'physical'
        );

        if (targetDirInfo) {
          const s = vectorData.finalVectors[(useTrueNorth ? targetDirInfo.trueDirection : targetDirInfo.magneticDirection) as Direction];
          if (s === 'SAFE' || s === 'OPTIMAL') {
            foundOffset = offset;
            break;
          }
        } else {
          const hasOptimal = Object.values(vectorData.finalVectors).includes('OPTIMAL');
          if (hasOptimal) {
            foundOffset = offset;
            break;
          }
        }
        offset++;
      }

      setIsAutoSearching(false);

      if (foundOffset !== null) {
        setTimeOffsetDays(foundOffset);
      } else {
        alert("365日以内に完全に安全な移動タイミングが見つかりませんでした。目的（Action Intent）を変更して再検索するか、目的地を変えてください。");
      }
    }, 50);
  };

  const birthSolarData = React.useMemo(() => {
    if (!birthDate || !birthLon) return null;
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return null;
    return calculateSolarTime(d, birthLon);
  }, [birthDate, birthLon]);

  const env = React.useMemo(() => {
    if (!solarData?.solarTime || isNaN(solarData.solarTime.getTime())) {
      if (!ephemerisTime || isNaN(ephemerisTime.getTime())) return null;
      return getCurrentEnvironmentalFrequencies(ephemerisTime, lon || 139.6917, physicalMonthMode);
    }
    return getCurrentEnvironmentalFrequencies(solarData.solarTime, lon || 139.6917, physicalMonthMode);
  }, [ephemerisTime, solarData, lon, physicalMonthMode]);

  const birthEnv = React.useMemo(() => {
    if (!birthSolarData || isNaN(birthSolarData.solarTime.getTime())) return null;
    return getCurrentEnvironmentalFrequencies(birthSolarData.solarTime, birthLon || 139.6917);
  }, [birthSolarData, birthLon]);

  const honmeiStar = React.useMemo(() => {
    if (birthSolarData?.solarTime && !isNaN(birthSolarData.solarTime.getTime())) {
      return getHonmeiStar(birthSolarData.solarTime);
    }
    if (birthDate) {
      const d = new Date(birthDate);
      if (!isNaN(d.getTime())) {
        return getHonmeiStar(d);
      }
    }
    return null;
  }, [birthDate, birthSolarData]);

  const getsuMeiStar = React.useMemo(() => {
    if (birthSolarData?.solarTime && !isNaN(birthSolarData.solarTime.getTime())) {
      return getClassicalMonthStar(new Date(birthSolarData.solarTime));
    }
    if (birthDate) {
      const d = new Date(birthDate);
      if (!isNaN(d.getTime())) {
        return getClassicalMonthStar(d);
      }
    }
    return null;
  }, [birthDate, birthSolarData]);

  const {
    board,
    layers: rawLayers,
    physicalLayers: rawPhysicalLayers,
    classicalLayers: rawClassicalLayers,
    physicalIndepLayers: rawPhysicalIndepLayers,
    physicalCoupledLayers: rawPhysicalCoupledLayers,
    physicalYearBoard,
    physicalMonthBoard,
    physicalDayBoard,
    physicalMonthIndepBoard,
    physicalMonthCoupledBoard,
    classicalYearBoard,
    classicalMonthBoard,
    classicalDayBoard
  } = React.useMemo(() => {
    if (!env || !honmeiStar) return { board: null, layers: null, physicalLayers: null, classicalLayers: null, physicalIndepLayers: null, physicalCoupledLayers: null, physicalYearBoard: null, physicalMonthBoard: null, physicalDayBoard: null, physicalMonthIndepBoard: null, physicalMonthCoupledBoard: null, classicalYearBoard: null, classicalMonthBoard: null, classicalDayBoard: null };

    const bDate = new Date(birthDate);
    if (isNaN(bDate.getTime())) return { board: null, layers: null, physicalLayers: null, classicalLayers: null, physicalIndepLayers: null, physicalCoupledLayers: null, physicalYearBoard: null, physicalMonthBoard: null, physicalDayBoard: null, physicalMonthIndepBoard: null, physicalMonthCoupledBoard: null, classicalYearBoard: null, classicalMonthBoard: null, classicalDayBoard: null };

    // Boards for internal calculation based on user preference toggle
    const yB = generateBoard(useClassicalBoard ? env.classicalYearStar : env.yearStar);
    const mB = generateBoard(useClassicalBoard ? env.classicalMonthStar : env.monthStar);
    const dB = generateBoard(useClassicalBoard ? env.classicalDayStar : env.dayStar);

    // Strict Physical boards for UI display
    const pyB = generateBoard(env.yearStar);
    const pmB = generateBoard(env.monthStar);
    const pdB = generateBoard(env.dayStar);

    // Strict Classical boards for UI display
    const cyB = generateBoard(env.classicalYearStar);
    const cmB = generateBoard(env.classicalMonthStar);
    const cdB = generateBoard(env.classicalDayStar);

    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(bDate);
    const tDate = solarData?.solarTime || ephemerisTime || new Date();

    // Strict Physical boards for Independent and Coupled modes
    const pmStar_indep = getPhysicalMonthStar(tDate, 'independent');
    const pmStar_coupled = getPhysicalMonthStar(tDate, 'coupled');

    const pmB_indep = generateBoard(pmStar_indep);
    const pmB_coupled = generateBoard(pmStar_coupled);

    const vectorData = calculateVectorCollision(
      useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
      yB, mB, dB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
      useClassicalBoard ? 'traditional' : 'physical'
    );

    const physicalVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB, pmB, pdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      'physical'
    );

    const classicalVectorData = calculateVectorCollision(
      honmeiStar.classical,
      cyB, cmB, cdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      getsuMeiStar || undefined,
      'traditional'
    );

    const physicalIndepVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB, pmB_indep, pdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      'physical'
    );

    const physicalCoupledVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB, pmB_coupled, pdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent,
      tDate,
      lon || 139.6917,
      undefined,
      'physical'
    );

    return {
      board: dB,
      layers: vectorData,
      physicalLayers: physicalVectorData,
      classicalLayers: classicalVectorData,
      physicalIndepLayers: physicalIndepVectorData,
      physicalCoupledLayers: physicalCoupledVectorData,
      physicalYearBoard: pyB,
      physicalMonthBoard: pmB,
      physicalDayBoard: pdB,
      physicalMonthIndepBoard: pmB_indep,
      physicalMonthCoupledBoard: pmB_coupled,
      classicalYearBoard: cyB,
      classicalMonthBoard: cmB,
      classicalDayBoard: cdB
    };
  }, [honmeiStar, getsuMeiStar, env, birthDate, actionIntent, voidZodiacOverride, useClassicalBoard, solarData, ephemerisTime]);

  const filteredLayers = React.useMemo(() => {
    if (!rawLayers || !rawPhysicalLayers || !rawClassicalLayers || !rawPhysicalIndepLayers || !rawPhysicalCoupledLayers || !honmeiStar) {
      return { layers: null, physicalLayers: null, classicalLayers: null, physicalIndepLayers: null, physicalCoupledLayers: null };
    }

    const bDate = new Date(birthDate);
    if (isNaN(bDate.getTime())) return { layers: null, physicalLayers: null, classicalLayers: null, physicalIndepLayers: null, physicalCoupledLayers: null };

    const personalStar = useClassicalBoard ? honmeiStar.classical : honmeiStar.physical;
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(bDate);

    return {
      layers: filterLayerData(
        rawLayers,
        personalStar,
        useClassicalBoard ? getsuMeiStar : null,
        voidZodiacArray,
        directionFilterMode,
        useClassicalBoard ? classicalYearBoard : physicalYearBoard,
        useClassicalBoard ? classicalMonthBoard : physicalMonthBoard,
        useClassicalBoard ? classicalDayBoard : physicalDayBoard
      ),
      physicalLayers: filterLayerData(
        rawPhysicalLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthBoard,
        physicalDayBoard
      ),
      classicalLayers: filterLayerData(
        rawClassicalLayers,
        honmeiStar.classical,
        getsuMeiStar,
        voidZodiacArray,
        directionFilterMode,
        classicalYearBoard,
        classicalMonthBoard,
        classicalDayBoard
      ),
      physicalIndepLayers: filterLayerData(
        rawPhysicalIndepLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthIndepBoard,
        physicalDayBoard
      ),
      physicalCoupledLayers: filterLayerData(
        rawPhysicalCoupledLayers,
        honmeiStar.physical,
        null,
        voidZodiacArray,
        directionFilterMode,
        physicalYearBoard,
        physicalMonthCoupledBoard,
        physicalDayBoard
      )
    };
  }, [
    rawLayers,
    rawPhysicalLayers,
    rawClassicalLayers,
    rawPhysicalIndepLayers,
    rawPhysicalCoupledLayers,
    directionFilterMode,
    useClassicalBoard,
    honmeiStar,
    getsuMeiStar,
    voidZodiacOverride,
    birthDate,
    physicalYearBoard,
    physicalMonthBoard,
    physicalDayBoard,
    physicalMonthIndepBoard,
    physicalMonthCoupledBoard,
    classicalYearBoard,
    classicalMonthBoard,
    classicalDayBoard
  ]);

  const layers = filteredLayers.layers;
  const physicalLayers = filteredLayers.physicalLayers;
  const classicalLayers = filteredLayers.classicalLayers;
  const physicalIndepLayers = filteredLayers.physicalIndepLayers;
  const physicalCoupledLayers = filteredLayers.physicalCoupledLayers;

  const activeVectors = React.useMemo(() => {
    let av: any = layers?.finalVectors || {};
    if (activeLayerMode === 'year') av = layers?.yearLayer || {};
    else if (activeLayerMode === 'month') av = layers?.monthLayer || {};
    else if (activeLayerMode === 'day') av = layers?.dayLayer || {};
    return av;
  }, [layers, activeLayerMode]);

  const getStatusScore = (status: string) => {
    if (!status) return 50;
    if (status === 'OPTIMAL') return 100;
    if (status === 'OPTIMAL_REGULAR') return 90;
    if (status === 'SAFE') return 80;
    if (status === 'WARNING') return 60;
    if (status.startsWith('NOISE_VOID') || status.startsWith('NOISE_NODE')) return 40;
    if (status.startsWith('NOISE_HONMEI') || status.startsWith('NOISE_TEKI') || status.startsWith('NOISE_GETSUMEI') || status.startsWith('NOISE_GETSUTEKI')) return 20;
    if (status.startsWith('NOISE_GOU') || status.startsWith('NOISE_ANKEN') || status.startsWith('NOISE_HA')) return 10;
    return 50;
  };

  const scorecard30DaysForecast = React.useMemo(() => {
    if (!baseTime || !honmeiStar) return null;
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));
    
    const result: Record<Direction, { luckyDays: number; dates: { dateStr: string; status: string; score: number }[] }> = {
      N: { luckyDays: 0, dates: [] },
      NE: { luckyDays: 0, dates: [] },
      E: { luckyDays: 0, dates: [] },
      SE: { luckyDays: 0, dates: [] },
      S: { luckyDays: 0, dates: [] },
      SW: { luckyDays: 0, dates: [] },
      W: { luckyDays: 0, dates: [] },
      NW: { luckyDays: 0, dates: [] },
      CENTER: { luckyDays: 0, dates: [] },
    };

    for (let i = 0; i < 30; i++) {
      const testDateLocal = new Date(baseTime.getTime() + i * 86400000);
      const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
      const testDate = testDateSolar.solarTime;
      const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
      const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
      const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);
      const dB = generateBoard(useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar);

      const vectorData = calculateVectorCollision(
        useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
        yB, mB, dB,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        'MIGRATION',
        testDate,
        lon || 139.6917,
        useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
        useClassicalBoard ? 'traditional' : 'physical'
      );

      const filteredV = filterVectors(
        vectorData,
        useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
        voidZodiacArray,
        testEnv.raw.lunarNode,
        yB, mB, dB,
        directionFilterMode,
        useClassicalBoard ? getsuMeiStar : null,
        activeLayerMode
      );

      dirs.forEach(dir => {
        const status = filteredV[dir] || 'SAFE';
        const isLucky = status === 'SAFE' || status === 'OPTIMAL' || status === 'OPTIMAL_REGULAR';
        const score = getStatusScore(status);
        
        if (isLucky) {
          result[dir].luckyDays += 1;
        }
        result[dir].dates.push({
          dateStr: testDateLocal.toISOString().split('T')[0],
          status,
          score
        });
      });
    }
    return result;
  }, [baseTime, honmeiStar, voidZodiacOverride, birthDate, lon, useClassicalBoard, getsuMeiStar, directionFilterMode, activeLayerMode, physicalMonthMode]);

  const scorecard30DaysForecastAllModels = React.useMemo(() => {
    if (!baseTime || !honmeiStar) return null;
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));
    
    const result: {
      dateStr: string;
      weekday: number;
      models: Record<'classical' | 'physicalIndep' | 'physicalCoupled', Record<Direction, { status: string; score: number }>>;
    }[] = [];

    for (let i = 0; i < 30; i++) {
      const testDateLocal = new Date(baseTime.getTime() + i * 86400000);
      const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
      const testDate = testDateSolar.solarTime;
      const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
      
      // 1. Classical Model
      const yB_class = generateBoard(testEnv.classicalYearStar);
      const mB_class = generateBoard(testEnv.classicalMonthStar);
      const dB_class = generateBoard(testEnv.classicalDayStar);
      const vec_class = calculateVectorCollision(
        honmeiStar.classical, yB_class, mB_class, dB_class,
        voidZodiacArray, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        getsuMeiStar || undefined, 'traditional'
      );
      const filtered_class = filterVectors(
        vec_class, honmeiStar.classical, voidZodiacArray, testEnv.raw.lunarNode,
        yB_class, mB_class, dB_class, directionFilterMode, getsuMeiStar, activeLayerMode
      );

      // 2. Physical Independent Model
      const yB_indep = generateBoard(testEnv.yearStar);
      const mB_indep = generateBoard(testEnv.monthStar);
      const dB_indep = generateBoard(testEnv.dayStar);
      const vec_indep = calculateVectorCollision(
        honmeiStar.physical, yB_indep, mB_indep, dB_indep,
        voidZodiacArray, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        undefined, 'physical'
      );
      const filtered_indep = filterVectors(
        vec_indep, honmeiStar.physical, voidZodiacArray, testEnv.raw.lunarNode,
        yB_indep, mB_indep, dB_indep, directionFilterMode, null, activeLayerMode
      );

      // 3. Physical Coupled Model
      const pMonthStarCoupled = getPhysicalMonthStar(testDate, 'coupled');
      const yB_coupled = generateBoard(testEnv.yearStar);
      const mB_coupled = generateBoard(pMonthStarCoupled);
      const dB_coupled = generateBoard(testEnv.dayStar);
      const vec_coupled = calculateVectorCollision(
        honmeiStar.physical, yB_coupled, mB_coupled, dB_coupled,
        voidZodiacArray, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        undefined, 'physical'
      );
      const filtered_coupled = filterVectors(
        vec_coupled, honmeiStar.physical, voidZodiacArray, testEnv.raw.lunarNode,
        yB_coupled, mB_coupled, dB_coupled, directionFilterMode, null, activeLayerMode
      );

      const dayModelData: any = {
        dateStr: testDateLocal.toISOString().split('T')[0],
        weekday: testDateLocal.getDay(),
        models: {
          classical: {},
          physicalIndep: {},
          physicalCoupled: {}
        }
      };

      dirs.forEach(dir => {
        const status_class = filtered_class[dir] || 'SAFE';
        const score_class = getStatusScore(status_class);
        dayModelData.models.classical[dir] = { status: status_class, score: score_class };

        const status_indep = filtered_indep[dir] || 'SAFE';
        const score_indep = getStatusScore(status_indep);
        dayModelData.models.physicalIndep[dir] = { status: status_indep, score: score_indep };

        const status_coupled = filtered_coupled[dir] || 'SAFE';
        const score_coupled = getStatusScore(status_coupled);
        dayModelData.models.physicalCoupled[dir] = { status: status_coupled, score: score_coupled };
      });

      result.push(dayModelData);
    }

    return result;
  }, [baseTime, honmeiStar, voidZodiacOverride, birthDate, lon, getsuMeiStar, directionFilterMode, activeLayerMode, physicalMonthMode]);

  const scorecardHonmeiStarsForecast = React.useMemo(() => {
    if (!baseTime) return null;
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const targetDateLocal = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
    const testDateSolar = calculateSolarTime(targetDateLocal, lon || 139.6917);
    const testDate = testDateSolar.solarTime;
    const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
    
    const honmeiStarIds: StarFrequency[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const dummyVoidZodiac: string[] = [];

    const result: {
      star: StarFrequency;
      label: string;
      models: Record<'classical' | 'physicalIndep' | 'physicalCoupled', Record<Direction, { status: string; score: number }>>;
    }[] = [];

    honmeiStarIds.forEach(star => {
      // 1. Classical Model
      const yB_class = generateBoard(testEnv.classicalYearStar);
      const mB_class = generateBoard(testEnv.classicalMonthStar);
      const dB_class = generateBoard(testEnv.classicalDayStar);
      const vec_class = calculateVectorCollision(
        star, yB_class, mB_class, dB_class,
        dummyVoidZodiac, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        undefined, 'traditional'
      );
      const filtered_class = filterVectors(
        vec_class, star, dummyVoidZodiac, testEnv.raw.lunarNode,
        yB_class, mB_class, dB_class, directionFilterMode, null, activeLayerMode
      );

      // 2. Physical Independent Model
      const yB_indep = generateBoard(testEnv.yearStar);
      const mB_indep = generateBoard(testEnv.monthStar);
      const dB_indep = generateBoard(testEnv.dayStar);
      const vec_indep = calculateVectorCollision(
        star, yB_indep, mB_indep, dB_indep,
        dummyVoidZodiac, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        undefined, 'physical'
      );
      const filtered_indep = filterVectors(
        vec_indep, star, dummyVoidZodiac, testEnv.raw.lunarNode,
        yB_indep, mB_indep, dB_indep, directionFilterMode, null, activeLayerMode
      );

      // 3. Physical Coupled Model
      const pMonthStarCoupled = getPhysicalMonthStar(testDate, 'coupled');
      const yB_coupled = generateBoard(testEnv.yearStar);
      const mB_coupled = generateBoard(pMonthStarCoupled);
      const dB_coupled = generateBoard(testEnv.dayStar);
      const vec_coupled = calculateVectorCollision(
        star, yB_coupled, mB_coupled, dB_coupled,
        dummyVoidZodiac, testEnv.raw.lunarNode, 'MIGRATION', testDate, lon || 139.6917,
        undefined, 'physical'
      );
      const filtered_coupled = filterVectors(
        vec_coupled, star, dummyVoidZodiac, testEnv.raw.lunarNode,
        yB_coupled, mB_coupled, dB_coupled, directionFilterMode, null, activeLayerMode
      );

      const starData: any = {
        star,
        label: `${star} (${['一白水星', '二黒土星', '三碧木星', '四緑木星', '五黄土星', '六白金星', '七赤金星', '八白土星', '九紫火星'][star - 1]})`,
        models: {
          classical: {},
          physicalIndep: {},
          physicalCoupled: {}
        }
      };

      dirs.forEach(dir => {
        const status_class = filtered_class[dir] || 'SAFE';
        const score_class = getStatusScore(status_class);
        starData.models.classical[dir] = { status: status_class, score: score_class };

        const status_indep = filtered_indep[dir] || 'SAFE';
        const score_indep = getStatusScore(status_indep);
        starData.models.physicalIndep[dir] = { status: status_indep, score: score_indep };

        const status_coupled = filtered_coupled[dir] || 'SAFE';
        const score_coupled = getStatusScore(status_coupled);
        starData.models.physicalCoupled[dir] = { status: status_coupled, score: score_coupled };
      });

      result.push(starData);
    });

    return result;
  }, [baseTime, timeOffsetDays, lon, directionFilterMode, activeLayerMode, physicalMonthMode]);

  const scorecardSummary = React.useMemo(() => {
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirMapJa: Record<Direction, string> = {
      N: '北', NE: '北東', E: '東', SE: '南東',
      S: '南', SW: '南西', W: '西', NW: '北西',
      CENTER: '中央'
    };

    return dirs.map(dir => {
      const status = activeVectors[dir] || 'SAFE';
      const score = getStatusScore(status);
      const isNoise = status.startsWith('NOISE');
      const forecast = scorecard30DaysForecast?.[dir] || { luckyDays: 0, dates: [] };

      const areasForDir = wealthData.filter(item => {
        const itemDir = useTrueNorth ? item.direction : item.magneticDirection;
        return itemDir === dir;
      });
      const topAreas = [...areasForDir].sort((a, b) => (b.incomePerCapita || 0) - (a.incomePerCapita || 0));
      const topArea = topAreas[0] || null;

      const rentalsForDir = propertiesData.filter(item => {
        const itemDir = useTrueNorth ? item.direction : item.magneticDirection;
        return itemDir === dir;
      });
      const topRentals = [...rentalsForDir].sort((a, b) => (b.arbitrageScore || 0) - (a.arbitrageScore || 0));
      const topRental = topRentals[0] || null;

      // Comparative Model Calculations
      const classicalStatus = classicalLayers?.finalVectors[dir] || 'SAFE';
      const classicalScore = getStatusScore(classicalStatus);

      const physicalIndepStatus = physicalIndepLayers?.finalVectors[dir] || 'SAFE';
      const physicalIndepScore = getStatusScore(physicalIndepStatus);

      const physicalCoupledStatus = physicalCoupledLayers?.finalVectors[dir] || 'SAFE';
      const physicalCoupledScore = getStatusScore(physicalCoupledStatus);

      // Consensus / Divergence Highlights
      const isClassicalHigh = !classicalStatus.startsWith('NOISE');
      const isPhysicalIndepHigh = !physicalIndepStatus.startsWith('NOISE');
      const isPhysicalCoupledHigh = !physicalCoupledStatus.startsWith('NOISE');

      const isConsensusClear = isClassicalHigh && isPhysicalIndepHigh && isPhysicalCoupledHigh;

      const hasHigh = isClassicalHigh || isPhysicalIndepHigh || isPhysicalCoupledHigh;
      const hasLow = !isClassicalHigh || !isPhysicalIndepHigh || !isPhysicalCoupledHigh;
      const isDivergenceAlert = hasHigh && hasLow;

      return {
        direction: dir,
        labelJa: dirMapJa[dir],
        status,
        score,
        isNoise,
        luckyDays: forecast.luckyDays,
        dates: forecast.dates,
        topArea,
        topAreas: topAreas.slice(0, 5),
        topRental,
        topRentals: topRentals.slice(0, 5),
        
        // Extended comparative fields
        classicalStatus,
        classicalScore,
        physicalIndepStatus,
        physicalIndepScore,
        physicalCoupledStatus,
        physicalCoupledScore,
        isConsensusClear,
        isDivergenceAlert
      };
    });
  }, [
    activeVectors,
    scorecard30DaysForecast,
    wealthData,
    propertiesData,
    useTrueNorth,
    classicalLayers,
    physicalIndepLayers,
    physicalCoupledLayers
  ]);

  const getCellBgColor = (score: number, status: string, isConsensus?: boolean, isDivergence?: boolean) => {
    if (isConsensus) return 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30';
    if (isDivergence) return 'bg-amber-950/20 text-amber-500 border border-amber-500/20';

    if (score >= 80) return 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/10';
    if (score >= 50) return 'bg-blue-950/10 text-blue-400 border border-blue-500/10';
    if (score >= 30) return 'bg-amber-950/10 text-amber-500 border border-amber-500/10';
    return 'bg-red-950/10 text-red-400 border border-red-500/10';
  };

  const handleExportGridCsv = () => {
    if (scorecardActiveGridTab === 'dates') {
      if (!scorecard30DaysForecastAllModels) return;
      const headers = ['日付', '曜日', '方位', '合意判定', '古典_スコア', '古典_ステータス', '物理独立_スコア', '物理独立_ステータス', '伝統連動_スコア', '伝統連動_ステータス'];
      const rows: any[] = [];
      const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      
      scorecard30DaysForecastAllModels.forEach(day => {
        dirs.forEach(dir => {
          const classData = day.models.classical[dir];
          const indepData = day.models.physicalIndep[dir];
          const coupledData = day.models.physicalCoupled[dir];
          
          const isClassHigh = !classData.status.startsWith('NOISE');
          const isIndepHigh = !indepData.status.startsWith('NOISE');
          const isCoupledHigh = !coupledData.status.startsWith('NOISE');
          const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
          const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
          const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
          const isDivergenceAlert = hasHigh && hasLow;
          
          let consensusLabel = '-';
          if (isConsensusClear) consensusLabel = 'トリプル大吉 🌟';
          else if (isDivergenceAlert) consensusLabel = '位相差警告 ⚠️';
          
          rows.push([
            day.dateStr,
            weekdays[day.weekday],
            dir,
            consensusLabel,
            classData.score,
            classData.status,
            indepData.score,
            indepData.status,
            coupledData.score,
            coupledData.status
          ]);
        });
      });
      
      const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `30day_pattern_scorecard_${scorecardPrefecture}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!scorecardHonmeiStarsForecast) return;
      const headers = ['本命星', '方位', '合意判定', '古典_スコア', '古典_ステータス', '物理独立_スコア', '物理独立_ステータス', '伝統連動_スコア', '伝統連動_ステータス'];
      const rows: any[] = [];
      const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      
      scorecardHonmeiStarsForecast.forEach(star => {
        dirs.forEach(dir => {
          const classData = star.models.classical[dir];
          const indepData = star.models.physicalIndep[dir];
          const coupledData = star.models.physicalCoupled[dir];
          
          const isClassHigh = !classData.status.startsWith('NOISE');
          const isIndepHigh = !indepData.status.startsWith('NOISE');
          const isCoupledHigh = !coupledData.status.startsWith('NOISE');
          const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
          const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
          const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
          const isDivergenceAlert = hasHigh && hasLow;
          
          let consensusLabel = '-';
          if (isConsensusClear) consensusLabel = 'トリプル大吉 🌟';
          else if (isDivergenceAlert) consensusLabel = '位相差警告 ⚠️';
          
          rows.push([
            star.label.replace(/,/g, ' '),
            dir,
            consensusLabel,
            classData.score,
            classData.status,
            indepData.score,
            indepData.status,
            coupledData.score,
            coupledData.status
          ]);
        });
      });
      
      const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `honmei_stars_scorecard_${scorecardPrefecture}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportForGemini = async () => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams({
        birth_date: birthDate || '',
        birth_lat: birthLat?.toString() || '',
        birth_lon: birthLon?.toString() || '',
        base_lat: lat?.toString() || '',
        base_lon: lon?.toString() || '',
        use_classical: useClassicalBoard.toString(),
        physical_month_mode: physicalMonthMode,
        use_true_north: useTrueNorth.toString(),
        layer_mode: activeLayerMode,
        direction_filter_mode: directionFilterMode,
        date: evalDate.toISOString()
      });
      const res = await fetch(`/api/relocation/export?${queryParams.toString()}`);
      if (!res.ok) throw new Error("エクスポートAPIエラー");
      const data = await res.json();
      
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `oracle_engine_gemini_export.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const generateDestinationExportPayload = () => {
    const targetDate = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
    const targetDir = getTargetDirectionInfo();
    const activeVectors = useClassicalBoard ? classicalLayers?.finalVectors : physicalLayers?.finalVectors;
    const targetStatus = (targetDir && activeVectors) 
      ? activeVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] 
      : null;

    const envData = getCurrentEnvironmentalFrequencies(targetDate, lon || 139.6917, physicalMonthMode);
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));
    const zodiacData = getCurrentZodiac(targetDate, lon || 139.6917);

    const LUNAR_MONTH = 29.530588853 * 24 * 60 * 60 * 1000;
    const KNOWN_NEW_MOON = 947182440000;
    const diffMs = targetDate.getTime() - KNOWN_NEW_MOON;
    let phase = (diffMs % LUNAR_MONTH) / LUNAR_MONTH;
    if (phase < 0) phase += 1;
    const lunarCondition = calculateLunarPhaseCondition(targetDate, actionIntent);
    const phaseLabel = lunarCondition.phaseLabel;

    const payload = {
      exportedAt: new Date().toISOString(),
      activeContext: {
        evaluationDate: targetDate.toISOString().split('T')[0],
        actionIntent,
        calculationModel: useClassicalBoard ? "classical (暦基準)" : "physical (木星黄経基準)",
        physicalMonthMode,
        filterMode: directionFilterMode,
        useTrueNorth
      },
      coordinates: {
        baseCoordinates: { lat, lon },
        targetCoordinates: { lat: targetLat, lon: targetLon, elevation: targetElevation },
        heading: targetDir ? {
          trueDirection: targetDir.trueDirection,
          magneticDirection: targetDir.magneticDirection,
          declination: geoData?.declination || null,
          inclination: geoData?.inclination || null,
          intensity: geoData?.intensity || null
        } : null
      },
      personalProfile: {
        birthDate: birthDate ? birthDate.split('T')[0] : null,
        astrologicalStars: {
          honmeiStarPhysical: honmeiStar?.physical || null,
          honmeiStarClassical: honmeiStar?.classical || null,
          getsuMeiStar: getsuMeiStar || null,
          voidZodiacs: voidZodiacArray
        }
      },
      environmentalState: {
        centralStars: {
          yearStar: useClassicalBoard ? envData.classicalYearStar : envData.yearStar,
          monthStar: useClassicalBoard ? envData.classicalMonthStar : envData.monthStar,
          dayStar: useClassicalBoard ? envData.classicalDayStar : envData.dayStar
        },
        zodiacs: zodiacData,
        lunarPhase: {
          phaseValue: phase,
          phaseLabel: phaseLabel
        }
      },
      vectorCollision: {
        targetDirectionStatus: targetStatus,
        targetDirectionDetails: targetDir ? {
          yearLayer: (useClassicalBoard ? classicalLayers?.yearLayer : physicalLayers?.yearLayer)?.[useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection] || null,
          monthLayer: (useClassicalBoard ? classicalLayers?.monthLayer : physicalLayers?.monthLayer)?.[useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection] || null,
          dayLayer: (useClassicalBoard ? classicalLayers?.dayLayer : physicalLayers?.dayLayer)?.[useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection] || null
        } : null,
        allDirectionsFinal: activeVectors || null,
        modelsComparison: {
          targetDirection: targetDir ? {
            classical: {
              status: classicalLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || null,
              score: getStatusScore(classicalLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE')
            },
            physicalIndependent: {
              status: physicalIndepLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || null,
              score: getStatusScore(physicalIndepLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE')
            },
            physicalCoupled: {
              status: physicalCoupledLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || null,
              score: getStatusScore(physicalCoupledLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE')
            }
          } : null,
          allDirections: {
            classical: classicalLayers?.finalVectors || null,
            physicalIndependent: physicalIndepLayers?.finalVectors || null,
            physicalCoupled: physicalCoupledLayers?.finalVectors || null
          }
        }
      },
      biometrics: {
        hrv,
        gsr,
        baseSyncDays,
        ansLoad,
        shieldCapacity
      },
      spaceWeather: {
        kpIndex: spaceWeather?.kpIndex || null,
        xrayFlux: spaceWeather?.xrayFlux || null
      },
      timingOptimization: {
        recommendationText: timingOptimization?.recommendationText || null,
        details: timingOptimization?.details || []
      },
      prompt_suggestion: `あなたは超科学・生体磁気学・東洋占星術（九星気学、四柱推命）を融合したメタフィジカル意思決定のアドバイザーです。
以下のJSONデータをもとに、なぜ目標日（${targetDate.toLocaleDateString()}）に目標方位（磁北: ${targetDir?.magneticDirection || "未指定"} / 真北: ${targetDir?.trueDirection || "未指定"}）が吉凶ステータス「${targetStatus || "判定不能"}」になったのか、そしてなぜこの期間の行動が推奨されたのか（Timing Recommendation）を、物理法則と伝統占星術の両面からわかりやすく日本語で論理的に解説してください。
特に、生体センサーデータ（HRV、GSR、ANS Overload）と環境磁場、九星の衝突配置、天中殺やドラゴニックノードの干渉などを関連付けて説明し、実用的なアドバイスを提供してください。`
    };

    return payload;
  };

  const getAiAssistantTextSummary = () => {
    const targetDate = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
    const targetDir = getTargetDirectionInfo();
    const activeVectors = useClassicalBoard ? classicalLayers?.finalVectors : physicalLayers?.finalVectors;
    const targetStatus = (targetDir && activeVectors) 
      ? activeVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] 
      : null;

    const envData = getCurrentEnvironmentalFrequencies(targetDate, lon || 139.6917, physicalMonthMode);
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));
    const zodiacData = getCurrentZodiac(targetDate, lon || 139.6917);

    const LUNAR_MONTH = 29.530588853 * 24 * 60 * 60 * 1000;
    const KNOWN_NEW_MOON = 947182440000;
    const diffMs = targetDate.getTime() - KNOWN_NEW_MOON;
    let phase = (diffMs % LUNAR_MONTH) / LUNAR_MONTH;
    if (phase < 0) phase += 1;
    const lunarCondition = calculateLunarPhaseCondition(targetDate, actionIntent);
    const phaseLabel = lunarCondition.phaseLabel;

    return `あなたは超科学・生体磁気学・東洋占星術（九星気学、四柱推命）を融合したメタフィジカル意思決定のアドバイザーです。
以下のパラメータデータをもとに、なぜ目標日（${targetDate.toLocaleDateString()}）に目標方位（磁北: ${targetDir?.magneticDirection || "未指定"} / 真北: ${targetDir?.trueDirection || "未指定"}）が吉凶ステータス「${targetStatus || "判定不能"}」になったのか、そしてなぜこの期間の行動が推奨されたのか（Timing Recommendation）を、物理法則と伝統占星術の両面からわかりやすく日本語で論理的に解説してください。
特に、生体センサーデータ（HRV、GSR、ANS Overload）と環境磁場、九星の衝突配置、天中殺やドラゴニックノードの干渉などを関連付けて説明し、実用的なアドバイスを提供してください。

--- PARAMETER DATA ---
【基本情報】
・評価日時: ${targetDate.toLocaleDateString()} (${timeOffsetDays > 0 ? `+${timeOffsetDays}` : timeOffsetDays}日後)
・行動目的 (Action Intent): ${actionIntent}
・演算モデル (Calculation Model): ${useClassicalBoard ? "classical (暦基準)" : "physical (木星黄経基準)"}
・物理月盤算出モード: ${physicalMonthMode}
・フィルターモード: ${directionFilterMode}
・基準北: ${useTrueNorth ? "真北基準" : "磁北基準"}

【座標・位置情報】
・基準地座標: 緯度 ${lat?.toFixed(4)}, 経度 ${lon?.toFixed(4)}
・目標地座標: 緯度 ${targetLat ?? "未設定"}, 経度 ${targetLon ?? "未設定"}, 標高 ${targetElevation ?? 0}m
・方位判定: 磁北 ${targetDir?.magneticDirection || "未指定"} / 真北 ${targetDir?.trueDirection || "未指定"}

【個人アストロプロファイル】
・生年月日: ${birthDate ? birthDate.split('T')[0] : "未設定"}
・本命星(Physical): ${honmeiStar?.physical || "未設定"}
・本命星(Classical): ${honmeiStar?.classical || "未設定"}
・月命星 (Getsumei): ${getsuMeiStar || "未設定"}
・個人天中殺 (Void Zodiacs): ${voidZodiacArray.join(', ')}

【九星盤・環境状態】
・環境九星 (中宮): 年星 ${useClassicalBoard ? envData.classicalYearStar : envData.yearStar} / 月星 ${useClassicalBoard ? envData.classicalMonthStar : envData.monthStar} / 日星 ${useClassicalBoard ? envData.classicalDayStar : envData.dayStar}
・十二支: 年支 ${zodiacData.yearZodiac} / 月支 ${zodiacData.monthZodiac} / 日支 ${zodiacData.dayZodiac}
・月相 (Lunar Phase): ${phaseLabel}

【吉凶衝突判定 (Vector Collision)】
・目標方位の総合ステータス: ${targetStatus || "判定不能"}
・各モデルの目標方位判定:
  - 古典暦基準: ${targetDir ? classicalLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || "SAFE" : "未指定"} (スコア: ${targetDir ? getStatusScore(classicalLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE') : "-"})
  - 物理独立型: ${targetDir ? physicalIndepLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || "SAFE" : "未指定"} (スコア: ${targetDir ? getStatusScore(physicalIndepLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE') : "-"})
  - 伝統連動型: ${targetDir ? physicalCoupledLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || "SAFE" : "未指定"} (スコア: ${targetDir ? getStatusScore(physicalCoupledLayers?.finalVectors[(useTrueNorth ? targetDir.trueDirection : targetDir.magneticDirection) as Direction] || 'SAFE') : "-"})
・目標方位の各レイヤーステータス (アクティブモデル):
  - 年盤レイヤー: ${(useClassicalBoard ? classicalLayers?.yearLayer : physicalLayers?.yearLayer)?.[useTrueNorth ? targetDir?.trueDirection! : targetDir?.magneticDirection!] || "SAFE"}
  - 月盤レイヤー: ${(useClassicalBoard ? classicalLayers?.monthLayer : physicalLayers?.monthLayer)?.[useTrueNorth ? targetDir?.trueDirection! : targetDir?.magneticDirection!] || "SAFE"}
  - 日盤レイヤー: ${(useClassicalBoard ? classicalLayers?.dayLayer : physicalLayers?.dayLayer)?.[useTrueNorth ? targetDir?.trueDirection! : targetDir?.magneticDirection!] || "SAFE"}

【生体・磁気テレメトリー】
・自律神経負荷 (ANS Overload): ${ansLoad}%
・シールド容量 (Shield Capacity): ${shieldCapacity}%
・心拍変動 (HRV): ${hrv} ms
・皮膚電気活動 (GSR): ${gsr} μS
・環境順化日数 (Sync Days): ${baseSyncDays}日
・宇宙天気 Kp-index: ${spaceWeather?.kpIndex !== undefined ? spaceWeather.kpIndex : "未取得"}
・太陽X線フラックス: ${spaceWeather?.xrayFlux || "未取得"}
・局所磁場強度: F=${geoData?.intensity?.toFixed(0) || "未計算"}nT, D=${geoData?.declination?.toFixed(2) || "未計算"}°, I=${geoData?.inclination?.toFixed(2) || "未計算"}°

【タイミング最適化 (Timing Optimization)】
・推奨テキスト (Recommendation):
${timingOptimization?.recommendationText || "特になし"}
`;
  };

  const handleCopyAiPrompt = () => {
    const text = getAiAssistantTextSummary();
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownloadDestinationJson = () => {
    const payload = generateDestinationExportPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const targetDateStr = payload.activeContext.evaluationDate;
    link.download = `destination_ai_report_${targetDateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  useEffect(() => {
    if (heatmapMode === 'none' || !baseTime || !honmeiStar || !env) return;

    const data = [];
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));

    if (heatmapMode === '30days') {
      for (let i = 0; i < 30; i++) {
        const testDateLocal = new Date(baseTime.getTime() + (timeOffsetDays + i) * 86400000);
        const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
        const testDate = testDateSolar.solarTime;
        const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);
        const dB = generateBoard(useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, dB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? 'traditional' : 'physical'
        );

        const filteredV = filterVectors(
          vectorData,
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          yB, mB, dB,
          directionFilterMode,
          useClassicalBoard ? getsuMeiStar : null,
          activeLayerMode
        );

        data.push({
          label: `${testDate.getMonth() + 1}/${testDate.getDate()}`,
          vectors: filteredV,
          isVoid: voidZodiacArray.some(z => [getCurrentZodiac(testDate, lon || 139.6917).yearZodiac, getCurrentZodiac(testDate, lon || 139.6917).monthZodiac, getCurrentZodiac(testDate, lon || 139.6917).dayZodiac].includes(z)),
          offsetDays: timeOffsetDays + i
        });
      }
    } else if (heatmapMode === '12months') {
      for (let i = 0; i < 12; i++) {
        const testDateLocal = new Date(baseTime.getTime() + timeOffsetDays * 86400000);
        testDateLocal.setDate(15); // 月末の月またぎバグを防ぐため、常にその月の中旬を基準にする
        testDateLocal.setMonth(testDateLocal.getMonth() + i);
        const testDateSolar = calculateSolarTime(testDateLocal, lon || 139.6917);
        const testDate = testDateSolar.solarTime;
        const testEnv = getCurrentEnvironmentalFrequencies(testDate, lon || 139.6917, physicalMonthMode);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);
        const dB = generateBoard(useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, dB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent,
          testDate,
          lon || 139.6917,
          useClassicalBoard && getsuMeiStar ? getsuMeiStar : undefined,
          useClassicalBoard ? 'traditional' : 'physical'
        );

        const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const tendoDir = vectorData.tendoDirection;

        const getLayerScore = (status: string): number => {
          switch (status) {
            case 'OPTIMAL': return 100;
            case 'OPTIMAL_REGULAR': return 50;
            case 'SAFE': return 0;
            case 'NOISE_HONMEI': return -30;
            case 'NOISE_TEKI': return -30;
            case 'NOISE_GETSUMEI': return -30;
            case 'NOISE_GETSUTEKI': return -30;
            case 'NOISE_NODE': return -40;
            case 'NOISE_VOID': return -80;
            case 'NOISE_GOU': return -100;
            case 'NOISE_ANKEN': return -100;
            case 'NOISE_HA': return -100;
            default: return 0;
          }
        };

        dirs.forEach(dir => {
          vectorData.dayLayer[dir] = 'SAFE'; // 12ヶ月モードでは日盤のノイズを除外
          const y = vectorData.yearLayer[dir] || 'SAFE';
          const m = vectorData.monthLayer[dir] || 'SAFE';
          const d = 'SAFE';

          const layersList = [y, m, d];
          const hasGou = layersList.includes('NOISE_GOU');
          const hasAnken = layersList.includes('NOISE_ANKEN');
          const hasHa = layersList.includes('NOISE_HA');

          if (hasGou) {
            vectorData.finalVectors[dir] = 'NOISE_GOU' as any;
          } else if (hasAnken) {
            vectorData.finalVectors[dir] = 'NOISE_ANKEN' as any;
          } else if (hasHa) {
            vectorData.finalVectors[dir] = 'NOISE_HA' as any;
          } else if (layersList.includes('NOISE_VOID')) {
            vectorData.finalVectors[dir] = 'NOISE_VOID' as any;
          } else if (layersList.includes('NOISE_HONMEI')) {
            vectorData.finalVectors[dir] = 'NOISE_HONMEI' as any;
          } else if (layersList.includes('NOISE_TEKI')) {
            vectorData.finalVectors[dir] = 'NOISE_TEKI' as any;
          } else if (layersList.includes('NOISE_GETSUMEI')) {
            vectorData.finalVectors[dir] = 'NOISE_GETSUMEI' as any;
          } else if (layersList.includes('NOISE_GETSUTEKI')) {
            vectorData.finalVectors[dir] = 'NOISE_GETSUTEKI' as any;
          } else if (layersList.includes('NOISE_NODE')) {
            vectorData.finalVectors[dir] = 'NOISE_NODE' as any;
          } else {
            const hasOpt = layersList.includes('OPTIMAL');
            const hasOptReg = layersList.includes('OPTIMAL_REGULAR');
            if (hasOpt) {
              vectorData.finalVectors[dir] = 'OPTIMAL' as any;
            } else if (hasOptReg) {
              vectorData.finalVectors[dir] = 'OPTIMAL_REGULAR' as any;
            } else {
              vectorData.finalVectors[dir] = 'SAFE';
            }
          }
        });

        const filteredV = filterVectors(
          vectorData,
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          yB, mB, dB,
          directionFilterMode,
          useClassicalBoard ? getsuMeiStar : null,
          activeLayerMode === 'day' ? 'month' : activeLayerMode
        );

        const diffDays = Math.round((testDate.getTime() - baseTime.getTime()) / 86400000);
        data.push({
          label: `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}`,
          vectors: filteredV,
          isVoid: voidZodiacArray.some(z => [getCurrentZodiac(testDate, lon || 139.6917).yearZodiac, getCurrentZodiac(testDate, lon || 139.6917).monthZodiac].includes(z)),
          offsetDays: diffDays
        });
      }
    }
    setHeatmapData(data);
  }, [heatmapMode, baseTime, timeOffsetDays, honmeiStar, getsuMeiStar, actionIntent, useClassicalBoard, voidZodiacOverride, birthDate, env, directionFilterMode, activeLayerMode, physicalMonthMode]);

  const exportMasterTelemetry = () => {
    const timestampStr = new Date().getTime();
    const header = [
      "Timestamp", "Base_Lat", "Base_Lon",
      "Birth_Date", "Birth_Lat", "Birth_Lon",
      "Honmei_Phys", "Honmei_Class",
      "Birth_Year_Star", "Birth_Month_Star", "Birth_Day_Star",
      "Birth_Jupiter_Lon", "Birth_Lunar_Lon", "Birth_Solar_Lon",
      "Current_Time",
      "Current_Year_Star", "Current_Month_Star", "Current_Day_Star",
      "Current_Jupiter_Lon", "Current_Lunar_Lon", "Current_Solar_Lon",
      "Space_Kp_Index", "Space_Xray_Flux",
      "Geo_Magnetic_F", "Geo_Magnetic_D", "Geo_Magnetic_I",
      "Bio_HRV", "Bio_GSR", "Bio_ANS_Load", "Bio_Shield_Capacity",
      "Timing_Target_Date",
      "Timing_Psychology", "Timing_Kigaku", "Timing_Astrology",
      "Phys_N", "Phys_NE", "Phys_E", "Phys_SE", "Phys_S", "Phys_SW", "Phys_W", "Phys_NW",
      "Class_N", "Class_NE", "Class_E", "Class_SE", "Class_S", "Class_SW", "Class_W", "Class_NW",
      "PhysIndep_N", "PhysIndep_NE", "PhysIndep_E", "PhysIndep_SE", "PhysIndep_S", "PhysIndep_SW", "PhysIndep_W", "PhysIndep_NW",
      "PhysCoupled_N", "PhysCoupled_NE", "PhysCoupled_E", "PhysCoupled_SE", "PhysCoupled_S", "PhysCoupled_SW", "PhysCoupled_W", "PhysCoupled_NW",
      "NBA_Suggested_Action", "NBA_Expected_Reward", "NBA_Confidence",
      "Micro_Stress", "Micro_Resilience",
      "DS_Ephemeris_Source", "DS_Ephemeris_Detail",
      "DS_Astrology_Source", "DS_Astrology_Detail",
      "DS_RAG_Source", "DS_RAG_Detail",
      "NBA_EnvRisk", "NBA_SolarPhase",
      "Ephemeris_Sun", "Ephemeris_Moon", "Ephemeris_Jupiter", "Ephemeris_LunarNode",
      "Bazi_DayMaster", "Western_Aspects",
      "Vedic_Nakshatra", "Vedic_MoonProgress", "Vedic_SunNakshatra", "Vedic_SunProgress", "Vedic_Tithi", "Vedic_Ayanamsa",
      "IChing_HexNumber", "IChing_HexName", "IChing_RiskMod", "IChing_ConfBoost",
      "NBA_LogicTrace"
    ].join(",");

    const row = [
      new Date().toISOString(), lat, lon,
      birthDate, birthLat, birthLon,
      honmeiStar?.physical || "", honmeiStar?.classical || "",
      birthEnv?.yearStar || "", birthEnv?.monthStar || "", birthEnv?.dayStar || "",
      birthEnv?.raw?.jupiterLon?.toFixed(4) || "", birthEnv?.raw?.moonLon?.toFixed(4) || "", birthEnv?.raw?.sunLon?.toFixed(4) || "",
      ephemerisTime?.toISOString() || "",
      env?.yearStar || "", env?.monthStar || "", env?.dayStar || "",
      env?.raw?.jupiterLon?.toFixed(4) || "", env?.raw?.moonLon?.toFixed(4) || "", env?.raw?.sunLon?.toFixed(4) || "",
      spaceWeather?.kpIndex !== null ? spaceWeather?.kpIndex : "",
      spaceWeather?.xrayFlux !== null ? spaceWeather?.xrayFlux : "",
      geoData?.intensity || "", geoData?.declination || "", geoData?.inclination || "",
      hrv, gsr, ansLoad, shieldCapacity,
      evalDate.toISOString().split('T')[0], // Timing_Target_Date (YYYY-MM-DD)
      timingOptimization?.details.find(d => d.name.includes('Psychology'))?.phenomenon || "",
      timingOptimization?.details.find(d => d.name.includes('Kigaku'))?.phenomenon || "",
      timingOptimization?.details.find(d => d.name.includes('Astrology'))?.phenomenon || "",
      physicalLayers?.finalVectors?.N || "", physicalLayers?.finalVectors?.NE || "",
      physicalLayers?.finalVectors?.E || "", physicalLayers?.finalVectors?.SE || "",
      physicalLayers?.finalVectors?.S || "", physicalLayers?.finalVectors?.SW || "",
      physicalLayers?.finalVectors?.W || "", physicalLayers?.finalVectors?.NW || "",
      classicalLayers?.finalVectors?.N || "", classicalLayers?.finalVectors?.NE || "",
      classicalLayers?.finalVectors?.E || "", classicalLayers?.finalVectors?.SE || "",
      classicalLayers?.finalVectors?.S || "", classicalLayers?.finalVectors?.SW || "",
      classicalLayers?.finalVectors?.W || "", classicalLayers?.finalVectors?.NW || "",
      physicalIndepLayers?.finalVectors?.N || "", physicalIndepLayers?.finalVectors?.NE || "",
      physicalIndepLayers?.finalVectors?.E || "", physicalIndepLayers?.finalVectors?.SE || "",
      physicalIndepLayers?.finalVectors?.S || "", physicalIndepLayers?.finalVectors?.SW || "",
      physicalIndepLayers?.finalVectors?.W || "", physicalIndepLayers?.finalVectors?.NW || "",
      physicalCoupledLayers?.finalVectors?.N || "", physicalCoupledLayers?.finalVectors?.NE || "",
      physicalCoupledLayers?.finalVectors?.E || "", physicalCoupledLayers?.finalVectors?.SE || "",
      physicalCoupledLayers?.finalVectors?.S || "", physicalCoupledLayers?.finalVectors?.SW || "",
      physicalCoupledLayers?.finalVectors?.W || "", physicalCoupledLayers?.finalVectors?.NW || "",
      nbaData?.nba.actionResult.suggestedAction || "",
      nbaData?.nba.actionResult.expectedReward?.toFixed(4) || "",
      nbaData?.nba.actionResult.confidence?.toFixed(4) || "",
      nbaData?.micro.ansLoad || "",
      nbaData?.micro.shieldCapacity || "",
      nbaData?.nba.stateVector.ephemerisData?.source || "", nbaData?.nba.stateVector.ephemerisData?.planetaryPositions || "",
      nbaData?.nba.stateVector.astrologyData?.source || "", nbaData?.nba.stateVector.astrologyData?.transits || "",
      nbaData?.nba.stateVector.ragContext?.source || "", nbaData?.nba.stateVector.ragContext?.classicalRules || "",
      nbaData?.nba.stateVector.environmentalRisk ?? "",
      nbaData?.nba.stateVector.solarPhase ?? "",
      nbaData?.macro.streams?.ephemeris?.sun ?? "",
      nbaData?.macro.streams?.ephemeris?.moon ?? "",
      nbaData?.macro.streams?.ephemeris?.jupiter ?? "",
      nbaData?.macro.streams?.ephemeris?.lunarNode ?? "",
      nbaData?.macro.streams?.personalBazi?.summary?.dayMaster ?? nbaData?.macro.streams?.environmentalBazi?.summary?.dayMaster ?? "",
      nbaData?.macro.streams?.westernAstrology?.aspects?.join(' | ') ?? "",
      nbaData?.macro.streams?.vedicAstrology?.nakshatra ?? "",
      nbaData?.macro.streams?.vedicAstrology?.moonProgress ?? "",
      nbaData?.macro.streams?.vedicAstrology?.sunNakshatra ?? "",
      nbaData?.macro.streams?.vedicAstrology?.sunProgress ?? "",
      nbaData?.macro.streams?.vedicAstrology?.tithi ?? "",
      nbaData?.macro.streams?.vedicAstrology?.ayanamsa ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.number ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.name ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.riskModifier ?? "",
      nbaData?.nba.stateVector.ichingHexagram?.confidenceBoost ?? "",
      nbaData?.nba.actionResult.logicTrace?.join(' | ') ?? ""
    ].map(v => `"${v}"`).join(","); // wrap fields in quotes to prevent comma breaks

    const csvContent = "\uFEFF" + header + "\n" + row;
    const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    link.setAttribute("href", csvUrl);
    link.setAttribute("download", `metaphysical_unified_export_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(csvUrl);

    // Export Unified JSON (Full State)
    const fullState = {
      timestamp: new Date().toISOString(),
      location: { lat, lon, targetLat, targetLon },
      personalProfile: { birthDate, birthLat, birthLon, honmeiStar, personalVoidZodiac },
      biometrics: { hrv, gsr, ansLoad, shieldCapacity, zScoreHRV, hardwareDisplacementPenalty, circadianMultiplier },
      baselines: { hrvMean: baselineHrvMean, hrvStd: baselineHrvStd, gsrMean: baselineGsrMean, gsrStd: baselineGsrStd },
      geomagnetism: geoData,
      spaceWeather: spaceWeather,
      ephemeris: env,
      birthEphemeris: birthEnv,
      solarData: solarData,
      spatialVectors: {
        physical: physicalLayers,
        classical: classicalLayers,
        physicalIndependent: physicalIndepLayers,
        physicalCoupled: physicalCoupledLayers,
        activeModel: useClassicalBoard ? 'classical' : 'physical',
        activeLayerMode: activeLayerMode
      },
      timingOptimization: timingOptimization,
      optimizerPreferences: {
        usePsychologyScorer,
        useKigakuScorer,
        useAstrologyScorer
      },
      nbaEngine: nbaData,
      actionIntent,
      timeOffsetDays,
      targetEvaluation: {
        evalDate: evalDate.toISOString(),
        targetDirInfo,
        targetVectorStatus
      },
      voidTimeDiagnostics: {
        kimon,
        currentZodiac,
        isPersonalVoid,
        isYearVoid,
        isMonthVoid,
        isDayVoid,
        isGlobalVoid
      }
    };
    const jsonBlob = new Blob([JSON.stringify(fullState, null, 2)], { type: "application/json" });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement("a");
    jsonLink.setAttribute("href", jsonUrl);
    jsonLink.setAttribute("download", `metaphysical_unified_state_${timestampStr}.json`);
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);
  };

  const handleSaveStateToDatabase = async () => {
    if (!env || !layers) {
      alert("保存するデータが準備されていません。");
      return;
    }

    setIsSavingLog(true);
    try {
      const payload = {
        targetDate: baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000).toISOString() : new Date().toISOString(),
        environmentalBazi: env,
        personalBazi: honmeiStar,
        physicalLayers: physicalLayers,
        classicalLayers: classicalLayers,
        physicalIndependentLayers: physicalIndepLayers,
        physicalCoupledLayers: physicalCoupledLayers,
        ansLoad: ansLoad,
        kpIndex: spaceWeather?.kpIndex || null,
        metadata: {
          actionIntent,
          geoData,
          shieldCapacity,
          timeOffsetDays,
        }
      };

      const res = await fetch('/api/metaphysical-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("APIエラーが発生しました");
      }

      alert("現在のステータスをデータベースに保存しました。");
    } catch (err: any) {
      console.error("Save Log Error:", err);
      alert(`保存に失敗しました: ${err.message}`);
    } finally {
      setIsSavingLog(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setBaseTime(now);
    setEphemerisTime(now);

    const fastTimer = setInterval(() => setBaseTime(new Date()), 60000);
    const slowTimer = setInterval(() => setEphemerisTime(new Date()), 60000);

    return () => {
      clearInterval(fastTimer);
      clearInterval(slowTimer);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetchSpaceWeather().then((data) => setSpaceWeather(data));
  }, []);

  useEffect(() => {
    if (baseTime && lon) {
      const targetTime = new Date(baseTime.getTime() + timeOffsetDays * 86400000);
      setSolarData(calculateSolarTime(targetTime, targetLon || lon));
    }
  }, [baseTime, lon, timeOffsetDays, targetLon]);

  useEffect(() => {
    if (lat && lon) {
      const targetTime = baseTime ? baseTime.getTime() + timeOffsetDays * 86400000 : new Date().getTime();
      getGeomagneticData(lat, lon, targetTime).then((data) =>
        setGeoData(data),
      );
    }
  }, [lat, lon, baseTime, timeOffsetDays]);

  useEffect(() => {
    if (baseSyncTimestamp) {
      const arrivedDate = new Date(baseSyncTimestamp);
      const targetDate = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
      const diffTime = targetDate.getTime() - arrivedDate.getTime();
      let diffDays = diffTime / (1000 * 3600 * 24);
      diffDays = Math.max(0, diffDays);
      setBaseSyncDays(Number(diffDays.toFixed(2)));
    }
  }, [baseSyncTimestamp, baseTime, timeOffsetDays]);

  useEffect(() => {
    if (!baseTime) return;

    let solarHours = 12.0;
    if (solarData?.solarTime) {
      solarHours = solarData.solarTime.getHours() + solarData.solarTime.getMinutes() / 60;
    }

    const LUNAR_MONTH = 29.530588853 * 24 * 60 * 60 * 1000;
    const KNOWN_NEW_MOON = 947182440000;
    const targetDate = new Date(baseTime.getTime() + timeOffsetDays * 86400000);
    const diffMs = targetDate.getTime() - KNOWN_NEW_MOON;
    let phase = (diffMs % LUNAR_MONTH) / LUNAR_MONTH;
    if (phase < 0) phase += 1;

    const metrics = calculateBioMetrics({
      currentHRV: hrv,
      currentGSR: gsr,
      baselineHRVMean: baselineHrvMean,
      baselineHRVStd: baselineHrvStd,
      baselineGSRMean: baselineGsrMean,
      baselineGSRStd: baselineGsrStd,
      birthLat: birthLat,
      birthLon: birthLon,
      currentLat: targetLat || lat,
      currentLon: targetLon || lon,
      elevation: targetElevation || 0,
      kpIndex: spaceWeather?.kpIndex || 2,
      solarTimeHours: solarHours,
      pressureDrop: pressureDrop,
      lunarPhase: phase,
      baseSyncDays: baseSyncDays
    });

    setShieldCapacity(metrics.shieldCapacity);
    setAnsLoad(metrics.ansLoad);
    setZScoreHRV(metrics.zScoreHRV);
    setHardwareDisplacementPenalty(metrics.hardwareDisplacementPenalty);
    setCircadianMultiplier(metrics.circadianMultiplier);
  }, [hrv, gsr, baselineHrvMean, baselineHrvStd, baselineGsrMean, baselineGsrStd, baseSyncDays, spaceWeather, targetElevation, targetLat, targetLon, lat, lon, birthLat, birthLon, solarData, pressureDrop, baseTime, timeOffsetDays]);

  useEffect(() => {
    if (!baseTime) return;

    const targetDate = new Date(baseTime.getTime() + timeOffsetDays * 86400000);

    let timingActionType: 'focus' | 'creative' | 'social' | 'rest' = 'focus';
    if (actionIntent === 'REST') timingActionType = 'rest';
    if (actionIntent === 'BUSINESS') timingActionType = 'social';

    const optimizer = createPersonalizedOptimizer({
      usePsychology: usePsychologyScorer,
      useEasternAstrology: useKigakuScorer,
      useWesternAstrology: useAstrologyScorer,
    });

    let userKigakuStar: number | undefined;
    const activeHonmeiStar = useClassicalBoard ? honmeiStar?.classical : honmeiStar?.physical;
    if (activeHonmeiStar) {
      if (typeof activeHonmeiStar === 'number') {
        userKigakuStar = activeHonmeiStar;
      } else if (typeof activeHonmeiStar === 'string') {
        const match = String(activeHonmeiStar).match(/([一二三四五六七八九])/);
        if (match) {
          const numMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
          userKigakuStar = numMap[match[1]];
        } else {
          const numMatch = String(activeHonmeiStar).match(/(\d)/);
          if (numMatch) userKigakuStar = parseInt(numMatch[1], 10);
        }
      }
    }

    const dirInfo = getTargetDirectionInfo();
    const targetDirection = dirInfo ? (useTrueNorth ? dirInfo.trueDirection : dirInfo.magneticDirection) as Direction : undefined;

    const result = optimizer.evaluate({
      targetDate,
      userBirthDate: birthDate ? new Date(birthDate) : undefined,
      userKigakuStar,
      actionType: timingActionType,
      latitude: targetLat || lat,
      longitude: targetLon || lon,
      useClassical: useClassicalBoard,
      targetDirection,
      actionIntent
    });

    setTimingOptimization(result);
  }, [baseTime, timeOffsetDays, actionIntent, usePsychologyScorer, useKigakuScorer, useAstrologyScorer, honmeiStar, birthDate, targetLat, lat, targetLon, lon, useClassicalBoard, useTrueNorth]);

  const basePersonalVoidZodiac = React.useMemo(() => {
    if (!birthDate) return [];
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return [];
    return getPersonalVoidZodiac(d);
  }, [birthDate]);

  const personalVoidZodiac = voidZodiacOverride ? voidZodiacOverride.split('') : basePersonalVoidZodiac;
  const kimon = solarData ? getKimonHour(solarData.solarTime) : null;
  const isPersonalVoid = kimon ? personalVoidZodiac.includes(kimon.japanese) : false;



  const targetDirInfo = getTargetDirectionInfo();
  let targetVectorStatus: string | null = null;

  if (targetDirInfo && activeVectors) {
    targetVectorStatus = activeVectors[(useTrueNorth ? targetDirInfo.trueDirection : targetDirInfo.magneticDirection) as Direction];
  }

  const evalDate = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
  const currentZodiac = getCurrentZodiac(evalDate, lon || 139.6917);
  const isYearVoid = personalVoidZodiac.includes(currentZodiac.yearZodiac);
  const isMonthVoid = personalVoidZodiac.includes(currentZodiac.monthZodiac);
  const isDayVoid = personalVoidZodiac.includes(currentZodiac.dayZodiac);
  const isGlobalVoid = isYearVoid || isMonthVoid;

  const activeYearBoard = useClassicalBoard ? classicalYearBoard : physicalYearBoard;
  const activeMonthBoard = useClassicalBoard ? classicalMonthBoard : physicalMonthBoard;
  const activeDayBoard = useClassicalBoard ? classicalDayBoard : physicalDayBoard;

  const renderMatrixCell = (dir: string, star: any, status: any, isCenter: boolean = false) => {
    const getColorClass = (s: string) => {
      if (!s) return 'text-zinc-500';
      if (s.startsWith('NOISE_GOU') || s.startsWith('NOISE_ANKEN')) return 'text-red-500 font-bold bg-red-950/30 border-red-900/50';
      if (s.startsWith('NOISE_HONMEI') || s.startsWith('NOISE_TEKI') || s.startsWith('NOISE_GETSUMEI') || s.startsWith('NOISE_GETSUTEKI')) return 'text-[#a855f7] font-bold bg-[#a855f7]/10 border-[#a855f7]/30';
      if (s.startsWith('NOISE_VOID')) return 'text-zinc-500 bg-zinc-900 border-zinc-700';
      if (s.startsWith('NOISE_NODE')) return 'text-yellow-400 font-bold bg-yellow-950/30 border-yellow-900/50';
      if (s === 'OPTIMAL') return 'text-emerald-400 font-bold bg-emerald-950/30 border-emerald-900/50 shadow-[0_0_8px_rgba(16,185,129,0.2)]';
      if (s === 'OPTIMAL_REGULAR') return 'text-emerald-500 font-bold bg-emerald-950/15 border-emerald-900/30 shadow-[0_0_4px_rgba(16,185,129,0.1)]';
      return 'text-blue-400 bg-blue-950/10 border-blue-900/30';
    };

    const baseClass = isCenter ? 'bg-zinc-900/50 border-zinc-800 text-zinc-500' : 'bg-black/40 border-zinc-800/80';
    const colorClass = isCenter ? '' : getColorClass(status);

    return (
      <div className={`p-1 flex flex-col items-center justify-center border rounded-sm transition-all ${baseClass} ${colorClass}`}>
        <span className="text-[7px] text-zinc-500 uppercase tracking-widest">{dir}</span>
        <span className={`text-lg sm:text-xl font-mono font-bold leading-none my-0.5 ${isCenter ? 'text-zinc-600' : ''}`}>{star || '-'}</span>
        {!isCenter && status && <span className="text-[5px] sm:text-[6px] uppercase tracking-tighter opacity-80 leading-none">{status.replace('NOISE_', '')}</span>}
      </div>
    );
  };

  const TooltipCell = ({ 
    status, 
    board, 
    isFinal, 
    layerType, 
    dir, 
    isClassical 
  }: { 
    status: string, 
    board: any, 
    isFinal?: boolean, 
    layerType: 'year' | 'month' | 'day' | 'final', 
    dir: Direction, 
    isClassical: boolean 
  }) => {
    const getColor = (s: string) => {
      if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'text-red-500 font-bold';
      if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI' || s === 'NOISE_GETSUMEI' || s === 'NOISE_GETSUTEKI') return 'text-[#a855f7] font-bold';
      if (s === 'NOISE_VOID') return 'text-zinc-600 font-bold drop-shadow-[0_0_3px_rgba(0,0,0,1)] bg-zinc-950 px-1 border border-zinc-800';
      if (s === 'NOISE_NODE') return 'text-yellow-400 font-bold';
      if (s === 'NOISE_HA') return 'text-rose-400 font-bold';
      if (s === 'OPTIMAL') return 'text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]';
      if (s === 'OPTIMAL_REGULAR') return 'text-emerald-500 font-medium drop-shadow-[0_0_2px_rgba(16,185,129,0.4)]';
      if (s === 'WARNING') return 'text-orange-400 font-bold';
      return 'text-blue-400';
    };

    const formatLabel = (s: string) => {
      if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'TYPE_I_NOISE';
      if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI' || s === 'NOISE_GETSUMEI' || s === 'NOISE_GETSUTEKI') return 'TYPE_II_NOISE';
      if (s === 'NOISE_VOID') return 'VOID_ZONE';
      if (s === 'NOISE_NODE') return 'LUNAR_NODE';
      if (s === 'NOISE_HA') return 'CLASH_HA';
      if (s === 'OPTIMAL_REGULAR') return 'LUCKY_ZONE';
      if (s === 'WARNING') return 'WARNING_ZONE';
      return s;
    };

    const label = formatLabel(status);
    if (!honmeiStar) return <span>{label}</span>;
    const star = board ? board[dir] : '?';
    let title = "🟦 通常ゾーン (SAFE)";
    let desc = "致命的な定在波やノイズは観測されていません。標準ベースラインです。";
    if (status === 'NOISE_GOU') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "強力な環境ノイズ帯。重大な行動阻害リスクが観測されています。"; }
    else if (status === 'NOISE_ANKEN') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "外部からの突発的干渉ノイズが観測される行動阻害エリアです。"; }
    else if (status === 'NOISE_HONMEI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "あなたの固有波長との共鳴過負荷(オーバーヒート)が起きる干渉帯です。"; }
    else if (status === 'NOISE_TEKI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "目標・方向性に対するダイレクトな干渉ノイズが発生するエリアです。"; }
    else if (status === 'NOISE_GETSUMEI') { title = "🟪 月命殺 (GETSUMEI)"; desc = "あなたの月命星との共鳴干渉エリアです。身体や精神に微細な不協和音を招きやすいノイズ帯です。"; }
    else if (status === 'NOISE_GETSUTEKI') { title = "🟪 月的殺 (GETSUTEKI)"; desc = "あなたの月命星の対向位置にあたる干渉エリアです。目標設定や契約に微妙な混乱を招きやすいノイズ帯です。"; }
    else if (status === 'NOISE_VOID') { title = "⬛ 虚無・ボイド空間 (VOID ZONE)"; desc = "あなたの天中殺（空亡）に該当する構造的エラー領域です。空間の吉凶に関わらず行動がリセットされます。"; }
    else if (status === 'NOISE_NODE') { title = "🟨 月交点 (LUNAR NODE)"; desc = "日食・月食ラインの特異点。精神や自律神経に異常干渉を起こしやすいエリアです。"; }
    else if (status === 'NOISE_HA') { title = "🟥 破壊ノイズ・破 (CLASH HA)"; desc = "十二支の対衝（対向）位置による強力な不整合波。「歳破」「月破」「日破」のいずれかに該当し、行動や進捗を破壊・頓挫させる極めて危険なユニバーサルノイズです。"; }
    else if (status === 'OPTIMAL') { title = "🌟 最大吉方位 (MAX OPTIMAL)"; desc = "本命星と月命星の双方が相生・比和する最強の開運方位です。"; }
    else if (status === 'OPTIMAL_REGULAR') { title = "🟢 吉方位 (LUCKY)"; desc = "あなたの本命星と相生・比和する、運気を高める良好な方位です。"; }
    else if (status === 'WARNING') { title = "🟧 警告・調整ゾーン (WARNING)"; desc = "環境ノイズ（五黄殺等）が観測されていますが、天道効果により部分的に相殺・緩和されています。注意して選択してください。"; }

    const isTendoDir = (isClassical ? classicalLayers : physicalLayers)?.tendoDirection === dir;

    return (
      <div className="group relative cursor-help inline-block">
        <span className={`${getColor(status)} border-b border-zinc-700/50 hover:border-current`}>{label}</span>
        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-950 border border-zinc-700 text-zinc-300 text-[9px] shadow-2xl z-50 rounded-sm font-sans normal-case leading-relaxed pointer-events-none">
          <div className={`font-bold mb-1 border-b border-zinc-800 pb-1 ${getColor(status)}`}>{title}</div>
          <div className="text-zinc-400 mb-1 leading-tight">{desc}</div>
          {isTendoDir && (
            <div className="text-[8px] text-emerald-400 font-bold mb-1 bg-emerald-950/50 p-1 border border-emerald-900/30 rounded-xs">
              ✨ 天道波動重畳中 (吉殺効果により本命殺・的殺等の個人的凶殺を無害化)
            </div>
          )}
          {(() => {
            const activeBoardForBreakdown = isFinal 
              ? (useClassicalBoard ? classicalDayBoard : physicalDayBoard)
              : board;
            const br = getVectorBreakdown(
              dir,
              activeBoardForBreakdown,
              useClassicalBoard ? honmeiStar!.classical : honmeiStar!.physical,
              personalVoidZodiac,
              layerType,
              currentZodiac,
              env?.raw?.lunarNode ?? null
            );
            return (
              <div className="text-[7.5px] text-zinc-500 font-mono mt-1.5 pt-1.5 border-t border-zinc-800 space-y-0.5">
                <div className="flex justify-between"><span>【環境要因】:</span> <span className={br.environmental.includes('通常') ? 'text-blue-400' : 'text-rose-400 font-bold'}>{br.environmental}</span></div>
                <div className="flex justify-between"><span>【生体相性】:</span> <span className={br.personal.includes('通常') ? 'text-zinc-500' : br.personal.includes('吉') ? 'text-emerald-400 font-bold' : 'text-purple-400 font-bold'}>{br.personal}</span></div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  if (!baseTime || !solarData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase md:animate-pulse">
        Initializing Tactical Systems...
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-900 pt-4 md:pt-16 pb-8 md:pb-16 relative overflow-x-hidden">
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      ></div>

      {isGlobalVoid && (
        <div className="w-full max-w-5xl px-3 md:px-4 mt-2 animate-fade-in z-50">
          <div className="bg-black border-2 border-red-500/50 rounded-md p-3 md:p-4 shadow-[0_0_20px_rgba(239,68,68,0.2)] flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
              <h2 className="text-red-500 font-bold tracking-[0.2em] text-sm md:text-base uppercase">Global Time Check Error</h2>
            </div>
            <p className="text-zinc-300 text-xs md:text-sm font-mono leading-relaxed">
              現在は<strong>「{isYearVoid ? '年の天中殺' : '月の天中殺'}」</strong>期間です。<br className="hidden md:block" />
              空間の吉凶に関わらず、時間構造にノイズが発生しているため、能動的な大きな移動・決断は推奨されません。
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center space-y-6 md:space-y-8 z-10 w-full max-w-5xl px-3 md:px-4 animate-fade-in-up mt-4">

        <div className="w-full max-w-4xl text-center mb-2 px-4">
          <h1 className="text-emerald-500 font-mono text-xl tracking-[0.2em] font-bold mb-2 uppercase drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] flex items-center justify-center gap-3">
            Bio-Location Simulator
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed max-w-2xl mx-auto mb-4">
            引越し・移住・長期滞在など、人生の大きな決断において<strong className="text-zinc-200">「最適な移動地（方位）」</strong>と<strong className="text-zinc-200">「最適なタイミング（時間）」</strong>を導き出すためのデータサイエンス・ダッシュボードです。
          </p>
          <button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono uppercase tracking-widest border border-emerald-500/50 bg-emerald-950/20 px-4 py-1.5 transition-colors"
          >
            {showHowItWorks ? '[-] CLOSE ALGORITHM WORKFLOW' : '[?] どのように引越し方位とタイミングを割り出しているのか（統合ワークフロー）'}
          </button>
        </div>

        {showHowItWorks && (
          <div className="w-full max-w-4xl animate-fade-in px-4">
            <div className="bg-zinc-950 border border-zinc-800 p-4 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4 text-justify text-zinc-300 text-xs sm:text-sm font-sans leading-relaxed">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
              <h2 className="text-emerald-500 font-bold uppercase tracking-widest border-b border-zinc-800 pb-2 mb-2 font-mono text-[11px] sm:text-xs flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                引越し・移住の「空間」と「時間」を統合する4つのステップ
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <strong className="text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 text-[10px] sm:text-[11px] font-mono">STEP 1: ゼロポイント（現在地）と波長の特定</strong>
                  <p className="text-[10px] sm:text-xs">
                    「Profile」タブにて、あなたの生年月日と現在の拠点（緯度・経度）を入力します。生年月日からはあなたのベースとなる「本命星（固有周波数帯）」と、行動がエラーを起こしやすい「天中殺（VOID TIME）」が算出されます。現在地はすべての方位を割り出すための「原点（ゼロポイント）」となります。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 text-[10px] sm:text-[11px] font-mono">STEP 2: 干渉ノイズの排除（長・中・短期の合成）</strong>
                  <p className="text-[10px] sm:text-xs">
                    「Destination」タブにおいて、現在地から見た全方位の空間ベクトルを評価します。このダッシュボードでは、東洋暦（年盤・月盤・日盤）の3つのレイヤーを同時に重ね合わせ（Phase Interference Diagnosis）、五黄殺（致命的な環境ノイズ）や本命殺（あなたとの波長不一致）が1つでも含まれる方向をレッドゾーン（進入非推奨）として除外します。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 text-[10px] sm:text-[11px] font-mono">STEP 3: 相生（共鳴）する目的地・方位の決定</strong>
                  <p className="text-[10px] sm:text-xs">
                    ノイズの無いブルーゾーン（SAFE）の中から、さらに引越し先の空間周波数（九星）とあなたの本命星が「木火土金水」の陰陽五行理論で「相生（エネルギーを生み出す）」または「相比（同調する）」関係にある方向（OPTIMAL）を導き出し、目的地を確定させます。
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <strong className="text-zinc-200 bg-zinc-900 px-2 py-1 border border-zinc-800 text-[10px] sm:text-[11px] font-mono">STEP 4: 最終出発日時の確定（真太陽時と吉門）</strong>
                  <p className="text-[10px] sm:text-xs">
                    「Timing」タブでタイムラインを展開します。目的地が決まったら、今度は「その方位がOPTIMALになる日」を探します。そしてその日のリストの中から、「天中殺（VOID）」の時間帯を避け、かつ「八門（生・休・開）」のフィルターがオンになっている2時間を「家を出発する・契約印を押す」ためのゴールデンタイムとして確定します。
                  </p>
                </div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-900/50 p-3 mt-2 text-[10px] sm:text-[11px]">
                <strong className="text-emerald-400 font-bold mb-1 block">なぜこの統合計算が必要なのか？</strong>
                引越しなどの長距離・長期間の空間移動は、新しい土地の地球磁場とあなたの生体磁気が順応（シンクロ）するまでに膨大な自律神経のエネルギー（ANS Load）を消費します。空間（ノイズのない方位）と時間（天中殺ではない時間）を天文学的に一致させることで、この順応コストを最小限に抑え、新しい環境でのパフォーマンスを最大化することが本システムの目的です。
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-4xl flex items-center justify-center p-1 bg-zinc-900/30 border border-zinc-800/50 rounded-full md:backdrop-blur-sm sticky top-4 z-40 flex-wrap sm:flex-nowrap gap-1">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "profile"
              ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            1. プロフィール
          </button>
          <button
            onClick={() => setActiveTab("destination")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "destination"
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            2. 目的地/健康
          </button>
          <button
            onClick={() => setActiveTab("timing")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "timing"
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            3. タイミング
          </button>
          <button
            onClick={() => setActiveTab("consult")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "consult"
              ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            4. AI相談
          </button>
          <button
            onClick={() => setActiveTab("scorecard")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "scorecard"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            5. 総合スコア
          </button>
        </div>

        {/* --- TAB CONTENT: 1. PROFILE --- */}
        {activeTab === "profile" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in max-w-4xl">
            {/* Action Intent Selector */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col shadow-lg z-10 shrink-0">
              <label className="text-[10px] text-zinc-500 uppercase font-mono tracking-widest mb-2 flex items-center gap-1">
                <span className="text-emerald-500">◆</span> Action Intent <span className="text-[8px] text-zinc-600">/ 移住・移動の目的</span>
              </label>
              <select
                value={actionIntent}
                onChange={(e) => setActionIntent(e.target.value as ActionIntent)}
                className="w-full bg-black/50 border border-zinc-700 text-sm text-zinc-300 rounded px-3 py-2 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="DEFAULT">Normal Ops (日常の行動・短期旅行)</option>
                <option value="REST">Rest & Recovery (休養・療養を目的とした移動)</option>
                <option value="BUSINESS">Business / Attack (交渉・ビジネスを目的とした移動)</option>
                <option value="MIGRATION">Relocation (引越し・長期移住・拠点の変更)</option>
              </select>
              <p className="text-[9px] text-zinc-500 mt-3 leading-relaxed">
                「引越し」や「療養」など、目的に応じて最適な方位（磁場ベクトル）の吉凶判定アルゴリズムが自動的に切り替わります。
              </p>
            </div>

            {/* Hardware Init & Anchor Config */}
            <PersonalProfileConfig
              birthDate={birthDate}
              setBirthDate={setBirthDate}
              birthLat={birthLat}
              setBirthLat={setBirthLat}
              birthLon={birthLon}
              setBirthLon={setBirthLon}
              baseLat={lat}
              setBaseLat={setLat}
              baseLon={lon}
              setBaseLon={setLon}
              onSave={handleSaveConfig}
              isSaving={isSaving}
              onLoad={() => handleLoadConfig(false)}
              onGetGPS={handleGetGPS}
              voidZodiacOverride={voidZodiacOverride}
              setVoidZodiacOverride={setVoidZodiacOverride}
              geminiKey={geminiKey}
              setGeminiKey={setGeminiKey}
              baselineHrvMean={baselineHrvMean}
              setBaselineHrvMean={setBaselineHrvMean}
              baselineHrvStd={baselineHrvStd}
              setBaselineHrvStd={setBaselineHrvStd}
              baselineGsrMean={baselineGsrMean}
              setBaselineGsrMean={setBaselineGsrMean}
              baseSyncTimestamp={baseSyncTimestamp}
              setBaseSyncTimestamp={setBaseSyncTimestamp}
              usePsychologyScorer={usePsychologyScorer}
              setUsePsychologyScorer={setUsePsychologyScorer}
              useKigakuScorer={useKigakuScorer}
              setUseKigakuScorer={setUseKigakuScorer}
              useAstrologyScorer={useAstrologyScorer}
              setUseAstrologyScorer={setUseAstrologyScorer}
              derivedHonmeiStar={honmeiStar}
              derivedPersonalVoid={personalVoidZodiac}
            />
            <TenchusatsuVisualizer birthDateStr={birthDate} />
          </div>
        )}

        {/* --- TAB CONTENT: 2. DESTINATION --- */}
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8">
            {/* BioMagnetic Dashboard (Load Prediction) */}
            <div className="w-full max-w-4xl">
              <BioMagneticDashboard
                kpIndex={spaceWeather?.kpIndex || null}
                xrayFlux={spaceWeather?.xrayFlux || null}
                magneticF={geoData?.intensity || null}
                magneticD={geoData?.declination || null}
                magneticI={geoData?.inclination || null}
                eot={solarData.equationOfTime}
                hrv={hrv}
                setHrv={setHrv}
                gsr={gsr}
                setGsr={setGsr}
                baseSyncDays={baseSyncDays}
                setBaseSyncDays={setBaseSyncDays}
                ansLoad={ansLoad}
                shieldCapacity={shieldCapacity}
                timingDetails={timingOptimization?.details}
                timingRecommendation={timingOptimization?.recommendationText}
              />
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: 3. TIMING --- */}
        {activeTab === "timing" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
            {/* Temporal HUD (Main Clock Focus) */}
            <ClockDisplay
              kimon={kimon}
              isVoidTime={isPersonalVoid}
              solarTime={solarData.solarTime}
              eot={solarData.equationOfTime}
              longOffset={solarData.longitudeCorrection}
              targetDate={evalDate}
            />

            {/* Module 3: Temporal Filter Matrix */}
            <SolarTimeTable
              date={evalDate}
              longitude={lon || 135.7681}
              latitude={lat}
              eot={solarData.equationOfTime}
              kpIndex={spaceWeather?.kpIndex || null}
              xrayFlux={spaceWeather?.xrayFlux || null}
              ansLoad={ansLoad}
              shieldCapacity={shieldCapacity}
              vectors={activeVectors || null}
              honmeiStar={honmeiStar}
              envData={env}
              personalVoidZodiac={personalVoidZodiac}
              useClassical={useClassicalBoard}
            />
          </div>
        )}

        {/* --- TAB CONTENT: 4. CONSULT (AI & Telemetry) --- */}
        {activeTab === "consult" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">

            <div className="w-full max-w-4xl">
              <ExpertCouncilPanel
                actionIntent={actionIntent}
                targetDate={baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : null}
                honmeiStar={(useClassicalBoard ? honmeiStar?.classical : honmeiStar?.physical) || null}
                environmentalFrequencies={env}
                birthFrequencies={birthEnv}
                finalVectors={layers?.finalVectors || {}}
                doyouState={layers?.doyouState}
                isPersonalVoid={isPersonalVoid}
                isYearVoid={isYearVoid}
                isMonthVoid={isMonthVoid}
                isDayVoid={isDayVoid}
                kpIndex={spaceWeather?.kpIndex || null}
                xrayFlux={spaceWeather?.xrayFlux || null}
                magneticF={geoData?.intensity || null}
                magneticD={geoData?.declination || null}
                magneticI={geoData?.inclination || null}
                hrv={hrv}
                gsr={gsr}
                ansLoad={ansLoad}
                shieldCapacity={shieldCapacity}
                timingDetails={timingOptimization?.details}
                timingRecommendation={timingOptimization?.recommendationText}
                targetLat={targetLat}
                targetLon={targetLon}
                targetDirection={getTargetDirectionInfo()?.magneticDirection}
                aiPromptText={getAiAssistantTextSummary()}
                onCopyPrompt={handleCopyAiPrompt}
                copiedPrompt={copiedPrompt}
                onDownloadJson={handleDownloadDestinationJson}
              />
            </div>

            <div className="mt-8 flex flex-col gap-4 border-b border-zinc-900 pb-4 w-full max-w-4xl">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-purple-400">
                  Ephemeris Engine Diagnostics
                </h2>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

                {/* Birth Imprint Data (Hardware Init) */}
                <div className="border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col gap-4 relative overflow-hidden group">
                  {/* Decorative background element */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                  <div className="flex flex-col gap-1 border-b border-zinc-800 pb-2">
                    <div className="text-[11px] text-zinc-300 font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className="text-purple-500">▶</span> 初期設定 <span className="text-zinc-500 font-normal">(出生ベクトル / Birth Vector)</span>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-sans leading-tight">
                      生年月日から算出されたあなた固有のベース波長（初期設定）
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 z-10">
                    <div className="bg-black/60 border border-purple-900/30 p-3 flex flex-col w-full rounded-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Honmei Star</span>
                        <span className="text-[8px] text-purple-400 bg-purple-500/10 px-1 border border-purple-500/20">BASE FREQUENCY</span>
                      </div>
                      <div className="flex items-end gap-3 mt-1">
                        <div className="flex flex-col">
                          <span className="text-2xl font-bold font-mono text-emerald-400 leading-none">{honmeiStar?.physical}</span>
                          <span className="text-[9px] text-zinc-400 mt-1">Physical (物理/天文学)</span>
                        </div>
                        <div className="w-px h-8 bg-zinc-800"></div>
                        <div className="flex flex-col">
                          <span className="text-xl font-bold font-mono text-zinc-500 leading-none">{honmeiStar?.classical}</span>
                          <span className="text-[9px] text-zinc-500 mt-1">Class (古典暦)</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-black/40 border border-zinc-800/80 p-2 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Year</span>
                        <div className="flex items-baseline gap-1 font-mono">
                          <span className="text-lg text-purple-400 font-bold">{birthEnv?.yearStar}</span>
                          <span className="text-[10px] text-zinc-600">/</span>
                          <span className="text-sm text-zinc-500">{birthEnv?.classicalYearStar}</span>
                        </div>
                        <span className="text-[8px] text-zinc-500 mt-1">Phys / Class</span>
                      </div>
                      <div className="bg-black/40 border border-zinc-800/80 p-2 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Month</span>
                        <span className="text-lg font-mono text-amber-400 font-bold">{birthEnv?.monthStar || '--'}</span>
                        <span className="text-[8px] text-zinc-500 mt-1">Physical</span>
                      </div>
                      <div className="bg-black/40 border border-zinc-800/80 p-2 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Day</span>
                        <span className="text-lg font-mono text-blue-400 font-bold">{birthEnv?.dayStar || '--'}</span>
                        <span className="text-[8px] text-zinc-500 mt-1">Physical</span>
                      </div>
                    </div>
                  </div>

                  {/* Raw Birth Orbital Parameters */}
                  {birthEnv?.raw && (
                    <div className="mt-auto pt-3 border-t border-zinc-900">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span>Orbital Parameters</span>
                        <div className="h-px bg-zinc-800 grow"></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-zinc-950 border border-purple-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            JUPITER <span className="text-[8px] text-purple-500 border border-purple-500/30 px-0.5">Y</span>
                          </span>
                          <span className="text-sm font-mono text-purple-300 mt-1">{birthEnv.raw.jupiterLon.toFixed(2)}°</span>
                        </div>
                        <div className="bg-zinc-950 border border-amber-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            LUNAR <span className="text-[8px] text-amber-500 border border-amber-500/30 px-0.5">M</span>
                          </span>
                          <span className="text-sm font-mono text-amber-300 mt-1">{birthEnv.raw.moonLon.toFixed(2)}°</span>
                        </div>
                        <div className="bg-zinc-950 border border-blue-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            SOLAR <span className="text-[8px] text-blue-500 border border-blue-500/30 px-0.5">D</span>
                          </span>
                          <span className="text-sm font-mono text-blue-300 mt-1">{birthEnv.raw.sunLon.toFixed(2)}°</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Current Environment Data */}
                <div className="border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col gap-4 relative overflow-hidden group">
                  {/* Decorative background element */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                  <div className="flex flex-col gap-1 border-b border-zinc-800 pb-2">
                    <div className="text-[11px] text-zinc-300 font-bold uppercase tracking-widest flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500">▶</span> リアルタイム環境計測
                      </div>
                      <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-sm px-2 py-0.5">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span className="text-[8px] text-emerald-400 font-mono tracking-widest">TRACKING</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-sans leading-tight">
                      現在この空間を飛び交っている環境波長・リアルタイム天体座標
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 z-10">
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <div className="bg-black/60 border border-zinc-800/80 p-3 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Current Year</span>
                        <div className="flex items-baseline gap-1 font-mono">
                          <span className="text-2xl text-purple-400 font-bold leading-none">{env?.yearStar}</span>
                          <span className="text-[10px] text-zinc-600">/</span>
                          <span className="text-base text-zinc-500 leading-none">{env?.classicalYearStar}</span>
                        </div>
                        <span className="text-[8px] text-zinc-500 mt-2">Phys / Class</span>
                      </div>
                      <div className="bg-black/60 border border-zinc-800/80 p-3 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Current Month</span>
                        <span className="text-2xl font-mono text-amber-400 font-bold leading-none">{env?.monthStar || '--'}</span>
                        <span className="text-[8px] text-zinc-500 mt-2">Physical</span>
                      </div>
                      <div className="bg-black/60 border border-zinc-800/80 p-3 flex flex-col rounded-sm">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-widest mb-1">Current Day</span>
                        <span className="text-2xl font-mono text-blue-400 font-bold leading-none">{env?.dayStar || '--'}</span>
                        <span className="text-[8px] text-zinc-500 mt-2">Physical</span>
                      </div>
                    </div>
                  </div>

                  {/* Raw Current Orbital Parameters */}
                  {env?.raw && (
                    <div className="mt-auto pt-3 border-t border-zinc-900">
                      <div className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span>リアルタイム天体軌道マトリクス</span>
                        <div className="h-px bg-zinc-800 grow"></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-zinc-950 border border-purple-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            JUPITER <span className="text-[8px] text-purple-500 border border-purple-500/30 px-0.5 animate-pulse">Y</span>
                          </span>
                          <span className="text-sm font-mono text-purple-300 mt-1">{env.raw.jupiterLon.toFixed(2)}°</span>
                        </div>
                        <div className="bg-zinc-950 border border-amber-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            LUNAR <span className="text-[8px] text-amber-500 border border-amber-500/30 px-0.5 animate-pulse">M</span>
                          </span>
                          <span className="text-sm font-mono text-amber-300 mt-1">{env.raw.moonLon.toFixed(2)}°</span>
                        </div>
                        <div className="bg-zinc-950 border border-blue-900/40 p-2 flex flex-col rounded-sm">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                            SOLAR <span className="text-[8px] text-blue-500 border border-blue-500/30 px-0.5 animate-pulse">D</span>
                          </span>
                          <span className="text-sm font-mono text-blue-300 mt-1">{env.raw.sunLon.toFixed(2)}°</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <details className="mt-4 mb-4 border border-zinc-800 bg-zinc-950/50 group">
                <summary className="p-3 text-[10px] text-zinc-500 font-mono uppercase tracking-widest cursor-pointer hover:bg-zinc-900/50 flex items-center justify-between list-none">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-500 animate-pulse">◆</span> [ DECRYPT MATRICES ] 生体空間マトリクスの展開
                  </div>
                  <span className="group-open:rotate-180 transition-transform">▼</span>
                </summary>

                <div className="p-3 border-t border-zinc-800 bg-black/50">
                  <div className="mb-4 p-2 bg-zinc-950/80 border border-zinc-800 text-[9px] sm:text-[10px] text-zinc-400 font-mono leading-relaxed">
                    <strong>[ 進入可能方位とノイズの解読法則 ]</strong><br />
                    気学の理論と引力モデルに基づき、盤面と本命星を重ね合わせます。<br />
                    <span className="text-red-400 font-bold">赤色(NOISE)</span> のマスはその空間ベクトルに凶殺的ベクトル（五黄殺・暗剣殺・本命殺・的殺など）が発生していることを示し、進入が非推奨です。<br />
                    <span className="text-yellow-400 font-bold">黄色(WARNING)</span> は天中殺や月交点といった「構造的なバグ・特異点」です。極端に不安定になるため長時間の留まりは非推奨です。<br />
                    <span className="text-emerald-400 font-bold">緑色(OPTIMAL)</span> は生体波長と完全にシンクロし能力が増幅されるゾーン、<span className="text-blue-400 font-bold">青(SAFE)</span> は異常干渉のない安定ゾーンです。<br />
                    <em>※FINALマップでは、以下の年・月・日のいずれかのレイヤーで赤・黄色があると優先してブロック（警告色）が表示されます。<br />
                      ※緑(OPTIMAL)は、全レイヤーがクリアでかつ目的とあなたの波長が完全一致した場合のみ出現します（条件が厳しいため表示されないことも多々あります）。</em>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Physical Model Section */}
                    <div className={`transition-all duration-300 ${!useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                      <div className={`text-emerald-400 font-bold text-[10px] tracking-widest uppercase border-b border-zinc-800 pb-1 flex items-center gap-2 ${!useClassicalBoard ? 'drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`}>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        PHYSICAL MODEL (天体位相・物理基準)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono text-zinc-300">
                        <div className="bg-black/50 border border-purple-900/30 p-2">
                          <div className="text-purple-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>物理年盤</span>
                            <span className="text-[7px] text-zinc-500">YEAR LAYER</span>
                          </div>
                          {physicalYearBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', physicalYearBoard.SE, physicalLayers?.yearLayer?.SE)}
                              {renderMatrixCell('S', physicalYearBoard.S, physicalLayers?.yearLayer?.S)}
                              {renderMatrixCell('SW', physicalYearBoard.SW, physicalLayers?.yearLayer?.SW)}
                              {renderMatrixCell('E', physicalYearBoard.E, physicalLayers?.yearLayer?.E)}
                              {renderMatrixCell('C', physicalYearBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', physicalYearBoard.W, physicalLayers?.yearLayer?.W)}
                              {renderMatrixCell('NE', physicalYearBoard.NE, physicalLayers?.yearLayer?.NE)}
                              {renderMatrixCell('N', physicalYearBoard.N, physicalLayers?.yearLayer?.N)}
                              {renderMatrixCell('NW', physicalYearBoard.NW, physicalLayers?.yearLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">太陽黄経(立春起点)に基づく真の物理的位相。</div>
                        </div>

                        <div className="bg-black/50 border border-amber-900/30 p-2">
                          <div className="text-amber-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>物理月盤</span>
                            <span className="text-[7px] text-zinc-500">MONTH LAYER</span>
                          </div>
                          {physicalMonthBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', physicalMonthBoard.SE, physicalLayers?.monthLayer?.SE)}
                              {renderMatrixCell('S', physicalMonthBoard.S, physicalLayers?.monthLayer?.S)}
                              {renderMatrixCell('SW', physicalMonthBoard.SW, physicalLayers?.monthLayer?.SW)}
                              {renderMatrixCell('E', physicalMonthBoard.E, physicalLayers?.monthLayer?.E)}
                              {renderMatrixCell('C', physicalMonthBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', physicalMonthBoard.W, physicalLayers?.monthLayer?.W)}
                              {renderMatrixCell('NE', physicalMonthBoard.NE, physicalLayers?.monthLayer?.NE)}
                              {renderMatrixCell('N', physicalMonthBoard.N, physicalLayers?.monthLayer?.N)}
                              {renderMatrixCell('NW', physicalMonthBoard.NW, physicalLayers?.monthLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">太陽と月の相対位相（月相）モデル。</div>
                        </div>

                        <div className="bg-black/50 border border-blue-900/30 p-2">
                          <div className="text-blue-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>物理日盤</span>
                            <span className="text-[7px] text-zinc-500">DAY LAYER</span>
                          </div>
                          {physicalDayBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', physicalDayBoard.SE, physicalLayers?.dayLayer?.SE)}
                              {renderMatrixCell('S', physicalDayBoard.S, physicalLayers?.dayLayer?.S)}
                              {renderMatrixCell('SW', physicalDayBoard.SW, physicalLayers?.dayLayer?.SW)}
                              {renderMatrixCell('E', physicalDayBoard.E, physicalLayers?.dayLayer?.E)}
                              {renderMatrixCell('C', physicalDayBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', physicalDayBoard.W, physicalLayers?.dayLayer?.W)}
                              {renderMatrixCell('NE', physicalDayBoard.NE, physicalLayers?.dayLayer?.NE)}
                              {renderMatrixCell('N', physicalDayBoard.N, physicalLayers?.dayLayer?.N)}
                              {renderMatrixCell('NW', physicalDayBoard.NW, physicalLayers?.dayLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">地球の自転(JD)と至点による物理反転モデル。</div>
                        </div>
                      </div>
                    </div>

                    {/* Classical Model Section */}
                    <div className={`transition-all duration-300 mt-4 ${useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                      <div className={`text-zinc-300 font-bold text-[10px] tracking-widest uppercase border-b border-zinc-800 pb-1 flex items-center gap-2 ${useClassicalBoard ? 'drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]' : ''}`}>
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse"></span>
                        CLASSICAL MODEL (節切り・暦基準)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono text-zinc-300 mt-2">
                        <div className="bg-zinc-900/20 border border-zinc-800 p-2">
                          <div className="font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>古典年盤</span>
                            <span className="text-[7px]">CLASSICAL YEAR</span>
                          </div>
                          {classicalYearBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', classicalYearBoard.SE, classicalLayers?.yearLayer?.SE)}
                              {renderMatrixCell('S', classicalYearBoard.S, classicalLayers?.yearLayer?.S)}
                              {renderMatrixCell('SW', classicalYearBoard.SW, classicalLayers?.yearLayer?.SW)}
                              {renderMatrixCell('E', classicalYearBoard.E, classicalLayers?.yearLayer?.E)}
                              {renderMatrixCell('C', classicalYearBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', classicalYearBoard.W, classicalLayers?.yearLayer?.W)}
                              {renderMatrixCell('NE', classicalYearBoard.NE, classicalLayers?.yearLayer?.NE)}
                              {renderMatrixCell('N', classicalYearBoard.N, classicalLayers?.yearLayer?.N)}
                              {renderMatrixCell('NW', classicalYearBoard.NW, classicalLayers?.yearLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">一般的な書籍・暦に基づく盤面。</div>
                        </div>

                        <div className="bg-zinc-900/20 border border-zinc-800 p-2">
                          <div className="font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>古典月盤</span>
                            <span className="text-[7px]">CLASSICAL MONTH</span>
                          </div>
                          {classicalMonthBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', classicalMonthBoard.SE, classicalLayers?.monthLayer?.SE)}
                              {renderMatrixCell('S', classicalMonthBoard.S, classicalLayers?.monthLayer?.S)}
                              {renderMatrixCell('SW', classicalMonthBoard.SW, classicalLayers?.monthLayer?.SW)}
                              {renderMatrixCell('E', classicalMonthBoard.E, classicalLayers?.monthLayer?.E)}
                              {renderMatrixCell('C', classicalMonthBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', classicalMonthBoard.W, classicalLayers?.monthLayer?.W)}
                              {renderMatrixCell('NE', classicalMonthBoard.NE, classicalLayers?.monthLayer?.NE)}
                              {renderMatrixCell('N', classicalMonthBoard.N, classicalLayers?.monthLayer?.N)}
                              {renderMatrixCell('NW', classicalMonthBoard.NW, classicalLayers?.monthLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">節気ごとのカレンダー切り替え。</div>
                        </div>

                        <div className="bg-zinc-900/20 border border-zinc-800 p-2">
                          <div className="font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                            <span>古典日盤</span>
                            <span className="text-[7px]">CLASSICAL DAY</span>
                          </div>
                          {classicalDayBoard && (
                            <div className="grid grid-cols-3 gap-0.5 sm:gap-1 text-center mt-2">
                              {renderMatrixCell('SE', classicalDayBoard.SE, classicalLayers?.dayLayer?.SE)}
                              {renderMatrixCell('S', classicalDayBoard.S, classicalLayers?.dayLayer?.S)}
                              {renderMatrixCell('SW', classicalDayBoard.SW, classicalLayers?.dayLayer?.SW)}
                              {renderMatrixCell('E', classicalDayBoard.E, classicalLayers?.dayLayer?.E)}
                              {renderMatrixCell('C', classicalDayBoard.CENTER, undefined, true)}
                              {renderMatrixCell('W', classicalDayBoard.W, classicalLayers?.dayLayer?.W)}
                              {renderMatrixCell('NE', classicalDayBoard.NE, classicalLayers?.dayLayer?.NE)}
                              {renderMatrixCell('N', classicalDayBoard.N, classicalLayers?.dayLayer?.N)}
                              {renderMatrixCell('NW', classicalDayBoard.NW, classicalLayers?.dayLayer?.NW)}
                            </div>
                          )}
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">精密日家九星・隠遁陽遁サイクル。</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              {/* Final Vector Calculation Visualization */}
              {env && layers && (
                <div className="mt-4 bg-black/50 border border-zinc-800 p-3 w-full">
                  <div className="text-emerald-500 font-bold mb-1 border-b border-zinc-800 pb-1 text-[10px] tracking-widest uppercase flex items-center gap-2">
                    <span>干渉波・位相干渉診断</span>
                    <span className="text-zinc-500 text-[8px]">( 優先度: 🟥 物理干渉 &gt; 🟪 生体干渉 &gt; 🟨 バグ警告 &gt; 🟩 波長共鳴 &gt; 🟦 無干渉(青) )</span>
                  </div>
                  <div className="text-[8px] text-zinc-500 mb-2 leading-relaxed text-justify pr-2 font-sans">
                    <strong className="text-zinc-400">判定ロジック:</strong> 長期波・中期波・短期波の各算術ベクトルを重ね合わせ最終結果を導出します。いずれか1つのレイヤーでも致死的な物理アーティファクト（赤）や生体コンフリクト（紫）が含まれている場合、他が同期ベクトル（緑）であっても最終結果は干渉（NOISE）に強制上書きされます。（細胞へのダメージ蓄積を防ぐフェイルセーフ）
                  </div>
                  <div className="overflow-visible w-full mt-4 flex flex-col gap-6">
                    {/* Physical Model Table */}
                    <div className={`transition-all duration-300 ${!useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                      <div className={`text-emerald-400 font-bold text-[10px] tracking-widest uppercase border-b border-zinc-800 pb-1 mb-2 flex items-center gap-2 ${!useClassicalBoard ? 'drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`}>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        PHYSICAL MODEL (天体位相・物理基準)
                      </div>
                      <table className="w-full text-left font-mono">
                        <thead className="border-b border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider">
                          <tr>
                            <th className="pb-2 pr-2 font-normal align-bottom">Dir</th>
                            <th className="pb-2 px-1 font-normal align-bottom">Year Layer<br /><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【長期的影響】</span></th>
                            <th className="pb-2 px-1 font-normal align-bottom">Month Layer<br /><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【中期的影響】</span></th>
                            <th className="pb-2 px-1 font-normal align-bottom">Day Layer<br /><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【短期的影響】</span></th>
                            <th className="pb-2 pl-2 font-bold text-zinc-300 align-bottom">Final Vector</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50 text-[10px]">
                          {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(dir => {
                            const y = physicalLayers?.yearLayer[dir] || 'SAFE';
                            const m = physicalLayers?.monthLayer[dir] || 'SAFE';
                            const d = physicalLayers?.dayLayer[dir] || 'SAFE';
                            const final = physicalLayers?.finalVectors[dir] || 'SAFE';

                            return (
                              <tr key={dir} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 pr-2 text-zinc-400 font-bold align-middle">{dir}</td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={y} board={physicalYearBoard} layerType="year" dir={dir} isClassical={false} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={m} board={physicalMonthBoard} layerType="month" dir={dir} isClassical={false} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={d} board={physicalDayBoard} layerType="day" dir={dir} isClassical={false} /></td>
                                <td className="py-2.5 pl-2 align-middle bg-zinc-950/50"><TooltipCell status={final} board={null} isFinal={true} layerType="final" dir={dir} isClassical={false} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Classical Model Table */}
                    <div className={`transition-all duration-300 ${useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                      <div className={`text-zinc-300 font-bold text-[10px] tracking-widest uppercase border-b border-zinc-800 pb-1 mb-2 flex items-center gap-2 ${useClassicalBoard ? 'drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]' : ''}`}>
                        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse"></span>
                        CLASSICAL MODEL (節切り・暦基準)
                      </div>
                      <table className="w-full text-left font-mono">
                        <thead className="border-b border-zinc-800 text-zinc-600 text-[9px] uppercase tracking-wider">
                          <tr>
                            <th className="pb-2 pr-2 font-normal align-bottom">Dir</th>
                            <th className="pb-2 px-1 font-normal align-bottom">Year Layer<br /><span className="text-[7px] text-zinc-700 font-sans normal-case leading-tight block mt-1">【長期的影響】</span></th>
                            <th className="pb-2 px-1 font-normal align-bottom">Month Layer<br /><span className="text-[7px] text-zinc-700 font-sans normal-case leading-tight block mt-1">【中期的影響】</span></th>
                            <th className="pb-2 px-1 font-normal align-bottom">Day Layer<br /><span className="text-[7px] text-zinc-700 font-sans normal-case leading-tight block mt-1">【短期的影響】</span></th>
                            <th className="pb-2 pl-2 font-bold text-zinc-500 align-bottom">Final Vector</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50 text-[10px]">
                          {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(dir => {
                            const y = classicalLayers?.yearLayer[dir] || 'SAFE';
                            const m = classicalLayers?.monthLayer[dir] || 'SAFE';
                            const d = classicalLayers?.dayLayer[dir] || 'SAFE';
                            const final = classicalLayers?.finalVectors[dir] || 'SAFE';

                            return (
                              <tr key={dir} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 pr-2 text-zinc-500 font-bold align-middle">{dir}</td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={y} board={classicalYearBoard} layerType="year" dir={dir} isClassical={true} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={m} board={classicalMonthBoard} layerType="month" dir={dir} isClassical={true} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={d} board={classicalDayBoard} layerType="day" dir={dir} isClassical={true} /></td>
                                <td className="py-2.5 pl-2 align-middle bg-zinc-900/20"><TooltipCell status={final} board={null} isFinal={true} layerType="final" dir={dir} isClassical={true} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Theory & Model Explanation */}
              <div className="mt-4 bg-zinc-900/30 border border-zinc-800 p-3 w-full">
                <div className="flex items-center justify-between mb-2 border-b border-zinc-800 pb-2">
                  <div className="text-blue-400 font-bold text-[10px] tracking-widest uppercase flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full md:animate-pulse"></span>
                    天体物理コアロジック (理論と数理モデル)
                  </div>
                  <button
                    onClick={() => setShowAstrophysicalLogic(!showAstrophysicalLogic)}
                    className="text-[9px] font-mono text-zinc-400 hover:text-white bg-zinc-950 px-2 py-1 border border-zinc-700 hover:border-zinc-500 transition-colors uppercase tracking-widest"
                  >
                    {showAstrophysicalLogic ? '[-] CLOSE TERMINAL' : '[+] EXAMINE LOGIC'}
                  </button>
                </div>

                {showAstrophysicalLogic && (
                  <div className="animate-fade-in border-l-2 border-blue-500 pl-3 mt-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-purple-400 font-bold border-l-2 border-purple-500 pl-2 bg-purple-950/20 py-0.5">YEAR: JUPITER RESONANCE</span>
                        <p className="text-[8px] text-zinc-500 leading-relaxed">
                          木星の公転周期（約11.86年）を12分割し、地球への影響を1-9の周波数に変換します。木星が物理的に黄極を移動した瞬間に盤面が切り替わります。陽黄経による位相反転（陽遁・陰遁）を適用。
                        </p>
                        <div className="bg-black/80 p-2 border border-zinc-800 font-mono text-[8px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                          <InlineMath math={`S_y = 11 - ((\\lfloor L_j / 30 \\rfloor + 8) \\pmod 9)`} />
                          <div className="mt-1 text-zinc-600 border-t border-zinc-800 pt-1">
                            <InlineMath math={`L_j = ${env?.raw?.jupiterLon?.toFixed(2)}^\\circ`} /> (Jupiter Lon)
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-amber-400 font-bold border-l-2 border-amber-500 pl-2 bg-amber-950/20 py-0.5">MONTH: TIDAL INTERFERENCE</span>
                        <p className="text-[8px] text-zinc-500 leading-relaxed">
                          太陽黄経と月相の相対位相差から算出。潮汐変動が生体に与えるノイズを抽出します。
                        </p>
                        <div className="bg-black/80 p-2 border border-zinc-800 font-mono text-[8px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                          <InlineMath math={`S_m = 9 - ((T_s \\times 12 + T_l) \\pmod 9)`} />
                          <div className="mt-1 text-zinc-600 border-t border-zinc-800 pt-1">
                            <InlineMath math={`\\Delta L = ${(((env?.raw?.moonLon ?? 0) - (env?.raw?.sunLon ?? 0) + 360) % 360).toFixed(2)}^\\circ`} /> (Phase)
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-blue-400 font-bold border-l-2 border-blue-500 pl-2 bg-blue-950/20 py-0.5">DAY: ROTATIONAL FLUX</span>
                        <p className="text-[8px] text-zinc-500 leading-relaxed">
                          地球の自転(JD)をベースに、至点（Solstice）での位相反転を厳密に定義します。夏至・冬至の「物理的な至点」で厳密に数理モデルが反転し、エネルギーの増幅/減衰を表現します。
                        </p>
                        <div className="bg-black/80 p-2 border border-zinc-800 font-mono text-[8px] shadow-inner overflow-x-auto whitespace-nowrap custom-scrollbar">
                          <InlineMath math={`S_d = \\begin{cases} 9 - (JD \\% 9) & (\\text{陰遁}) \\\\ (JD \\% 9) + 1 & (\\text{陽遁}) \\end{cases}`} />
                          <div className="mt-1 text-zinc-600 border-t border-zinc-800 pt-1 italic">JD: Julian Day Baseline</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-zinc-800/50 flex flex-col gap-1">
                      <div className="text-[8px] text-zinc-600 italic">
                        ※ 本エンジンは「占い」ではなく、天体位置から導き出される物理的ポテンシャルを計算しています。
                        古典暦（Classical）との乖離は、天体運動の歳差や摂動を考慮した「物理的リアリティ」の差です。
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* --- TAB CONTENT: 5. SCORECARD --- */}
        {activeTab === "scorecard" && (
          <div className="w-full flex flex-col items-center space-y-6 animate-fade-in max-w-4xl">
            {/* Control Panel Header */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              <div>
                <h2 className="text-emerald-500 font-mono text-base tracking-[0.1em] font-bold mb-1 uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  5. 総合スコア / 8方位統合評価マトリクス
                </h2>
                <p className="text-zinc-400 text-[10px] sm:text-xs leading-relaxed max-w-xl">
                  直近30日の時空波動予測、各方位における富裕エリア所得、および不動産賃貸アービトラージの偏差値指標を統合した意思決定コックピットです。
                </p>
                <div className="mt-2 text-zinc-500 text-[9px] leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
                  <span><strong className="text-emerald-400">🌟 トリプル大吉:</strong> 3つの計算モデル（古典/物理独立/伝統連動）すべてで吉方位となる最も安全な方位。</span>
                  <span><strong className="text-amber-500">⚠️ 位相差警告:</strong> 計算モデル間で吉凶判定が分かれる（一方は吉、他方は凶など）ため、注意が必要な方位。</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {/* Prefecture Filter */}
                <div className="flex items-center gap-1.5 bg-zinc-950 px-2 py-1.5 rounded-md border border-zinc-800">
                  <span className="text-zinc-400 font-mono text-[9px] uppercase tracking-wider">対象県:</span>
                  <select
                    value={scorecardPrefecture}
                    onChange={(e) => setScorecardPrefecture(e.target.value)}
                    className="bg-zinc-900 text-zinc-200 border-0 text-[10px] font-mono focus:outline-none focus:ring-0 cursor-pointer"
                  >
                    <option value="all">全国 (すべて)</option>
                    <option value="愛知県">愛知県</option>
                    <option value="東京都">東京都</option>
                    <option value="大阪府">大阪府</option>
                    <option value="神奈川県">神奈川県</option>
                    <option value="埼玉県">埼玉県</option>
                    <option value="千葉県">千葉県</option>
                    <option value="京都府">京都府</option>
                    <option value="兵庫県">兵庫県</option>
                    <option value="福岡県">福岡県</option>
                  </select>
                </div>

                {/* Visibility Toggle */}
                <button
                  onClick={() => setShowNoiseDirections(!showNoiseDirections)}
                  className={`px-3 py-1.5 text-[9px] font-mono rounded-md border transition-all flex items-center gap-1.5 ${
                    showNoiseDirections
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      : 'bg-emerald-950/20 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {showNoiseDirections ? '☐ NOISE方位を表示中' : '☑ NOISE方位を非表示'}
                </button>

                {/* Gemini Export Button */}
                <button
                  onClick={handleExportForGemini}
                  disabled={isExporting}
                  className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-[9px] uppercase tracking-widest rounded-md transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      エクスポート中...
                    </>
                  ) : (
                    <>
                      <span>EXPORT FOR GEMINI</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {scorecardLoading ? (
              <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <span className="text-[10px] font-mono text-zinc-500 tracking-[0.2em] uppercase">Loading Relocation Scenarios...</span>
              </div>
            ) : (
              <div className="w-full overflow-hidden bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50 text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                        <th className="p-3 w-24">方位 (Sector)</th>
                        <th className="p-3 w-32">古典暦基準 (Classical)</th>
                        <th className="p-3 w-32">物理独立型 (Phys Indep)</th>
                        <th className="p-3 w-32">伝統連動型 (Phys Coupled)</th>
                        <th className="p-3 w-36 text-center">合意判定 (Consensus)</th>
                        <th className="p-3 w-24 text-center">30日吉日数</th>
                        <th className="p-3">推奨富裕エリア (最高所得)</th>
                        <th className="p-3">推奨物件 (最大アービトラージ)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-xs">
                      {scorecardSummary
                        .filter(item => showNoiseDirections || !item.isNoise)
                        .map((item, idx) => {
                          const statusColor = (s: string) => {
                            if (s === 'OPTIMAL') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                            if (s === 'OPTIMAL_REGULAR') return 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20';
                            if (s === 'SAFE') return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
                            if (s === 'WARNING') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
                            if (s.startsWith('NOISE_VOID')) return 'text-zinc-500 bg-zinc-800 border-zinc-700';
                            if (s.startsWith('NOISE_NODE')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
                            return 'text-red-400 bg-red-500/10 border-red-500/30';
                          };

                          return (
                            <tr
                              key={item.direction}
                              onClick={() => setSelectedDirection(item.direction)}
                              className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                            >
                              {/* Direction */}
                              <td className="p-3 font-mono font-bold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap">
                                <span className="text-[10px] text-zinc-500">▶</span>
                                {item.labelJa} ({item.direction})
                              </td>

                              {/* Classical Model */}
                              <td className="p-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-mono font-bold border uppercase tracking-wider ${statusColor(item.classicalStatus)}`}>
                                    {item.classicalStatus.replace('NOISE_', '')}
                                  </span>
                                  <span className={`font-mono font-bold text-[10px] ${
                                    item.classicalScore >= 80 ? 'text-emerald-400' :
                                    item.classicalScore >= 50 ? 'text-blue-400' :
                                    item.classicalScore >= 30 ? 'text-yellow-500' : 'text-red-500'
                                  }`}>
                                    {item.classicalScore}
                                  </span>
                                </div>
                              </td>

                              {/* Physical Independent Model */}
                              <td className="p-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-mono font-bold border uppercase tracking-wider ${statusColor(item.physicalIndepStatus)}`}>
                                    {item.physicalIndepStatus.replace('NOISE_', '')}
                                  </span>
                                  <span className={`font-mono font-bold text-[10px] ${
                                    item.physicalIndepScore >= 80 ? 'text-emerald-400' :
                                    item.physicalIndepScore >= 50 ? 'text-blue-400' :
                                    item.physicalIndepScore >= 30 ? 'text-yellow-500' : 'text-red-500'
                                  }`}>
                                    {item.physicalIndepScore}
                                  </span>
                                </div>
                              </td>

                              {/* Physical Coupled Model */}
                              <td className="p-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-mono font-bold border uppercase tracking-wider ${statusColor(item.physicalCoupledStatus)}`}>
                                    {item.physicalCoupledStatus.replace('NOISE_', '')}
                                  </span>
                                  <span className={`font-mono font-bold text-[10px] ${
                                    item.physicalCoupledScore >= 80 ? 'text-emerald-400' :
                                    item.physicalCoupledScore >= 50 ? 'text-blue-400' :
                                    item.physicalCoupledScore >= 30 ? 'text-yellow-500' : 'text-red-500'
                                  }`}>
                                    {item.physicalCoupledScore}
                                  </span>
                                </div>
                              </td>

                              {/* Consensus / Highlights */}
                              <td className="p-3 whitespace-nowrap text-center">
                                {item.isConsensusClear && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                                    トリプル大吉 🌟
                                  </span>
                                )}
                                {item.isDivergenceAlert && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold bg-amber-950/60 text-amber-500 border border-amber-500/30">
                                    位相差警告 ⚠️
                                  </span>
                                )}
                                {!item.isConsensusClear && !item.isDivergenceAlert && (
                                  <span className="text-zinc-600 text-[10px] font-mono">-</span>
                                )}
                              </td>

                              {/* Lucky Days */}
                              <td className="p-3 text-center font-mono">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                                  item.luckyDays >= 20 ? 'bg-emerald-950/40 text-emerald-400 font-bold' :
                                  item.luckyDays >= 10 ? 'bg-blue-950/20 text-blue-400' : 'bg-zinc-900 text-zinc-500'
                                }`}>
                                  {item.luckyDays} / 30日
                                </span>
                              </td>

                              {/* Recommended Wealth Area */}
                              <td className="p-3">
                                {item.topArea ? (
                                  <div className="flex flex-col">
                                    <span className="text-zinc-200 font-bold group-hover:text-emerald-400 transition-colors">
                                      {item.topArea.areaName}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                      平均所得: {item.topArea.incomePerCapita ? `${(item.topArea.incomePerCapita / 10000).toFixed(1)}万円` : `${(item.topArea.taxableIncomeThousandYen / 1000).toFixed(0)}万円`}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-zinc-600 text-[10px] italic">データなし</span>
                                )}
                              </td>

                              {/* Recommended Property */}
                              <td className="p-3">
                                {item.topRental ? (
                                  <div className="flex flex-col">
                                    <span className="text-zinc-200 font-bold group-hover:text-emerald-400 transition-colors truncate max-w-[200px]">
                                      {item.topRental.property_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                      賃料: {(item.topRental.totalRent / 10000).toFixed(1)}万円 | 差益: {item.topRental.arbitrageScore?.toFixed(1)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-zinc-600 text-[10px] italic">対象物件なし</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* --- MULTI-MODEL GRID SCORECARD (大量パターンスコア表) --- */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6 shadow-lg space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-zinc-200 font-mono text-sm tracking-[0.1em] font-bold mb-1 uppercase flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    多次元吉凶パターンマトリクス (Grid Scorecard)
                  </h3>
                  <p className="text-zinc-500 text-[10px] sm:text-xs">
                    本命星別、または日付別の全方位吉凶パターンを網羅した詳細グリッド表です。
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Grid Selector Toggles */}
                  <div className="flex bg-zinc-950 p-1 rounded-md border border-zinc-800 text-[10px] font-mono">
                    <button
                      onClick={() => setScorecardActiveGridTab('dates')}
                      className={`px-3 py-1 rounded transition-all ${
                        scorecardActiveGridTab === 'dates' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      30日カレンダー
                    </button>
                    <button
                      onClick={() => setScorecardActiveGridTab('stars')}
                      className={`px-3 py-1 rounded transition-all ${
                        scorecardActiveGridTab === 'stars' ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      九星本命星別 (当日)
                    </button>
                  </div>

                  {/* Model Selector */}
                  <select
                    value={gridModelView}
                    onChange={(e: any) => setGridModelView(e.target.value)}
                    className="bg-zinc-950 text-zinc-300 border border-zinc-800 rounded-md px-2 py-1 text-[10px] font-mono focus:outline-none cursor-pointer"
                  >
                    <option value="consensus">合意判定 (Consensus)</option>
                    <option value="classical">古典暦モデル (Classical)</option>
                    <option value="physicalIndep">物理独立モデル (Phys Indep)</option>
                    <option value="physicalCoupled">伝統連動モデル (Phys Coupled)</option>
                  </select>

                  {/* CSV Export Button */}
                  <button
                    onClick={handleExportGridCsv}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-mono text-[9px] uppercase tracking-wider rounded transition-all"
                  >
                    EXPORT PATTERN CSV
                  </button>
                </div>
              </div>

              {/* Legend for Grid */}
              <div className="flex flex-wrap gap-3 text-[9px] font-mono text-zinc-500 bg-zinc-950/40 p-2.5 rounded border border-zinc-800/40">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-950/60 border border-emerald-500/30"></span>大吉/吉 ({"≥ 80"})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-950/20 border border-blue-500/20"></span>吉 ({"≥ 50"})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-950/20 border border-amber-500/20"></span>警告 ({"≥ 30"})</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-950/20 border border-red-500/20"></span>大凶 (その他)</span>
                {gridModelView === 'consensus' && (
                  <>
                    <span className="text-emerald-400">🌟 = トリプル大吉</span>
                    <span className="text-amber-500">⚠️ = 位相差警告</span>
                  </>
                )}
              </div>

              {/* Grid Table */}
              <div className="w-full overflow-hidden bg-zinc-950 border border-zinc-850 rounded-lg shadow-inner">
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-900/40 text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                        <th className="p-2.5 text-left w-28">{scorecardActiveGridTab === 'dates' ? '日付' : '本命星'}</th>
                        {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map(dir => {
                          const dirLabels: Record<string, string> = { N:'北', NE:'北東', E:'東', SE:'南東', S:'南', SW:'南西', W:'西', NW:'北西' };
                          return (
                            <th key={dir} className="p-2.5 w-20">
                              {dirLabels[dir]} ({dir})
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/50 text-[10px] font-mono">
                      {scorecardActiveGridTab === 'dates' ? (
                        scorecard30DaysForecastAllModels?.map(day => {
                          const wdayJa = ['日', '月', '火', '水', '木', '金', '土'][day.weekday];
                          const wdayColor = day.weekday === 0 ? 'text-red-400' : day.weekday === 6 ? 'text-blue-400' : 'text-zinc-400';
                          return (
                            <tr key={day.dateStr} className="hover:bg-zinc-900/20 transition-colors">
                              <td className="p-2 text-left text-[9px] text-zinc-400 border-r border-zinc-900 whitespace-nowrap">
                                {day.dateStr} <span className={wdayColor}>({wdayJa})</span>
                              </td>
                              {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((dir: Direction) => {
                                const classData = day.models.classical[dir];
                                const indepData = day.models.physicalIndep[dir];
                                const coupledData = day.models.physicalCoupled[dir];
                                
                                const isClassHigh = !classData.status.startsWith('NOISE');
                                const isIndepHigh = !indepData.status.startsWith('NOISE');
                                const isCoupledHigh = !coupledData.status.startsWith('NOISE');
                                const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
                                const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
                                const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
                                const isDivergenceAlert = hasHigh && hasLow;

                                let activeScore = 50;
                                let activeStatus = 'SAFE';

                                if (gridModelView === 'classical') {
                                  activeScore = classData.score;
                                  activeStatus = classData.status;
                                } else if (gridModelView === 'physicalIndep') {
                                  activeScore = indepData.score;
                                  activeStatus = indepData.status;
                                } else if (gridModelView === 'physicalCoupled') {
                                  activeScore = coupledData.score;
                                  activeStatus = coupledData.status;
                                } else {
                                  activeScore = Math.round((classData.score + indepData.score + coupledData.score) / 3);
                                  activeStatus = isConsensusClear ? 'OPTIMAL' : isDivergenceAlert ? 'WARNING' : 'SAFE';
                                }

                                const cellClass = getCellBgColor(activeScore, activeStatus, gridModelView === 'consensus' && isConsensusClear, gridModelView === 'consensus' && isDivergenceAlert);

                                return (
                                  <td key={dir} className={`p-2 font-bold transition-all ${cellClass}`}>
                                    <div className="flex items-center justify-center gap-0.5">
                                      {gridModelView === 'consensus' && isConsensusClear && <span>🌟</span>}
                                      {gridModelView === 'consensus' && isDivergenceAlert && <span>⚠️</span>}
                                      <span>{activeScore}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      ) : (
                        scorecardHonmeiStarsForecast?.map(star => {
                          const isUserStar = honmeiStar && (
                            (useClassicalBoard && star.star === honmeiStar.classical) ||
                            (!useClassicalBoard && star.star === honmeiStar.physical)
                          );
                          return (
                            <tr key={star.star} className={`hover:bg-zinc-900/20 transition-colors ${isUserStar ? 'bg-emerald-950/10 border-y border-emerald-500/20' : ''}`}>
                              <td className="p-2 text-left text-[9px] text-zinc-300 font-bold border-r border-zinc-900 whitespace-nowrap flex items-center gap-1.5">
                                {isUserStar && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>}
                                {star.label}
                              </td>
                              {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((dir: Direction) => {
                                const classData = star.models.classical[dir];
                                const indepData = star.models.physicalIndep[dir];
                                const coupledData = star.models.physicalCoupled[dir];
                                
                                const isClassHigh = !classData.status.startsWith('NOISE');
                                const isIndepHigh = !indepData.status.startsWith('NOISE');
                                const isCoupledHigh = !coupledData.status.startsWith('NOISE');
                                const isConsensusClear = isClassHigh && isIndepHigh && isCoupledHigh;
                                const hasHigh = isClassHigh || isIndepHigh || isCoupledHigh;
                                const hasLow = !isClassHigh || !isIndepHigh || !isCoupledHigh;
                                const isDivergenceAlert = hasHigh && hasLow;

                                let activeScore = 50;
                                let activeStatus = 'SAFE';

                                if (gridModelView === 'classical') {
                                  activeScore = classData.score;
                                  activeStatus = classData.status;
                                } else if (gridModelView === 'physicalIndep') {
                                  activeScore = indepData.score;
                                  activeStatus = indepData.status;
                                } else if (gridModelView === 'physicalCoupled') {
                                  activeScore = coupledData.score;
                                  activeStatus = coupledData.status;
                                } else {
                                  activeScore = Math.round((classData.score + indepData.score + coupledData.score) / 3);
                                  activeStatus = isConsensusClear ? 'OPTIMAL' : isDivergenceAlert ? 'WARNING' : 'SAFE';
                                }

                                const cellClass = getCellBgColor(activeScore, activeStatus, gridModelView === 'consensus' && isConsensusClear, gridModelView === 'consensus' && isDivergenceAlert);

                                return (
                                  <td key={dir} className={`p-2 font-bold transition-all ${cellClass}`}>
                                    <div className="flex items-center justify-center gap-0.5">
                                      {gridModelView === 'consensus' && isConsensusClear && <span>🌟</span>}
                                      {gridModelView === 'consensus' && isDivergenceAlert && <span>⚠️</span>}
                                      <span>{activeScore}</span>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- DETAIL SIDE-DRAWER --- */}
        {selectedDirection && (() => {
          const detail = scorecardSummary.find(d => d.direction === selectedDirection);
          if (!detail) return null;

          const statusColor = (s: string) => {
            if (s === 'OPTIMAL') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
            if (s === 'OPTIMAL_REGULAR') return 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20';
            if (s === 'SAFE') return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
            if (s === 'WARNING') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
            if (s.startsWith('NOISE_VOID')) return 'text-zinc-500 bg-zinc-800 border-zinc-700';
            if (s.startsWith('NOISE_NODE')) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
            return 'text-red-400 bg-red-500/10 border-red-500/30';
          };

          return (
            <div className="fixed inset-0 z-50 overflow-hidden font-sans">
              {/* Backdrop */}
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                onClick={() => setSelectedDirection(null)}
              ></div>

              {/* Drawer Container */}
              <div className="absolute inset-y-0 right-0 max-w-full flex">
                <div className="w-screen max-w-lg bg-zinc-950 border-l border-zinc-800 shadow-2xl relative flex flex-col">
                  {/* Close button */}
                  <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold font-mono">▶</span>
                      <h3 className="text-sm font-bold text-zinc-200">
                        【方位詳細】 {detail.labelJa} ({detail.direction})
                      </h3>
                    </div>
                    <button 
                      onClick={() => setSelectedDirection(null)}
                      className="text-zinc-400 hover:text-white transition-colors p-1"
                    >
                      ✕ 閉じる
                    </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* Unified Ten-Chi-Jin Evaluation Block */}
                    {(() => {
                      const dateStr = baseTime ? baseTime.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
                      const dirAngles: Record<string, number> = {
                        N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
                      };
                      const angle = dirAngles[selectedDirection] || 0;
                      const rad = (angle * Math.PI) / 180;
                      const stepObj = {
                        fromName: "現在地",
                        fromLat: lat || 35.0116,
                        fromLon: lon || 135.7681,
                        toName: `${detail.labelJa}方面`,
                        toLat: (lat || 35.0116) + Math.cos(rad) * 0.9,
                        toLon: (lon || 135.7681) + Math.sin(rad) * 0.9,
                        departureDate: dateStr,
                        purpose: 'MIGRATION' as const,
                        notes: '当日詳細判定',
                        evaluation: {
                          status: detail.status,
                          rating: detail.score >= 80 ? '大吉' : detail.score >= 50 ? '吉' : detail.score >= 20 ? '凶' : '大凶',
                          color: '',
                          score: detail.score,
                          details: {
                            yearLayer: '',
                            monthLayer: '',
                            dayLayer: ''
                          }
                        }
                      };

                      const qVal = nbaData?.nba.actionResult.expectedReward ?? 0;
                      const simulatedAns = nbaData?.micro.ansLoad ?? 20;
                      const simulatedShield = nbaData?.micro.shieldCapacity ?? 80;

                      const nbaEvaluationsMap = {
                        [dateStr]: {
                          date: dateStr,
                          qValue: qVal,
                          suggestedAction: nbaData?.nba.actionResult.suggestedAction || 'WAIT',
                          riskFactors: nbaData?.macro.streams?.westernAstrology?.aspects || []
                        }
                      };

                      return (
                        <TenChiJinEvaluation
                          mode="step"
                          steps={[stepObj]}
                          singleStepIndex={0}
                          nbaEvaluations={nbaEvaluationsMap}
                          simulatedAns={simulatedAns}
                          simulatedShield={simulatedShield}
                          birthDate={birthDate}
                          onApplyAction={() => {
                            window.location.href = `/relocation/simulator?date=${dateStr}&direction=${selectedDirection}`;
                          }}
                        />
                      );
                    })()}

                    {/* Status & Score Block */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Astrological Wave</span>
                        <span className={`inline-flex items-center self-start px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold border uppercase tracking-wider ${statusColor(detail.status)}`}>
                          {detail.status}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Score</span>
                        <span className={`text-2xl font-mono font-bold ${
                          detail.score >= 80 ? 'text-emerald-400' :
                          detail.score >= 50 ? 'text-blue-400' :
                          detail.score >= 30 ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                          {detail.score}
                        </span>
                      </div>
                    </div>

                    {/* 30-Day Forecast Calendar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span>📅 直近30日の時空吉凶シミュレーション</span>
                        </h4>
                        <span className="text-[9px] text-zinc-500 font-mono">吉日数: {detail.luckyDays}日</span>
                      </div>
                      
                      <div className="grid grid-cols-6 gap-1 bg-black/40 p-2 border border-zinc-900 rounded-md">
                        {detail.dates.map((d, i) => {
                          let bg = 'bg-zinc-900/50 border-zinc-800 text-zinc-500';
                          if (d.status === 'OPTIMAL') bg = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
                          else if (d.status === 'OPTIMAL_REGULAR') bg = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
                          else if (d.status === 'SAFE') bg = 'bg-blue-500/10 border-blue-500/30 text-blue-400';
                          else if (d.status === 'WARNING') bg = 'bg-orange-500/10 border-orange-500/30 text-orange-400';
                          else if (d.status.startsWith('NOISE')) bg = 'bg-red-500/10 border-red-500/30 text-red-400';

                          const dateParts = d.dateStr.split('-');
                          const mDay = dateParts[2];
                          const mMonth = dateParts[1];

                          return (
                            <div 
                              key={i} 
                              className={`border p-1 text-center rounded flex flex-col items-center justify-center transition-all ${bg}`}
                              title={`${d.dateStr}: ${d.status}`}
                            >
                              <span className="text-[7px] opacity-70 font-mono">{mMonth}/{mDay}</span>
                              <span className="text-[9px] font-bold font-mono">{d.score}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top 5 Wealth Municipalities */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                        <span>🏢 富裕度市区町村 TOP 5</span>
                      </h4>
                      {detail.topAreas.length > 0 ? (
                        <div className="space-y-2">
                          {detail.topAreas.map((area, idx) => (
                            <div 
                              key={area.id} 
                              className="bg-black/30 border border-zinc-900 rounded p-2.5 flex items-center justify-between text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-zinc-600">#{idx + 1}</span>
                                <div className="flex flex-col">
                                  <span className="text-zinc-200 font-bold">{area.areaName}</span>
                                  <span className="text-[9px] text-zinc-500 font-mono mt-0.5">コード: {area.areaCode}</span>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end">
                                <span className="text-zinc-300 font-mono font-bold">
                                  {area.incomePerCapita ? `${(area.incomePerCapita / 10000).toFixed(1)}万円` : `${(area.taxableIncomeThousandYen / 1000).toFixed(0)}万円`}
                                </span>
                                <span className="text-[9px] text-zinc-500 font-sans mt-0.5">一人当たり平均所得</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">該当するエリアがありません。</p>
                      )}
                    </div>

                    {/* Top 5 Rentals */}
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-800 pb-1.5">
                        <span>🏠 推奨賃貸物件 (アービトラージ) TOP 5</span>
                      </h4>
                      {detail.topRentals.length > 0 ? (
                        <div className="space-y-2">
                          {detail.topRentals.map((rental, idx) => (
                            <div 
                              key={rental.id} 
                              className="bg-black/30 border border-zinc-900 rounded p-2.5 flex flex-col gap-1.5 text-xs"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-[10px] font-mono text-zinc-600 mt-0.5">#{idx + 1}</span>
                                  <div className="flex flex-col">
                                    <span className="text-zinc-200 font-bold truncate max-w-[280px]" title={rental.property_name}>
                                      {rental.property_name}
                                    </span>
                                    <span className="text-[9px] text-zinc-500 font-mono">
                                      距離: {rental.distanceKm?.toFixed(1)}km | 広さ: {rental.size_sqm}㎡ | 築年数: {rental.age_years}年
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  差益: {rental.arbitrageScore?.toFixed(1)}
                                </span>
                              </div>

                              <div className="flex justify-between items-center border-t border-zinc-900/50 pt-1.5 text-[10px] text-zinc-400">
                                <span>賃料+管理費: <strong className="text-zinc-300 font-bold font-mono">{(rental.totalRent / 10000).toFixed(1)}万円</strong></span>
                                <span className={`px-1 py-0.5 rounded text-[8px] font-mono border ${statusColor(rental.astrologyStatus)}`}>
                                  {rental.astrologyStatus}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic">該当する物件情報がありません。</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* --- MAP CONTENT (Appended to DESTINATION tab) --- */}
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8 mt-8">
            <div className="w-full max-w-4xl mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {/* Spatial Targeting */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-2">
                  <span className="text-emerald-500 animate-pulse">▶</span>
                  <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest">Spatial Targeting <span className="text-[9px] text-zinc-500 font-normal ml-1">/ 空間・目的の捕捉</span></h3>
                </div>
                <p className="text-[10px] text-zinc-500 mb-4 h-8 mt-1">
                  目的地の方位に潜むノイズと、あなたの行動目的（戦闘か回復か）を照合・評価します。
                </p>
                <div className="flex flex-col gap-3 mt-auto">
                  <div className="flex justify-between items-center bg-black/40 p-2 border border-zinc-800/80 rounded-sm">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Action Intent</label>
                      <span className="text-[8px] text-zinc-600">行動の性質により吉凶の計算結果が変わります</span>
                    </div>
                    <select
                      value={actionIntent}
                      onChange={(e) => setActionIntent(e.target.value as ActionIntent)}
                      className="bg-transparent text-emerald-400 font-bold text-[10px] outline-none cursor-pointer text-right"
                    >
                      <option value="DEFAULT">DEFAULT (通常行動)</option>
                      <option value="REST">REST (回復・静養)</option>
                      <option value="BUSINESS">BUSINESS (事業・拡張)</option>
                      <option value="MIGRATION">MIGRATION (引越し・長期滞在)</option>
                    </select>
                  </div>

                  <div className="flex justify-between items-center bg-black/40 p-2 border border-zinc-800/80 rounded-sm mt-1">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Target Date</label>
                      <span className="text-[8px] text-zinc-600">評価する目標日を指定します</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAutoSearch}
                        disabled={isAutoSearching}
                        className="text-[9px] text-emerald-400 border border-emerald-500/50 bg-emerald-950/20 px-2 py-1 rounded-sm hover:bg-emerald-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                      >
                        {isAutoSearching ? '検索中...' : '自動検索'}
                      </button>
                      <input
                        type="date"
                        value={`${evalDate.getFullYear()}-${String(evalDate.getMonth() + 1).padStart(2, '0')}-${String(evalDate.getDate()).padStart(2, '0')}`}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const selectedDate = new Date(e.target.value);
                          const base = baseTime || new Date();
                          selectedDate.setHours(12, 0, 0, 0);
                          const baseCopy = new Date(base.getTime());
                          baseCopy.setHours(12, 0, 0, 0);
                          const diffDays = Math.round((selectedDate.getTime() - baseCopy.getTime()) / 86400000);
                          setTimeOffsetDays(diffDays);
                        }}
                        className="bg-transparent text-emerald-400 font-bold text-[10px] outline-none cursor-pointer text-right [color-scheme:dark]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-1 gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-black/40 p-0.5 border border-zinc-800/80 rounded-sm">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${isPlaying ? 'bg-amber-950/40 text-amber-400 border-amber-500/50 hover:bg-amber-900/60 shadow-[0_0_8px_rgba(245,158,11,0.2)]' : 'bg-blue-950/40 text-blue-400 border-blue-500/50 hover:bg-blue-900/60 shadow-[0_0_8px_rgba(59,130,246,0.2)]'}`}
                      >
                        {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
                      </button>
                      <select
                        value={playSpeedDays}
                        onChange={(e) => setPlaySpeedDays(Number(e.target.value))}
                        disabled={isPlaying}
                        className="bg-transparent text-zinc-400 text-[8px] font-mono outline-none cursor-pointer"
                      >
                        <option value={1}>1D/tick</option>
                        <option value={7}>1W/tick</option>
                        <option value={30}>1M/tick</option>
                        <option value={365}>1Y/tick</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-1 flex-wrap items-center">
                      <button onClick={() => setTimeOffsetDays(prev => prev - 1)} className="text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400" title="Previous Day">◀</button>
                      <button onClick={() => setTimeOffsetDays(prev => prev + 1)} className="text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400" title="Next Day">▶</button>
                      <div className="w-px h-3 bg-zinc-800 my-auto mx-0.5"></div>
                      <button onClick={() => setTimeOffsetDays(0)} className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 0 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400'}`}>TODAY</button>
                      <button onClick={() => setTimeOffsetDays(30)} className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 30 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400'}`}>+30D</button>
                      <button onClick={() => setTimeOffsetDays(90)} className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 90 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400'}`}>+90D</button>
                      <button onClick={() => setTimeOffsetDays(180)} className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 180 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400'}`}>+180D</button>
                      <button onClick={() => setTimeOffsetDays(365)} className={`text-[8px] font-mono px-2 py-0.5 rounded-sm transition-colors border ${timeOffsetDays === 365 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-emerald-500/30 hover:text-emerald-400'}`}>+1Y</button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 bg-black/40 p-2 border border-zinc-800/80 rounded-sm mt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                        目的地座標 <span className="text-[9px] text-zinc-600">緯度/経度</span>
                      </label>
                      <button
                        onClick={() => setShowMapPicker(!showMapPicker)}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showMapPicker ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
                      >
                        [ 地図検索 ]
                      </button>
                    </div>

                    {showMapPicker && (
                      <div className="w-full h-48 sm:h-64 mt-1 mb-1 animate-fade-in z-20">
                        <LocationPickerInner
                          initialLat={targetLat || lat}
                          initialLon={targetLon || lon}
                          onSelect={(newLat: number, newLon: number) => {
                            setTargetLat(Number(newLat.toFixed(5)));
                            setTargetLon(Number(newLon.toFixed(5)));
                          }}
                        />
                      </div>
                    )}

                    <div className="w-full relative z-10 flex gap-1 mb-1">
                      <input
                        type="text"
                        placeholder="座標またはGoogleマップのURLを貼り付け... (例: 35.68, 139.76)"
                        className="flex-1 bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-xs px-2 py-1.5 rounded-sm outline-none transition-colors"
                        onChange={(e) => {
                          const val = e.target.value;
                          // Google Mapsの "@lat,lon" と、コピーした単なる "lat,lon" の両方に対応
                          const match = val.match(/(?:@|^|\s)(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
                          if (match) {
                            setTargetLat(Number(parseFloat(match[1]).toFixed(5)));
                            setTargetLon(Number(parseFloat(match[2]).toFixed(5)));
                            e.target.value = ''; // clear upon success
                          }
                        }}
                      />
                    </div>

                    <div className="flex gap-2 relative z-10 mt-1">
                      <input
                        type="number"
                        placeholder="緯度"
                        value={targetLat ?? ""}
                        onChange={e => setTargetLat(e.target.value ? Number(e.target.value) : null)}
                        className="bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                      <input
                        type="number"
                        placeholder="経度"
                        value={targetLon ?? ""}
                        onChange={e => setTargetLon(e.target.value ? Number(e.target.value) : null)}
                        className="bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                      <input
                        type="number"
                        placeholder="標高(m)"
                        value={targetElevation ?? ""}
                        onChange={e => setTargetElevation(e.target.value ? Number(e.target.value) : null)}
                        className="bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                    </div>
                    {targetLat !== null && targetLon !== null && (
                      <div className="flex gap-2 relative z-10 mt-1">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${targetLat},${targetLon}`);
                            alert("座標をコピーしました: " + `${targetLat},${targetLon}`);
                          }}
                          className="flex-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-sm transition-colors"
                        >
                          📋 座標をコピー
                        </button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-blue-900/30 text-blue-400 hover:bg-blue-800/50 border border-blue-800/50 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-sm transition-colors text-center block"
                        >
                          🗺️ Googleマップで開く
                        </a>
                      </div>
                    )}                    {targetDirInfo && targetVectorStatus && (
                      <div className={`mt-1 text-[10px] font-mono p-1 border rounded-sm flex items-center justify-between gap-2 ${targetVectorStatus.startsWith('NOISE_VOID')
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-600 repeating-linear-gradient-45'
                        : targetVectorStatus.startsWith('NOISE_NODE')
                          ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                          : targetVectorStatus.startsWith('NOISE')
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : targetVectorStatus === 'OPTIMAL' || targetVectorStatus === 'OPTIMAL_REGULAR'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold border px-1 ${useTrueNorth ? 'text-emerald-400 border-emerald-500/50' : 'text-zinc-500 border-zinc-700/50'}`} title="真北基準">真北: {targetDirInfo.trueDirection}</span>
                          <span className={`font-bold border px-1 ${!useTrueNorth ? 'text-emerald-400 border-emerald-500/50' : 'text-zinc-500 border-zinc-700/50'}`} title="磁北基準">磁北: {targetDirInfo.magneticDirection}</span>
                          <span>{targetVectorStatus}</span>
                          {targetDirInfo.trueDirection !== targetDirInfo.magneticDirection && (
                            <span 
                              className="text-[9px] text-amber-500 border border-amber-500/30 px-1 py-0.5 rounded bg-amber-500/5 animate-pulse cursor-help font-bold font-mono"
                              title="【境界線偏角アラート】真北と磁北で判定する方位セクターが異なっています。基準北トグルの切り替えにより方位評価が変化します。"
                            >
                              ⚠️偏角ズレ
                            </span>
                          )}
                        </div>
                        <span className="text-[8px] opacity-70">TARGET EVAL</span>
                      </div>
                    )}


                  </div>
                </div>
              </div>

              {/* COMMANDER'S BRIEFING HUD (Moved up to side-by-side with targeting) */}
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-lg relative overflow-hidden h-full flex flex-col">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                  <div className="flex items-center gap-2 mb-1 border-b border-zinc-800 pb-2">
                    <span className="text-zinc-500 animate-pulse">◆</span>
                    <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest">ゾーン分類 <span className="text-[9px] text-zinc-500 font-normal ml-1">/ 空間分類</span></h3>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-2 bg-black/50 p-2.5 rounded-sm border border-zinc-800/50 shadow-inner">
                    <div className="text-[9px] text-zinc-500 font-mono flex justify-between items-center border-b border-zinc-800/50 pb-1">
                      <span>BASE GEO (基準地)</span>
                      <span className="text-zinc-300 font-bold">{lat?.toFixed(4)}N, {lon?.toFixed(4)}E</span>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono flex justify-between items-center border-b border-zinc-800/50 pb-1">
                      <span>TARGET DATE (目標日)</span>
                      <span className="text-emerald-400 font-bold">{evalDate.toLocaleDateString()} <span className="text-zinc-600 font-normal ml-1">({timeOffsetDays > 0 ? `+${timeOffsetDays}` : timeOffsetDays}d)</span></span>
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono flex justify-between items-center">
                      <span>SUBJECT (対象波長)</span>
                      <span className="text-purple-400 font-bold">{honmeiStar ? `本命星 ${useClassicalBoard ? honmeiStar.classical : honmeiStar.physical}` : 'Unset'} <span className="text-zinc-600 font-normal ml-1">({birthDate.split('T')[0]})</span></span>
                    </div>
                  </div>
                  <div className="flex-1 mt-2 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
                    {(() => {
                      const renderZone = (fv: any, title: string, subtitle: string, badgeColor: string) => {
                        if (!fv) return null;
                        const allDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
                        const map: Record<string, string> = { N: '北', NE: '北東', E: '東', SE: '南東', S: '南', SW: '南西', W: '西', NW: '北西' };

                        return (
                          <div className="flex flex-col gap-2">
                            <div className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 ${badgeColor}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                              {title} <span className="text-[8px] opacity-70 font-normal">{subtitle}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {allDirs.map(dir => {
                                const val = fv[dir];
                                let bgClass = 'bg-blue-950/20 border-blue-500/30 text-blue-400';
                                let statusLabel = 'SAFE';

                                if (val === 'OPTIMAL') {
                                  bgClass = 'bg-emerald-950/40 border-emerald-500 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
                                  statusLabel = 'GO';
                                } else if (val === 'OPTIMAL_REGULAR') {
                                  bgClass = 'bg-emerald-900/10 border-emerald-600/30 text-emerald-400/80';
                                  statusLabel = 'OK';
                                } else if (val === 'WARNING') {
                                  bgClass = 'bg-orange-950/30 border-orange-500/40 text-orange-400';
                                  statusLabel = 'WARN';
                                } else if ((val || '').startsWith('NOISE')) {
                                  bgClass = 'bg-red-950/15 border-red-900/30 text-red-400/60';
                                  statusLabel = 'ALERT';
                                }

                                const isTarget = targetDirInfo && targetDirInfo.magneticDirection === dir;

                                return (
                                  <div
                                    key={dir}
                                    className={`border p-1.5 rounded flex flex-col items-center justify-center text-center transition-all duration-300 ${
                                      isTarget
                                        ? 'ring-1.5 ring-emerald-400/70 scale-[1.03] border-emerald-400 z-10 shadow-[0_0_12px_rgba(52,211,153,0.35)] font-bold'
                                        : 'hover:scale-[1.02] hover:bg-opacity-80'
                                    } ${bgClass}`}
                                  >
                                    <div className="flex items-center gap-0.5">
                                      {isTarget && <span className="text-[8px] animate-pulse">🎯</span>}
                                      <span className="text-[10px] font-bold tracking-wider">{map[dir]}</span>
                                    </div>
                                    <span className="text-[7px] font-mono opacity-80 mt-0.5 whitespace-nowrap">{statusLabel}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      };


                      return (() => {
                        let physVectors, classVectors;
                        let titleSuffix = 'FINAL LAYER (統合)';

                        if (activeLayerMode === 'year') {
                          physVectors = physicalLayers?.yearLayer;
                          classVectors = classicalLayers?.yearLayer;
                          titleSuffix = 'YEAR LAYER (年盤)';
                        } else if (activeLayerMode === 'month') {
                          physVectors = physicalLayers?.monthLayer;
                          classVectors = classicalLayers?.monthLayer;
                          titleSuffix = 'MONTH LAYER (月盤)';
                        } else if (activeLayerMode === 'day') {
                          physVectors = physicalLayers?.dayLayer;
                          classVectors = classicalLayers?.dayLayer;
                          titleSuffix = 'DAY LAYER (日盤)';
                        } else {
                          physVectors = physicalLayers?.finalVectors;
                          classVectors = classicalLayers?.finalVectors;
                        }

                        return (
                          <div className="flex flex-col gap-4">
                            <div className={`transition-all duration-300 ${!useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                              {renderZone(physVectors, `PHYSICAL - ${titleSuffix}`, '(天体位相・物理基準)', 'text-emerald-500')}
                            </div>
                            <div className="h-px bg-zinc-800/50 w-full my-1"></div>
                            <div className={`transition-all duration-300 ${useClassicalBoard ? 'opacity-100' : 'opacity-30 grayscale-[50%] blur-[0.5px] hover:opacity-100 hover:grayscale-0 hover:blur-none'}`}>
                              {renderZone(classVectors, `CLASSICAL - ${titleSuffix}`, '(節切り・暦基準)', 'text-zinc-400')}
                            </div>
                          </div>
                        );
                      })();
                    })()}
                  </div>

                  <div className="flex justify-between items-center mt-4 border-t border-zinc-800/50 pt-3">
                    <div className="text-[10px] font-mono text-zinc-500 uppercase flex items-center gap-1">
                      <span className="text-purple-500">◆</span> TREND ANALYTICS
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setHeatmapMode(prev => prev === '30days' ? 'none' : '30days')}
                        className={`text-[9px] font-mono px-2 py-1 rounded-sm transition-colors border ${heatmapMode === '30days' ? 'bg-purple-950/40 text-purple-400 border-purple-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-purple-500/30 hover:text-purple-400'}`}
                      >
                        30 DAYS
                      </button>
                      <button
                        onClick={() => setHeatmapMode(prev => prev === '12months' ? 'none' : '12months')}
                        className={`text-[9px] font-mono px-2 py-1 rounded-sm transition-colors border ${heatmapMode === '12months' ? 'bg-purple-950/40 text-purple-400 border-purple-500/50' : 'bg-zinc-900/80 text-zinc-500 border-zinc-800 hover:border-purple-500/30 hover:text-purple-400'}`}
                      >
                        12 MONTHS
                      </button>
                    </div>
                  </div>

                  {heatmapMode !== 'none' && heatmapData.length > 0 && (
                    <div className="mt-3 bg-black/50 p-2 border border-zinc-800/50 rounded-sm overflow-x-auto custom-scrollbar animate-fade-in-up">
                      <table className="w-full text-center border-collapse">
                        <thead>
                          <tr>
                            <th className="p-1 border border-zinc-800 text-[8px] font-mono text-zinc-500 w-8 bg-zinc-950 sticky left-0 z-10">DIR</th>
                            {heatmapData.map((d, i) => (
                              <th 
                                key={i} 
                                className={`p-1 border border-zinc-800 text-[7px] font-mono whitespace-nowrap cursor-pointer hover:bg-zinc-800 transition-colors ${d.isVoid ? 'text-red-500 bg-red-950/20' : 'text-zinc-500 bg-zinc-900/30'}`}
                                onClick={() => setTimeOffsetDays(d.offsetDays)}
                                title="クリックでこの日に移動"
                              >
                                {d.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(dir => (
                            <tr key={dir}>
                              <td className="p-1 border border-zinc-800 text-[8px] font-mono text-zinc-400 font-bold bg-zinc-950 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">{dir}</td>
                              {heatmapData.map((d, i) => {
                                let st = d.vectors[dir];
                                let bgClass = 'bg-zinc-900/30';
                                if (st === 'OPTIMAL') bgClass = 'bg-emerald-500/80 shadow-[0_0_5px_rgba(16,185,129,0.5)] z-0 relative';
                                else if (st === 'OPTIMAL_REGULAR') bgClass = 'bg-emerald-500/35 border border-emerald-500/50';
                                else if (st === 'SAFE') bgClass = 'bg-blue-500/20';
                                else if (st?.startsWith('NOISE_GOU') || st?.startsWith('NOISE_ANKEN') || st === 'NOISE_HA') bgClass = 'bg-red-500/80';
                                else if (st?.startsWith('NOISE_HONMEI') || st?.startsWith('NOISE_TEKI') || st?.startsWith('NOISE_GETSUMEI') || st?.startsWith('NOISE_GETSUTEKI')) bgClass = 'bg-purple-500/80';
                                else if (st?.startsWith('NOISE_VOID') || st?.startsWith('NOISE_NODE')) bgClass = 'bg-yellow-500/80';
                                else if (st === 'WARNING') bgClass = 'bg-orange-500/80';

                                return (
                                  <td 
                                    key={i} 
                                    className={`p-0 border border-zinc-800 cursor-pointer hover:opacity-80 transition-opacity ${bgClass}`} 
                                    title={`${d.label} ${dir}: ${st} (クリックで移動)`}
                                    onClick={() => setTimeOffsetDays(d.offsetDays)}
                                  >
                                    <div className="w-5 h-5 mx-auto"></div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex gap-3 mt-3 text-[7px] font-mono text-zinc-500 justify-center flex-wrap">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/80"></div> OPTIMAL</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500/20 border border-zinc-700"></div> SAFE</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/80"></div> TYPE I (Gou/Anken/Ha)</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500/80"></div> TYPE II (Bio)</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500/80"></div> VOID/NODE</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-500/80"></div> WARNING</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Module 4: Tactical Magnetic Map */}
            <div className="w-full max-w-4xl mt-0">

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 w-full gap-2">
                {/* Cyberpunk Filter Selector */}
                <div className="flex items-center gap-1.5 bg-zinc-950 p-1 border border-zinc-800 rounded-sm">
                  <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider px-1">Filter:</span>
                  <button
                    onClick={() => setDirectionFilterMode('composite')}
                    className={`px-2.5 py-1 text-[9px] font-mono rounded-xs transition-all border ${
                      directionFilterMode === 'composite'
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50 shadow-[0_0_5px_rgba(16,185,129,0.2)]'
                        : 'bg-zinc-900/50 text-zinc-400 border-transparent hover:border-zinc-700/50'
                    }`}
                  >
                    🪐 総合判定
                  </button>
                  <button
                    onClick={() => setDirectionFilterMode('personal_kigaku')}
                    className={`px-2.5 py-1 text-[9px] font-mono rounded-xs transition-all border ${
                      directionFilterMode === 'personal_kigaku'
                        ? 'bg-purple-950/40 text-purple-400 border-purple-500/50 shadow-[0_0_5px_rgba(168,85,247,0.2)]'
                        : 'bg-zinc-900/50 text-zinc-400 border-transparent hover:border-zinc-700/50'
                    }`}
                  >
                    👤 個人吉凶 (九星)
                  </button>
                  <button
                    onClick={() => setDirectionFilterMode('personal_bazi')}
                    className={`px-2.5 py-1 text-[9px] font-mono rounded-xs transition-all border ${
                      directionFilterMode === 'personal_bazi'
                        ? 'bg-yellow-950/40 text-yellow-400 border-yellow-500/50 shadow-[0_0_5px_rgba(234,179,8,0.2)]'
                        : 'bg-zinc-900/50 text-zinc-400 border-transparent hover:border-zinc-700/50'
                    }`}
                  >
                    ☯ 個人天中殺 (四柱)
                  </button>
                  <button
                    onClick={() => setDirectionFilterMode('environmental')}
                    className={`px-2.5 py-1 text-[9px] font-mono rounded-xs transition-all border ${
                      directionFilterMode === 'environmental'
                        ? 'bg-rose-950/40 text-rose-400 border-rose-500/50 shadow-[0_0_5px_rgba(244,63,94,0.2)]'
                        : 'bg-zinc-900/50 text-zinc-400 border-transparent hover:border-zinc-700/50'
                    }`}
                  >
                    🌍 環境方位のみ
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 self-stretch md:self-auto justify-end">
                  <button
                    onClick={() => setShowOnlyNewBuild(!showOnlyNewBuild)}
                    className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${showOnlyNewBuild ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30" : "bg-zinc-500/20 text-zinc-400 border-zinc-500/50 hover:bg-zinc-500/30"}`}
                  >
                    {showOnlyNewBuild ? "☑ 新築のみ表示" : "☐ 全物件表示"}
                  </button>
                  {!useClassicalBoard && (
                    <button
                      onClick={() => setPhysicalMonthMode(physicalMonthMode === 'independent' ? 'coupled' : 'independent')}
                      className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-all bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-950/60"
                      title={physicalMonthMode === 'independent' ? "物理独立型: 年盤は木星、月盤は太陽の位置から、それぞれ他方に依存せず独立して算出します。" : "伝統連動型: 木星黄経から年盤を決定し、伝統的な九星気学の規則に従って月盤を連動算出します。"}
                    >
                      Month: {physicalMonthMode === 'independent' ? "物理独立" : "伝統連動"}
                    </button>
                  )}
                  <button
                    onClick={() => setUseClassicalBoard(!useClassicalBoard)}
                    className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${useClassicalBoard ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/50 hover:bg-zinc-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30"}`}
                  >
                    Model: {useClassicalBoard ? "Classical (暦基準)" : "Physical (木星黄経基準)"}
                  </button>
                </div>
              </div>

              {/* Warning Banner */}
              {directionFilterMode !== 'composite' && (
                <div className={`mb-3 p-2 border text-[10px] font-mono leading-tight flex items-start gap-2 ${
                  directionFilterMode === 'personal_kigaku'
                    ? 'bg-purple-950/20 border-purple-500/30 text-purple-400'
                    : directionFilterMode === 'personal_bazi'
                      ? 'bg-yellow-950/20 border-yellow-500/30 text-yellow-400'
                      : 'bg-rose-950/20 border-rose-500/30 text-rose-400'
                }`}>
                  <span className="text-xs">⚠️</span>
                  <div>
                    {directionFilterMode === 'personal_kigaku' && (
                      <>
                        <span className="font-bold">【個人九星気学表示モード】</span>
                        本命星・月命星による吉凶方位のみをマッピングしています（天中殺および万人共通の環境凶殺は非表示）。実際の移動にあたっては必ず総合判定を確認してください。
                      </>
                    )}
                    {directionFilterMode === 'personal_bazi' && (
                      <>
                        <span className="font-bold">【個人天中殺表示モード】</span>
                        四柱推命の生年月日（日柱干支・年柱干支）から算出される天中殺（空亡）方位のみをマッピングしています（九星吉凶および環境凶殺は非表示）。
                      </>
                    )}
                    {directionFilterMode === 'environmental' && (
                      <>
                        <span className="font-bold">【環境方位表示モード】</span>
                        空間全体の定在波（五黄殺・暗剣殺）および「破」などの環境凶殺のみをマッピングしています。あなた自身の本命殺・的殺や、相生による吉方位は非表示になっています。実際の移動にあたっては必ず総合判定を確認してください。
                      </>
                    )}
                  </div>
                </div>
              )}
              <TacticalMagneticMap
                lat={lat || 35.0116}
                lon={lon || 135.7681}
                declination={geoData?.declination || 0}
                inclination={geoData?.inclination || 0}
                intensity={geoData?.intensity || null}
                activeModel={useClassicalBoard ? 'classical' : 'physical'}
                physicalLayers={physicalLayers}
                classicalLayers={classicalLayers}
                honmeiStar={honmeiStar}
                kpIndex={spaceWeather?.kpIndex || null}
                ansLoad={ansLoad}
                shieldCapacity={shieldCapacity}
                hudLayers={hudLayers}
                toggleLayer={(layer: 'terrain' | 'weather' | 'bio' | 'hazard') => setHudLayers(prev => ({ ...prev, [layer]: !prev[layer] }))}
                activeLayerMode={activeLayerMode}
                setActiveLayerMode={setActiveLayerMode}
                properties={showOnlyNewBuild ? mapProperties.filter((p: any) => p.is_new_build) : mapProperties}
                useTrueNorth={useTrueNorth}
                setUseTrueNorth={setUseTrueNorth}
                targetLat={targetLat}
                targetLon={targetLon}
                onSelectTarget={(newLat, newLon) => {
                  setTargetLat(Number(newLat.toFixed(5)));
                  setTargetLon(Number(newLon.toFixed(5)));
                }}
              />
            </div>

            {/* System Manual / Documentation */}
            <div className="w-full max-w-4xl mt-4">
              <details className="bg-zinc-950/80 border border-zinc-800 rounded-md p-4 group cursor-pointer">
                <summary className="text-[10px] sm:text-xs font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-2 outline-none">
                  <span className="text-emerald-500 group-open:rotate-90 transition-transform">▶</span>
                  [ SYSTEM MANUAL ] 判定基準とモデル・ゾーンの仕様
                </summary>
                <div className="mt-4 text-xs sm:text-sm text-zinc-300 font-mono leading-relaxed space-y-6 cursor-text">

                  {/* Model Differences */}
                  <div className="space-y-2">
                    <h3 className="text-emerald-400 font-bold border-b border-zinc-800 pb-1">■ 演算モデルの違い (PHYSICAL vs CLASSICAL)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="bg-zinc-900/50 p-3 border-l-2 border-emerald-500">
                        <div className="text-emerald-500 font-bold mb-1">PHYSICAL MODEL (天体位相・物理基準)</div>
                        <p className="text-zinc-400 text-[10px] sm:text-xs">
                          宇宙のリアルタイムな物理データ（NASA/Swiss Ephemeris）を使用。木星の正確な黄経や、太陽・月のリアルな重力・磁場位相からダイレクトに空間の周波数を割り出します。<br /><br />
                          <span className="text-zinc-300">推奨用途:</span> 今日の体調管理、集中力の最大化、リアルな環境干渉（自律神経への影響）の回避など。
                        </p>
                      </div>
                      <div className="bg-zinc-900/50 p-3 border-l-2 border-zinc-500">
                        <div className="text-zinc-400 font-bold mb-1">CLASSICAL MODEL (節切り・暦基準)</div>
                        <p className="text-zinc-400 text-[10px] sm:text-xs">
                          伝統的な九星気学や東洋占星術のカレンダーを使用。「立春」などの二十四節気を基準とし、過去数千年の統計データや解釈と完全に一致するルールベースのモデルです。<br /><br />
                          <span className="text-zinc-300">推奨用途:</span> 対人交渉、引っ越し、大きな契約など、社会的なタイミングやバイオリズムの周期性を読む場合。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Zone Differences */}
                  <div className="space-y-2">
                    <h3 className="text-emerald-400 font-bold border-b border-zinc-800 pb-1">■ ゾーン分類の定義 (SAFE vs OPTIMAL)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="bg-zinc-900/50 p-3 border-l-2 border-emerald-500">
                        <div className="text-emerald-500 font-bold mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                          [ GO ] 推奨方位 (OPTIMAL)
                        </div>
                        <p className="text-zinc-400 text-[10px] sm:text-xs">
                          有害なノイズ（凶殺）が一切存在しないことに加え、ユーザーの「本命星」とその方位の星が『相生（互いにエネルギーを与え合う関係）』になっています。<br /><br />
                          <span className="text-zinc-300">意味:</span> リスクがないだけでなく、行くことで「エネルギー的なバフ（運気・活力の向上）」が得られる、システムが最も推奨するベストな方位です。
                        </p>
                      </div>
                      <div className="bg-zinc-900/50 p-3 border-l-2 border-blue-500">
                        <div className="text-blue-500 font-bold mb-1 flex items-center gap-2">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          [ SAFE ] 進入可能方位
                        </div>
                        <p className="text-zinc-400 text-[10px] sm:text-xs">
                          五黄殺、暗剣殺、天中殺といったあらゆる有害なノイズが一切存在しない方位です。<br /><br />
                          <span className="text-zinc-300">意味:</span> 行ってもマイナス（ペナルティ）を受けることはありませんが、特別なボーナスも得られない「無害なニュートラルゾーン（安全地帯）」です。
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </details>
            </div>
          </div>
        )}

        {/* --- TAB CONTENT: 6. INSIGHTS (HISTORY) --- */}
        {activeTab === "history" && (
          <div className="w-full max-w-4xl flex flex-col gap-6 animate-fade-in mt-4">
            <TelemetryChart />
          </div>
        )}

      </div>
      {/* Telemetry and Audit Log */}
      <SystemTelemetryLog
        lat={lat}
        lon={lon}
        solarTime={solarData?.solarTime}
        declination={geoData?.declination || null}
        env={env}
      />

      <div className="fixed bottom-6 left-6 lg:left-72 z-50 flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSaveStateToDatabase}
          disabled={isSavingLog}
          className="px-4 py-3 bg-purple-600/90 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-purple-500 hover:scale-105 transition-all flex items-center gap-2 border border-purple-400/50 backdrop-blur-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSavingLog ? (
            <span className="animate-pulse">保存中...</span>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              データベースに保存
            </>
          )}
        </button>

        <button
          onClick={exportMasterTelemetry}
          className="px-4 py-3 bg-emerald-600/90 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-500 hover:scale-105 transition-all flex items-center gap-2 border border-emerald-400/50 backdrop-blur-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          マスター状態を出力 (CSV/JSON)
        </button>
      </div>
    </div >
  );
};
