"use client";
import TelemetryChart from "./TelemetryChart";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { calculateBioMetrics } from "../utils/bioModelingEngine";
import { fetchSpaceWeather, SpaceWeatherData } from "../utils/spaceWeather";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";

import { ClockDisplay } from "./ClockDisplay";
import { getHonmeiStar, getCurrentEnvironmentalFrequencies, generateBoard, calculateVectorCollision, getPersonalVoidZodiac, getCurrentZodiac, ActionIntent, Direction } from "../utils/ephemerisEngine";
import { createPersonalizedOptimizer, OptimizationResult } from "../utils/timing-optimizer";
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import type { NBAData } from "./nba/NBADashboard";

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

export const SolarTimeClock = () => {
  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "destination" | "timing" | "consult" | "history">("profile");

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
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingLog, setIsSavingLog] = useState(false);

  // Future Simulation & Intent State
  const [timeOffsetDays, setTimeOffsetDays] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedDays, setPlaySpeedDays] = useState(1);
  const [actionIntent, setActionIntent] = useState<ActionIntent>('DEFAULT');
  const [useClassicalBoard, setUseClassicalBoard] = useState<boolean>(true);

  const [heatmapMode, setHeatmapMode] = useState<'none' | '30days' | '12months'>('none');
  const [heatmapData, setHeatmapData] = useState<any[]>([]);


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
  const [showHowItWorks, setShowHowItWorks] = useState(false);

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
        targetDate: targetDateStr
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
  }, [ansLoad, shieldCapacity, birthDate, lon, timeOffsetDays, baseTime]);

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
        shieldCapacity
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

      const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      return {
        trueDirection: dirs[Math.floor(((trueBrng + 22.5) % 360) / 45)],
        magneticDirection: dirs[Math.floor(((magBrng + 22.5) % 360) / 45)]
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

        const cz = getCurrentZodiac(testDate);
        if (personalVoidZodiac.includes(cz.yearZodiac) || personalVoidZodiac.includes(cz.monthZodiac) || personalVoidZodiac.includes(cz.dayZodiac)) {
          offset++;
          continue;
        }

        const testEnv = getCurrentEnvironmentalFrequencies(testDate);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(testEnv.monthStar);
        const dB = generateBoard(testEnv.dayStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, dB,
          personalVoidZodiac,
          testEnv.raw.lunarNode,
          actionIntent
        );

        if (targetDirInfo) {
          const s = vectorData.finalVectors[targetDirInfo.magneticDirection];
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
    return calculateSolarTime(new Date(birthDate), birthLon);
  }, [birthDate, birthLon]);

  const env = React.useMemo(() => {
    if (!solarData?.solarTime) {
      if (!ephemerisTime) return null;
      return getCurrentEnvironmentalFrequencies(ephemerisTime);
    }
    return getCurrentEnvironmentalFrequencies(solarData.solarTime);
  }, [ephemerisTime, solarData]);

  const birthEnv = React.useMemo(() => {
    if (!birthSolarData) return null;
    return getCurrentEnvironmentalFrequencies(birthSolarData.solarTime);
  }, [birthSolarData]);

  const honmeiStar = React.useMemo(() => {
    if (!birthSolarData?.solarTime) {
      if (!birthDate) return null;
      return getHonmeiStar(new Date(birthDate));
    }
    return getHonmeiStar(birthSolarData.solarTime);
  }, [birthDate, birthSolarData]);

  const { board, layers, physicalLayers, classicalLayers, physicalYearBoard, physicalMonthBoard, physicalDayBoard, classicalYearBoard, classicalMonthBoard, classicalDayBoard } = React.useMemo(() => {
    if (!env || !honmeiStar) return { board: null, layers: null, physicalLayers: null, classicalLayers: null, physicalYearBoard: null, physicalMonthBoard: null, physicalDayBoard: null, classicalYearBoard: null, classicalMonthBoard: null, classicalDayBoard: null };

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

    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));

    const vectorData = calculateVectorCollision(
      useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
      yB, mB, dB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent
    );

    const physicalVectorData = calculateVectorCollision(
      honmeiStar.physical,
      pyB, pmB, pdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent
    );

    const classicalVectorData = calculateVectorCollision(
      honmeiStar.classical,
      cyB, cmB, cdB,
      voidZodiacArray,
      env.raw.lunarNode,
      actionIntent
    );

    return { board: dB, layers: vectorData, physicalLayers: physicalVectorData, classicalLayers: classicalVectorData, physicalYearBoard: pyB, physicalMonthBoard: pmB, physicalDayBoard: pdB, classicalYearBoard: cyB, classicalMonthBoard: cmB, classicalDayBoard: cdB };
  }, [honmeiStar, env, birthDate, actionIntent, voidZodiacOverride, useClassicalBoard]);

  useEffect(() => {
    if (heatmapMode === 'none' || !baseTime || !honmeiStar || !env) return;

    const data = [];
    const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const voidZodiacArray = voidZodiacOverride ? voidZodiacOverride.split('') : getPersonalVoidZodiac(new Date(birthDate));

    if (heatmapMode === '30days') {
      for (let i = 0; i < 30; i++) {
        const testDate = new Date(baseTime.getTime() + (timeOffsetDays + i) * 86400000);
        const testEnv = getCurrentEnvironmentalFrequencies(testDate);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);
        const dB = generateBoard(useClassicalBoard ? testEnv.classicalDayStar : testEnv.dayStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, dB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent
        );
        data.push({
          label: `${testDate.getMonth() + 1}/${testDate.getDate()}`,
          vectors: vectorData.finalVectors,
          isVoid: voidZodiacArray.some(z => [getCurrentZodiac(testDate).yearZodiac, getCurrentZodiac(testDate).monthZodiac, getCurrentZodiac(testDate).dayZodiac].includes(z))
        });
      }
    } else if (heatmapMode === '12months') {
      for (let i = 0; i < 12; i++) {
        const testDate = new Date(baseTime.getTime() + timeOffsetDays * 86400000);
        testDate.setMonth(testDate.getMonth() + i);
        const testEnv = getCurrentEnvironmentalFrequencies(testDate);
        const yB = generateBoard(useClassicalBoard ? testEnv.classicalYearStar : testEnv.yearStar);
        const mB = generateBoard(useClassicalBoard ? testEnv.classicalMonthStar : testEnv.monthStar);

        const vectorData = calculateVectorCollision(
          useClassicalBoard ? honmeiStar.classical : honmeiStar.physical,
          yB, mB, yB,
          voidZodiacArray,
          testEnv.raw.lunarNode,
          actionIntent
        );

        const mergedVectors: Record<string, string> = {};
        for (const dir of dirs) {
          const y = vectorData.yearLayer[dir] || 'SAFE';
          const m = vectorData.monthLayer[dir] || 'SAFE';
          if (y.startsWith('NOISE_GOU') || y.startsWith('NOISE_ANKEN') || m.startsWith('NOISE_GOU') || m.startsWith('NOISE_ANKEN')) {
            mergedVectors[dir] = y.startsWith('NOISE_GOU') ? y : m.startsWith('NOISE_GOU') ? m : y.startsWith('NOISE_ANKEN') ? y : m;
          } else if (y.startsWith('NOISE') || m.startsWith('NOISE')) {
            mergedVectors[dir] = y.startsWith('NOISE') ? y : m;
          } else {
            mergedVectors[dir] = (y === 'OPTIMAL' || m === 'OPTIMAL') ? 'OPTIMAL' : 'SAFE';
          }
        }

        data.push({
          label: `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}`,
          vectors: mergedVectors,
          isVoid: voidZodiacArray.some(z => [getCurrentZodiac(testDate).yearZodiac, getCurrentZodiac(testDate).monthZodiac].includes(z))
        });
      }
    }
    setHeatmapData(data);
  }, [heatmapMode, baseTime, timeOffsetDays, honmeiStar, actionIntent, useClassicalBoard, voidZodiacOverride, birthDate, env]);

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

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + header + "\n" + row;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `metaphysical_unified_export_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Export Unified JSON (Full State)
    const fullState = {
      timestamp: new Date().toISOString(),
      location: { lat, lon, targetLat, targetLon },
      personalProfile: { birthDate, birthLat, birthLon, honmeiStar, personalVoidZodiac },
      biometrics: { hrv, gsr, ansLoad, shieldCapacity },
      baselines: { hrvMean: baselineHrvMean, hrvStd: baselineHrvStd, gsrMean: baselineGsrMean, gsrStd: baselineGsrStd },
      geomagnetism: geoData,
      spaceWeather: spaceWeather,
      ephemeris: env,
      birthEphemeris: birthEnv,
      solarData: solarData,
      spatialVectors: {
        physical: physicalLayers,
        classical: classicalLayers,
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
    if (honmeiStar?.physical) {
      if (typeof honmeiStar.physical === 'number') {
        userKigakuStar = honmeiStar.physical;
      } else if (typeof honmeiStar.physical === 'string') {
        const match = String(honmeiStar.physical).match(/([一二三四五六七八九])/);
        if (match) {
          const numMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
          userKigakuStar = numMap[match[1]];
        } else {
          const numMatch = String(honmeiStar.physical).match(/(\d)/);
          if (numMatch) userKigakuStar = parseInt(numMatch[1], 10);
        }
      }
    }

    const result = optimizer.evaluate({
      targetDate,
      userBirthDate: birthDate ? new Date(birthDate) : undefined,
      userKigakuStar,
      actionType: timingActionType,
      latitude: targetLat || lat,
      longitude: targetLon || lon
    });

    setTimingOptimization(result);
  }, [baseTime, timeOffsetDays, actionIntent, usePsychologyScorer, useKigakuScorer, useAstrologyScorer, honmeiStar, birthDate, targetLat, lat, targetLon, lon]);

  if (!baseTime || !solarData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase md:animate-pulse">
        Initializing Tactical Systems...
      </div>
    );

  const kimon = getKimonHour(solarData.solarTime);
  const basePersonalVoidZodiac = getPersonalVoidZodiac(new Date(birthDate));
  const personalVoidZodiac = voidZodiacOverride ? voidZodiacOverride.split('') : basePersonalVoidZodiac;
  const isPersonalVoid = personalVoidZodiac.includes(kimon.japanese);

  let activeVectors: any = layers?.finalVectors || {};
  if (activeLayerMode === 'year') activeVectors = layers?.yearLayer || {};
  else if (activeLayerMode === 'month') activeVectors = layers?.monthLayer || {};
  else if (activeLayerMode === 'day') activeVectors = layers?.dayLayer || {};

  const targetDirInfo = getTargetDirectionInfo();
  let targetVectorStatus: string | null = null;

  if (targetDirInfo && activeVectors) {
    targetVectorStatus = activeVectors[targetDirInfo.magneticDirection as Direction];
  }

  const evalDate = baseTime ? new Date(baseTime.getTime() + timeOffsetDays * 86400000) : new Date();
  const currentZodiac = getCurrentZodiac(evalDate);
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
      if (s.startsWith('NOISE_HONMEI') || s.startsWith('NOISE_TEKI')) return 'text-[#a855f7] font-bold bg-[#a855f7]/10 border-[#a855f7]/30';
      if (s.startsWith('NOISE_VOID')) return 'text-zinc-500 bg-zinc-900 border-zinc-700';
      if (s.startsWith('NOISE_NODE')) return 'text-yellow-400 font-bold bg-yellow-950/30 border-yellow-900/50';
      if (s === 'OPTIMAL') return 'text-emerald-400 font-bold bg-emerald-950/30 border-emerald-900/50 shadow-[0_0_8px_rgba(16,185,129,0.2)]';
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
            1. Profile
          </button>
          <button
            onClick={() => setActiveTab("destination")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "destination"
              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            2. Destination
          </button>
          <button
            onClick={() => setActiveTab("timing")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "timing"
              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            3. Timing
          </button>
          <button
            onClick={() => setActiveTab("consult")}
            className={`px-4 sm:px-6 py-2 rounded-full text-[9px] sm:text-[10px] uppercase font-mono tracking-widest transition-all ${activeTab === "consult"
              ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
              : "text-zinc-500 hover:text-zinc-300"
              }`}
          >
            4. Consult
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
                honmeiStar={honmeiStar?.physical || null}
                environmentalFrequencies={env}
                birthFrequencies={birthEnv}
                finalVectors={layers?.finalVectors || {}}
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
                timingScore={timingOptimization?.score}
                timingScore={(timingOptimization as any)?.score}
                timingDetails={timingOptimization?.details}
                timingRecommendation={timingOptimization?.recommendationText}
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
                      <span className="text-purple-500">▶</span> Hardware Init <span className="text-zinc-500 font-normal">(Birth Vector)</span>
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
                        <span className="text-emerald-500">▶</span> Live Environment
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
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
                        <span>Live Orbital Matrix</span>
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
                          <div className="mt-2 text-[8px] text-zinc-600 leading-tight">隠遁・陽遁と日家九星の近似。</div>
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
                    <span>Phase Interference Diagnosis</span>
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

                            const getColor = (s: string) => {
                              if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'text-red-500 font-bold';
                              if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'text-[#a855f7] font-bold';
                              if (s === 'NOISE_VOID') return 'text-zinc-600 font-bold drop-shadow-[0_0_3px_rgba(0,0,0,1)] bg-zinc-950 px-1 border border-zinc-800';
                              if (s === 'NOISE_NODE') return 'text-yellow-400 font-bold';
                              if (s === 'OPTIMAL') return 'text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]';
                              return 'text-blue-400';
                            };

                            const formatLabel = (s: string) => {
                              if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'TYPE_I_NOISE';
                              if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'TYPE_II_NOISE';
                              if (s === 'NOISE_VOID') return 'VOID_ZONE';
                              if (s === 'NOISE_NODE') return 'LUNAR_NODE';
                              return s;
                            };

                            const TooltipCell = ({ status, board, isFinal }: { status: string, board: any, isFinal?: boolean }) => {
                              const star = board ? board[dir] : '?';
                              let title = "🟦 通常ゾーン (SAFE)";
                              let desc = "致命的な定在波やノイズは観測されていません。標準ベースラインです。";
                              if (status === 'NOISE_GOU') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "強力な環境ノイズ帯。重大な行動阻害リスクが観測されています。"; }
                              else if (status === 'NOISE_ANKEN') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "外部からの突発的干渉ノイズが観測される行動阻害エリアです。"; }
                              else if (status === 'NOISE_HONMEI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "あなたの固有波長との共鳴過負荷(オーバーヒート)が起きる干渉帯です。"; }
                              else if (status === 'NOISE_TEKI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "目標・方向性に対するダイレクトな干渉ノイズが発生するエリアです。"; }
                              else if (status === 'NOISE_VOID') { title = "⬛ 虚無・ボイド空間 (VOID ZONE)"; desc = "あなたの天中殺（空亡）に該当する構造的エラー領域です。空間の吉凶に関わらず行動がリセットされます。"; }
                              else if (status === 'NOISE_NODE') { title = "🟨 月交点 (LUNAR NODE)"; desc = "日食・月食ラインの特異点。精神や自律神経に異常干渉を起こしやすいエリアです。"; }
                              else if (status === 'OPTIMAL') { title = "🟩 最適化ゾーン (OPTIMAL)"; desc = "あなたの波長と環境波長が完全に同期し、パフォーマンスを最大化させます。"; }

                              const label = formatLabel(status);

                              return (
                                <div className="group relative cursor-help inline-block">
                                  <span className={`${getColor(status)} border-b border-zinc-700/50 hover:border-current`}>{label}</span>
                                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-950 border border-zinc-700 text-zinc-300 text-[9px] shadow-2xl z-50 rounded-sm font-sans normal-case leading-relaxed pointer-events-none">
                                    <div className={`font-bold mb-1 border-b border-zinc-800 pb-1 ${getColor(status)}`}>{title}</div>
                                    <div className="text-zinc-400 mb-1 leading-tight">{desc}</div>
                                    {!isFinal && <div className="text-[9px] text-zinc-500 font-mono mt-1 pt-1 border-t border-zinc-800">配置星: {star} / My: {honmeiStar?.physical}</div>}
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <tr key={dir} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 pr-2 text-zinc-400 font-bold align-middle">{dir}</td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={y} board={physicalYearBoard} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={m} board={physicalMonthBoard} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={d} board={physicalDayBoard} /></td>
                                <td className="py-2.5 pl-2 align-middle bg-zinc-950/50"><TooltipCell status={final} board={null} isFinal={true} /></td>
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

                            const getColor = (s: string) => {
                              if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'text-red-500 font-bold';
                              if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'text-[#a855f7] font-bold';
                              if (s === 'NOISE_VOID') return 'text-zinc-600 font-bold drop-shadow-[0_0_3px_rgba(0,0,0,1)] bg-zinc-950 px-1 border border-zinc-800';
                              if (s === 'NOISE_NODE') return 'text-yellow-400 font-bold';
                              if (s === 'OPTIMAL') return 'text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]';
                              return 'text-blue-400';
                            };

                            const formatLabel = (s: string) => {
                              if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'TYPE_I_NOISE';
                              if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'TYPE_II_NOISE';
                              if (s === 'NOISE_VOID') return 'VOID_ZONE';
                              if (s === 'NOISE_NODE') return 'LUNAR_NODE';
                              return s;
                            };

                            const TooltipCell = ({ status, board, isFinal }: { status: string, board: any, isFinal?: boolean }) => {
                              const star = board ? board[dir] : '?';
                              let title = "🟦 通常ゾーン (SAFE)";
                              let desc = "致命的な定在波やノイズは観測されていません。標準ベースラインです。";
                              if (status === 'NOISE_GOU') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "強力な環境ノイズ帯。重大な行動阻害リスクが観測されています。"; }
                              else if (status === 'NOISE_ANKEN') { title = "🟥 非推奨ベクトル (TYPE I)"; desc = "外部からの突発的干渉ノイズが観測される行動阻害エリアです。"; }
                              else if (status === 'NOISE_HONMEI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "あなたの固有波長との共鳴過負荷(オーバーヒート)が起きる干渉帯です。"; }
                              else if (status === 'NOISE_TEKI') { title = "🟥 非推奨ベクトル (TYPE II)"; desc = "目標・方向性に対するダイレクトな干渉ノイズが発生するエリアです。"; }
                              else if (status === 'NOISE_VOID') { title = "⬛ 虚無・ボイド空間 (VOID ZONE)"; desc = "あなたの天中殺（空亡）に該当する構造的エラー領域です。空間の吉凶に関わらず行動がリセットされます。"; }
                              else if (status === 'NOISE_NODE') { title = "🟨 月交点 (LUNAR NODE)"; desc = "日食・月食ラインの特異点。精神や自律神経に異常干渉を起こしやすいエリアです。"; }
                              else if (status === 'OPTIMAL') { title = "🟩 最適化ゾーン (OPTIMAL)"; desc = "あなたの波長と環境波長が完全に同期し、パフォーマンスを最大化させます。"; }

                              const label = formatLabel(status);

                              return (
                                <div className="group relative cursor-help inline-block">
                                  <span className={`${getColor(status)} border-b border-zinc-700/50 hover:border-current`}>{label}</span>
                                  <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-zinc-950 border border-zinc-700 text-zinc-300 text-[9px] shadow-2xl z-50 rounded-sm font-sans normal-case leading-relaxed pointer-events-none">
                                    <div className={`font-bold mb-1 border-b border-zinc-800 pb-1 ${getColor(status)}`}>{title}</div>
                                    <div className="text-zinc-400 mb-1 leading-tight">{desc}</div>
                                    {!isFinal && <div className="text-[9px] text-zinc-500 font-mono mt-1 pt-1 border-t border-zinc-800">配置星: {star} / My: {honmeiStar?.classical}</div>}
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <tr key={dir} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="py-2.5 pr-2 text-zinc-500 font-bold align-middle">{dir}</td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={y} board={classicalYearBoard} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={m} board={classicalMonthBoard} /></td>
                                <td className="py-2.5 px-1 align-middle"><TooltipCell status={d} board={classicalDayBoard} /></td>
                                <td className="py-2.5 pl-2 align-middle bg-zinc-900/20"><TooltipCell status={final} board={null} isFinal={true} /></td>
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
                    Astrophysical Core Logic (Theory & Model)
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

        {/* --- MAP CONTENT (Appended to DESTINATION tab) --- */}
        {activeTab === "destination" && (
          <div className="w-full flex flex-col items-center space-y-8 mt-8">
            <div className="w-full max-w-4xl mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        {isAutoSearching ? 'SEARCHING...' : 'AUTO SEARCH'}
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
                        {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
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
                        Destination <span className="text-[9px] text-zinc-600">Lat/Lon</span>
                      </label>
                      <button
                        onClick={() => setShowMapPicker(!showMapPicker)}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${showMapPicker ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
                      >
                        [ MAP SEARCH ]
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
                        placeholder="Paste Coords or Google Maps URL... (e.g. 35.68, 139.76)"
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
                        placeholder="Latitude"
                        value={targetLat ?? ""}
                        onChange={e => setTargetLat(e.target.value ? Number(e.target.value) : null)}
                        className="bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                      <input
                        type="number"
                        placeholder="Longitude"
                        value={targetLon ?? ""}
                        onChange={e => setTargetLon(e.target.value ? Number(e.target.value) : null)}
                        className="bg-black border border-zinc-700 focus:border-emerald-500/50 text-zinc-300 text-sm px-2 py-1 rounded-sm outline-none w-1/3 transition-colors font-mono"
                      />
                      <input
                        type="number"
                        placeholder="Elev(m)"
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
                          📋 COPY COORDS
                        </button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${targetLat},${targetLon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-blue-900/30 text-blue-400 hover:bg-blue-800/50 border border-blue-800/50 text-[9px] uppercase tracking-widest px-2 py-1.5 rounded-sm transition-colors text-center block"
                        >
                          🗺️ OPEN IN GOOGLE MAPS
                        </a>
                      </div>
                    )}                    {targetDirInfo && targetVectorStatus && (
                      <div className={`mt-1 text-[10px] font-mono p-1 border rounded-sm flex items-center justify-between gap-2 ${targetVectorStatus.startsWith('NOISE_VOID')
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-600 repeating-linear-gradient-45'
                        : targetVectorStatus.startsWith('NOISE_NODE')
                          ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                          : targetVectorStatus.startsWith('NOISE')
                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                            : targetVectorStatus === 'OPTIMAL'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold border border-current px-1 text-zinc-500" title="真北基準">真北: {targetDirInfo.trueDirection}</span>
                          <span className="font-bold border border-current px-1 text-emerald-400" title="磁北基準">磁北: {targetDirInfo.magneticDirection}</span>
                          <span>{targetVectorStatus}</span>
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
                    <h3 className="text-xs text-zinc-300 font-bold uppercase tracking-widest">Zone Classification <span className="text-[9px] text-zinc-500 font-normal ml-1">/ 空間分類</span></h3>
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
                        const allDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
                        const optimals = Object.keys(fv).filter(k => fv[k] === 'OPTIMAL').map(k => {
                          const map: any = { N: '北', NE: '北東', E: '東', SE: '南東', S: '南', SW: '南西', W: '西', NW: '北西' };
                          return map[k] || k;
                        });
                        const safes = allDirs.filter(k => !(fv[k] || '').startsWith('NOISE') && fv[k] !== 'OPTIMAL').map(k => {
                          const map: any = { N: '北', NE: '北東', E: '東', SE: '南東', S: '南', SW: '南西', W: '西', NW: '北西' };
                          return map[k] || k;
                        });

                        return (
                          <div className="flex flex-col gap-2">
                            <div className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 ${badgeColor}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {title} <span className="text-[8px] opacity-70 font-normal">{subtitle}</span>
                            </div>
                            {optimals.length > 0 && (
                              <div className="bg-emerald-950/40 border-l-2 border-emerald-500 p-2 sm:p-3 rounded-r-md">
                                <div className="text-emerald-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                  [ GO ] 推奨方位
                                </div>
                                <div className="text-emerald-400 font-bold text-xl sm:text-2xl tracking-widest">
                                  {optimals.join(' / ')}
                                </div>
                              </div>
                            )}
                            {safes.length > 0 && (
                              <div className="bg-blue-950/40 border-l-2 border-blue-500 p-2 sm:p-3 rounded-r-md">
                                <div className="text-blue-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                                  [ SAFE ] 進入可能方位
                                </div>
                                <div className="text-blue-400 font-bold text-xl sm:text-2xl tracking-widest">
                                  {safes.join(' / ')}
                                </div>
                              </div>
                            )}
                            {optimals.length === 0 && safes.length === 0 && (
                              <div className="bg-red-950/40 border-l-2 border-red-500 p-2 sm:p-3 rounded-r-md">
                                <div className="text-red-500 font-bold text-[9px] md:text-[10px] uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                                  [ ALERT ]
                                </div>
                                <div className="text-red-500 font-bold text-lg sm:text-xl tracking-widest">
                                  全方位 進入非推奨 (待機)
                                </div>
                              </div>
                            )}
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
                              <th key={i} className={`p-1 border border-zinc-800 text-[7px] font-mono whitespace-nowrap ${d.isVoid ? 'text-red-500 bg-red-950/20' : 'text-zinc-500 bg-zinc-900/30'}`}>
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
                                else if (st === 'SAFE') bgClass = 'bg-blue-500/20';
                                else if (st?.startsWith('NOISE_GOU') || st?.startsWith('NOISE_ANKEN')) bgClass = 'bg-red-500/80';
                                else if (st?.startsWith('NOISE_HONMEI') || st?.startsWith('NOISE_TEKI')) bgClass = 'bg-purple-500/80';
                                else if (st?.startsWith('NOISE_VOID') || st?.startsWith('NOISE_NODE')) bgClass = 'bg-yellow-500/80';

                                return (
                                  <td key={i} className={`p-0 border border-zinc-800 ${bgClass}`} title={`${d.label} ${dir}: ${st}`}>
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
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500/80"></div> TYPE I (Gou/Anken)</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500/80"></div> TYPE II (Bio)</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500/80"></div> VOID/NODE</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Module 4: Tactical Magnetic Map */}
            <div className="w-full max-w-4xl mt-0">

              <div className="flex justify-end mb-2 w-full gap-2">
                <button
                  onClick={() => setShowOnlyNewBuild(!showOnlyNewBuild)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${showOnlyNewBuild ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30" : "bg-zinc-500/20 text-zinc-400 border-zinc-500/50 hover:bg-zinc-500/30"}`}
                >
                  {showOnlyNewBuild ? "☑ 新築のみ表示" : "☐ 全物件表示"}
                </button>
                <button
                  onClick={() => setUseClassicalBoard(!useClassicalBoard)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest border rounded transition-colors ${useClassicalBoard ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/50 hover:bg-zinc-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30"}`}
                >
                  Model: {useClassicalBoard ? "Classical (暦基準)" : "Physical (木星黄経基準)"}
                </button>
              </div>
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
            <span className="animate-pulse">SAVING...</span>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              SAVE TO DATABASE
            </>
          )}
        </button>

        <button
          onClick={exportMasterTelemetry}
          className="px-4 py-3 bg-emerald-600/90 text-white font-bold font-mono text-[10px] tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-500 hover:scale-105 transition-all flex items-center gap-2 border border-emerald-400/50 backdrop-blur-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          EXPORT MASTER STATE (CSV/JSON)
        </button>
      </div>
    </div >
  );
};
