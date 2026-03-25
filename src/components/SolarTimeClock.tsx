"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { calculateSolarTime, getKimonHour } from "../utils/solarTime";
import { fetchSpaceWeather, SpaceWeatherData } from "../utils/spaceWeather";
import { getGeomagneticData, GeomagneticData } from "../utils/geomagnetism";

import { ClockDisplay } from "./ClockDisplay";
import { getHonmeiStar, getCurrentEnvironmentalFrequencies, generateBoard, calculateVectorCollision, getPersonalVoidZodiac } from "../utils/ephemerisEngine";
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { createClient } from '../utils/supabase/client';

const supabase = createClient();

const SolarTimeTable = dynamic(() => import("./SolarTimeTable").then(mod => mod.SolarTimeTable), { ssr: false });
const TacticalActionCommand = dynamic(() => import("./TacticalActionCommand").then(mod => mod.TacticalActionCommand), { ssr: false });
const BioMagneticDashboard = dynamic(() => import("./BioMagneticDashboard").then(mod => mod.BioMagneticDashboard), { ssr: false });
const TacticalMagneticMap = dynamic(() => import("./TacticalMagneticMap").then(mod => mod.TacticalMagneticMap), { ssr: false });
const PersonalProfileConfig = dynamic(() => import("./PersonalProfileConfig").then(mod => mod.PersonalProfileConfig), { ssr: false });
const SystemTelemetryLog = dynamic(() => import("./SystemTelemetryLog").then(mod => mod.SystemTelemetryLog), { ssr: false });


export const SolarTimeClock = () => {
  const [baseTime, setBaseTime] = useState<Date | null>(null);
  const [ephemerisTime, setEphemerisTime] = useState<Date | null>(null);
  const [solarData, setSolarData] = useState<any>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "diagnostics" | "map">("overview");
  const [activeLayerMode, setActiveLayerMode] = useState<'final' | 'year' | 'month' | 'day'>('final');

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
  const [hrv, setHrv] = useState(50);
  const [gsr, setGsr] = useState(5);
  const [baseSyncDays, setBaseSyncDays] = useState(30);

  const [ansLoad, setAnsLoad] = useState(0);
  const [shieldCapacity, setShieldCapacity] = useState(100);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  // HUD Layer Visibility (Idea 3)
  const [hudLayers, setHudLayers] = useState({
    terrain: true,
    weather: true,
    bio: true
  });

  const [showAstrophysicalLogic, setShowAstrophysicalLogic] = useState(false);

  const handleLoadConfig = async (silent = true) => {
    // 1. ローカル環境（オフライン）からの復元を優先
    const localData = localStorage.getItem('tactical_config_v1');
    if (localData) {
      try {
        const data = JSON.parse(localData);
        if (data.birth_date) setBirthDate(data.birth_date);
        if (data.birth_lat) setBirthLat(data.birth_lat);
        if (data.birth_lon) setBirthLon(data.birth_lon);
        if (data.base_lat) setLat(data.base_lat);
        if (data.base_lon) setLon(data.base_lon);
        if (!silent) alert("ブラウザ環境から設定を復元しました。");
        return true;
      } catch (e) {
        console.error("LocalStorage parse error", e);
      }
    }

    // 2. クラウド（Supabase）にログインしていれば探す
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setIsLoggedIn(true);
      setUserEmail(session.user?.email || null);
      const { data, error } = await supabase
        .from('user_configs')
        .select('*')
        .eq('user_email', session.user.email)
        .single();

      if (data && !error) {
        if (data.birth_date) setBirthDate(data.birth_date);
        if (data.birth_lat) setBirthLat(data.birth_lat);
        if (data.birth_lon) setBirthLon(data.birth_lon);
        if (data.base_lat) setLat(data.base_lat);
        if (data.base_lon) setLon(data.base_lon);
        if (!silent) alert("クラウドから設定を同期しました。");
        return true;
      }
    }

    if (!silent) alert("保存された設定が見つかりませんでした。");
    return false;
  };

  const handleAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });

    if (error) {
      console.error("Auth Error:", error);
      alert("認証システムへのパスが切断されました。");
    }
  };

  useEffect(() => {
    // Only fetch on mount silently
    handleLoadConfig(true);
  }, []);

  const handleGetGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLon(position.coords.longitude);
          alert("現在のGPS座標をBase座標としてセットしました。");
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
      };

      // ログイン不要で全員が使えるようにまずは LocalStorage に暗黙で保存
      localStorage.setItem('tactical_config_v1', JSON.stringify(configToSave));

      // ログイン済みユーザーならクラウドにもバックアップ同期する
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from('user_configs')
          .upsert({
            user_email: session.user.email,
            ...configToSave
          }, { onConflict: 'user_email' });
      }

      alert("設定を保存しました（ブラウザ内にセキュアに記録されました）。");
    } catch (err: any) {
      console.error("Save Error:", err);
      alert(`保存に失敗しました: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate Solar Data (Current & Birth)
  const birthSolarData = React.useMemo(() => {
    if (!birthDate || !birthLon) return null;
    return calculateSolarTime(new Date(birthDate), birthLon);
  }, [birthDate, birthLon]);

  // --- Environmental Context ---
  // 物理モデルへの完全統合 & パフォーマンス最適化
  const env = React.useMemo(() => {
    if (!solarData?.solarTime) {
      if (!ephemerisTime) return null;
      return getCurrentEnvironmentalFrequencies(ephemerisTime);
    }
    return getCurrentEnvironmentalFrequencies(solarData.solarTime);
  }, [ephemerisTime, solarData]);

  // --- Hardware Init Context (Birth Data) ---
  const birthEnv = React.useMemo(() => {
    if (!birthSolarData) return null;
    return getCurrentEnvironmentalFrequencies(birthSolarData.solarTime);
  }, [birthSolarData]);

  // --- Dynamic Ephemeris Calculation ---
  const honmeiStar = React.useMemo(() => {
    if (!birthSolarData?.solarTime) {
      if (!birthDate) return null;
      return getHonmeiStar(new Date(birthDate));
    }
    return getHonmeiStar(birthSolarData.solarTime);
  }, [birthDate, birthSolarData]);

  const { board, layers, yearBoard, monthBoard, dayBoard, classicalYearBoard } = React.useMemo(() => {
    if (!env || !honmeiStar) return { board: null, layers: null, yearBoard: null, monthBoard: null, dayBoard: null, classicalYearBoard: null };
    const yB = generateBoard(env.yearStar);
    const mB = generateBoard(env.monthStar);
    const dB = generateBoard(env.dayStar);
    const cyB = generateBoard(env.classicalYearStar);
    const vectorData = calculateVectorCollision(honmeiStar.physical, yB, mB, dB);
    return { board: dB, layers: vectorData, yearBoard: yB, monthBoard: mB, dayBoard: dB, classicalYearBoard: cyB };
  }, [honmeiStar, env]);

  const handleExportCSV = () => {
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
      "N_FinalVector", "NE_FinalVector", "E_FinalVector", "SE_FinalVector",
      "S_FinalVector", "SW_FinalVector", "W_FinalVector", "NW_FinalVector"
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
      layers?.finalVectors?.N || "", layers?.finalVectors?.NE || "",
      layers?.finalVectors?.E || "", layers?.finalVectors?.SE || "",
      layers?.finalVectors?.S || "", layers?.finalVectors?.SW || "",
      layers?.finalVectors?.W || "", layers?.finalVectors?.NW || ""
    ].join(",");

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + header + "\n" + row;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ephemeris_engine_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const now = new Date();
    setBaseTime(now);
    setEphemerisTime(now);

    // Clock updates every minute to save React tree re-renders
    const fastTimer = setInterval(() => setBaseTime(new Date()), 60000);
    // Ephemeris engine calculation runs only once a minute to prevent high CPU load
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

  // Fetch Space Weather on mount
  useEffect(() => {
    fetchSpaceWeather().then((data) => setSpaceWeather(data));
  }, []);

  useEffect(() => {
    if (baseTime && lon) {
      setSolarData(calculateSolarTime(baseTime, lon));
    }
  }, [baseTime, lon]);

  // Fetch Geomagnetic Data (Server Action) ONLY when coordinates change!
  useEffect(() => {
    if (lat && lon) {
      getGeomagneticData(lat, lon, new Date().getTime()).then((data) =>
        setGeoData(data),
      );
    }
  }, [lat, lon]);

  // Calculate ANS Load & Shield Capacity
  useEffect(() => {
    // Shield Capacity is based on Base Sync Days (max 60 days)
    const capacity = Math.min(100, Math.max(0, (baseSyncDays / 60) * 100));
    setShieldCapacity(Math.round(capacity));

    // ANS Load calculation
    // Base load from HRV (lower is worse, e.g. 20ms = high load 80%)
    let currentLoad = 100 - Math.min(100, (hrv / 120) * 100);

    // Add Kp Index penalty (Kp > 3 adds to load)
    if (spaceWeather?.kpIndex) {
      const kpPenalty = Math.max(0, (spaceWeather.kpIndex - 3) * 10);
      currentLoad += kpPenalty;
    }

    // Add GSR penalty (High sweat/stress = high load)
    currentLoad += gsr * 2;

    // Shield mitigation
    const mitigatedLoad = currentLoad - capacity * 0.2;
    setAnsLoad(Math.round(Math.min(100, Math.max(0, mitigatedLoad))));
  }, [hrv, gsr, baseSyncDays, spaceWeather]);

  if (!baseTime || !solarData)
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-emerald-500 font-mono text-xs tracking-[0.3em] uppercase md:animate-pulse">
        Initializing Tactical Systems...
      </div>
    );

  const kimon = getKimonHour(solarData.solarTime);
  const personalVoidZodiac = getPersonalVoidZodiac(new Date(birthDate));
  const isPersonalVoid = personalVoidZodiac.includes(kimon.japanese);

  let activeVectors: any = layers?.finalVectors || {};
  if (activeLayerMode === 'year') activeVectors = layers?.yearLayer || {};
  else if (activeLayerMode === 'month') activeVectors = layers?.monthLayer || {};
  else if (activeLayerMode === 'day') activeVectors = layers?.dayLayer || {};

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-emerald-900 pt-4 md:pt-16 pb-8 md:pb-16 relative overflow-x-hidden">
      {/* Background Grid Pattern */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      ></div>

      <div className="flex flex-col items-center space-y-6 md:space-y-8 z-10 w-full max-w-5xl px-3 md:px-4 animate-fade-in-up">
        {/* Tab Navigation */}
        <div className="w-full max-w-4xl flex items-center justify-center p-1 bg-zinc-900/30 border border-zinc-800/50 rounded-full md:backdrop-blur-sm sticky top-4 z-40">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-6 py-2 rounded-full text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "overview"
                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`px-6 py-2 rounded-full text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "diagnostics"
                ? "bg-purple-500/10 text-purple-500 border border-purple-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Diagnostics
          </button>
          <button
            onClick={() => setActiveTab("map")}
            className={`px-6 py-2 rounded-full text-[10px] uppercase font-mono tracking-widest transition-all ${
              activeTab === "map"
                ? "bg-blue-500/10 text-blue-500 border border-blue-500/30"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Tactical Map
          </button>
        </div>

        {/* --- TAB CONTENT: OVERVIEW --- */}
        {activeTab === "overview" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
            {/* Module 0: Tactical Action Command */}
            <TacticalActionCommand
              kpIndex={spaceWeather?.kpIndex || null}
              ansLoad={ansLoad}
              isPersonalVoid={isPersonalVoid}
              personalVoidZodiac={personalVoidZodiac}
            />

            {/* Temporal HUD (Main Clock Focus) */}
            <ClockDisplay
              kimon={kimon}
              isVoidTime={isPersonalVoid}
              solarTime={solarData.solarTime}
              eot={solarData.equationOfTime}
              longOffset={solarData.longitudeCorrection}
            />

            {/* Module 1 & 2: BioMagnetic Dashboard */}
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
            />
          </div>
        )}

        {/* --- TAB CONTENT: DIAGNOSTICS --- */}
        {activeTab === "diagnostics" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
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
              onAuth={handleAuth}
              isLoggedIn={isLoggedIn}
            />
            <div className="mt-8 flex flex-col gap-4 border-b border-zinc-900 pb-4 w-full max-w-4xl">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-purple-400">
                  Ephemeris Engine Diagnostics
                </h2>
                <div className="h-px bg-zinc-800 grow"></div>
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1 bg-zinc-950 border border-zinc-700 hover:border-zinc-500 hover:text-white text-zinc-400 text-[9px] uppercase font-mono tracking-widest transition-colors flex items-center gap-1 shrink-0 group"
                  title="Export raw calculation matrices and environmental telemtry to CSV"
                >
                  <span className="text-zinc-600 group-hover:text-emerald-500 transition-colors">▼</span> EXPORT CSV
                </button>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[11px] font-mono text-zinc-300">
                    <div className="bg-black/50 border border-purple-900/30 p-2">
                      <div className="text-purple-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                        <span>物理年盤 (天体位相)</span>
                        <span className="text-[7px] text-zinc-500">PHYSICAL MODEL</span>
                      </div>
                      {yearBoard && (
                        <div className="grid grid-cols-3 gap-1 text-center font-bold">
                          <div>SE: {yearBoard.SE}</div>
                          <div>S: {yearBoard.S}</div>
                          <div>SW: {yearBoard.SW}</div>
                          <div>E: {yearBoard.E}</div>
                          <div className="text-purple-400">C: {yearBoard.CENTER}</div>
                          <div>W: {yearBoard.W}</div>
                          <div>NE: {yearBoard.NE}</div>
                          <div>N: {yearBoard.N}</div>
                          <div>NW: {yearBoard.NW}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[8px] text-zinc-600 leading-tight">
                        太陽黄経(立春起点)に基づく真の物理的位相。<br/>
                        あなたの本命星 {honmeiStar?.physical} (Phys) との干渉。
                      </div>
                    </div>

                    <div className="bg-zinc-900/20 border border-zinc-800 p-2">
                      <div className="text-zinc-400 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                        <span>古典年盤 (暦・節切り)</span>
                        <span className="text-[7px] text-zinc-500">CLASSICAL DOCS</span>
                      </div>
                      {classicalYearBoard && (
                        <div className="grid grid-cols-3 gap-1 text-center font-bold text-zinc-500">
                          <div>SE: {classicalYearBoard.SE}</div>
                          <div>S: {classicalYearBoard.S}</div>
                          <div>SW: {classicalYearBoard.SW}</div>
                          <div>E: {classicalYearBoard.E}</div>
                          <div className="text-zinc-400">C: {classicalYearBoard.CENTER}</div>
                          <div>W: {classicalYearBoard.W}</div>
                          <div>NE: {classicalYearBoard.NE}</div>
                          <div>N: {classicalYearBoard.N}</div>
                          <div>NW: {classicalYearBoard.NW}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[8px] text-zinc-600 leading-tight">
                        一般的な書籍・暦に基づく盤面。<br/>
                        立春を基準としたカレンダー・モデル。
                      </div>
                    </div>

                    <div className="bg-black/50 border border-zinc-800 p-2">
                      <div className="text-amber-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                        <span>月盤 (潮汐干渉)</span>
                        <span className="text-[7px] text-zinc-500">MONTHLY MODEL</span>
                      </div>
                      {monthBoard && (
                        <div className="grid grid-cols-3 gap-1 text-center font-bold">
                          <div>SE: {monthBoard.SE}</div>
                          <div>S: {monthBoard.S}</div>
                          <div>SW: {monthBoard.SW}</div>
                          <div>E: {monthBoard.E}</div>
                          <div className="text-amber-400">C: {monthBoard.CENTER}</div>
                          <div>W: {monthBoard.W}</div>
                          <div>NE: {monthBoard.NE}</div>
                          <div>N: {monthBoard.N}</div>
                          <div>NW: {monthBoard.NW}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[8px] text-zinc-600">
                        月経度と太陽黄経の相対位相（月相）モデル。
                      </div>
                    </div>
                    
                    <div className="bg-black/50 border border-zinc-800 p-2">
                      <div className="text-blue-500 font-bold mb-1 border-b border-zinc-800 pb-1 flex justify-between">
                        <span>日盤 (自転ベクトル)</span>
                        <span className="text-[7px] text-zinc-500">DAILY MODEL</span>
                      </div>
                      {dayBoard && (
                        <div className="grid grid-cols-3 gap-1 text-center font-bold">
                          <div>SE: {dayBoard.SE}</div>
                          <div>S: {dayBoard.S}</div>
                          <div>SW: {dayBoard.SW}</div>
                          <div>E: {dayBoard.E}</div>
                          <div className="text-blue-400">C: {dayBoard.CENTER}</div>
                          <div>W: {dayBoard.W}</div>
                          <div>NE: {dayBoard.NE}</div>
                          <div>N: {dayBoard.N}</div>
                          <div>NW: {dayBoard.NW}</div>
                        </div>
                      )}
                      <div className="mt-2 text-[8px] text-zinc-600">
                        地球の自転(JD)と至点による物理反転モデル。
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
                    <span className="text-zinc-500 text-[8px]">( 優先度: 🟥 非推奨 &gt; 🟩 最適化 &gt; 🟦 通常 )</span>
                  </div>
                  <div className="text-[8px] text-zinc-500 mb-2 leading-relaxed text-justify pr-2 font-sans">
                    <strong className="text-zinc-400">判定ロジック:</strong> 長期波・中期波・短期波の各算術ベクトルを重ね合わせ最終結果を導出します。いずれか1つのレイヤーでも致死的なアーティファクト（赤・橙）が含まれている場合、他が同期ベクトル（緑）であっても最終結果は干渉（NOISE）に強制上書きされます。（細胞へのダメージ蓄積を防ぐフェイルセーフ）
                  </div>
                  <div className="overflow-visible w-full mt-4">
                    <table className="w-full text-left font-mono">
                      <thead className="border-b border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider">
                        <tr>
                          <th className="pb-2 pr-2 font-normal align-bottom">Dir</th>
                          <th className="pb-2 px-1 font-normal align-bottom">Year Layer<br/><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【長期的影響】</span></th>
                          <th className="pb-2 px-1 font-normal align-bottom">Month Layer<br/><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【中期的影響】</span></th>
                          <th className="pb-2 px-1 font-normal align-bottom">Day Layer<br/><span className="text-[7px] text-zinc-600 font-sans normal-case leading-tight block mt-1">【短期的影響】</span></th>
                          <th className="pb-2 pl-2 font-bold text-zinc-300 align-bottom">Final Vector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50 text-[10px]">
                        {(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).map(dir => {
                          const y = layers.yearLayer[dir] || 'SAFE';
                          const m = layers.monthLayer[dir] || 'SAFE';
                          const d = layers.dayLayer[dir] || 'SAFE';
                          const final = layers.finalVectors[dir] || 'SAFE';
                          
                          const getColor = (s: string) => {
                            if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'text-red-500 font-bold';
                            if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'text-amber-500 font-bold';
                            if (s === 'OPTIMAL') return 'text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]';
                            return 'text-blue-400';
                          };
                          
                          const formatLabel = (s: string) => {
                             if (s === 'NOISE_GOU' || s === 'NOISE_ANKEN') return 'TYPE_I_NOISE';
                             if (s === 'NOISE_HONMEI' || s === 'NOISE_TEKI') return 'TYPE_II_NOISE';
                             return s;
                          };

                          const TooltipCell = ({ status, board, isFinal }: { status: string, board: any, isFinal?: boolean }) => {
                             const star = board ? board[dir] : '?';
                             let title = "🟦 通常ゾーン (SAFE)";
                             let desc = "致命的な定在波やノイズは観測されていません。標準ベースラインです。";
                             if (status === 'NOISE_GOU') { title="🟥 非推奨ベクトル (TYPE I)"; desc="強力な環境ノイズ帯。重大な行動阻害リスクが観測されています。"; }
                             else if (status === 'NOISE_ANKEN') { title="🟥 非推奨ベクトル (TYPE I)"; desc="外部からの突発的干渉ノイズが観測される行動阻害エリアです。"; }
                             else if (status === 'NOISE_HONMEI') { title="🟥 非推奨ベクトル (TYPE II)"; desc="あなたの固有波長との共鳴過負荷(オーバーヒート)が起きる干渉帯です。"; }
                             else if (status === 'NOISE_TEKI') { title="🟥 非推奨ベクトル (TYPE II)"; desc="目標・方向性に対するダイレクトな干渉ノイズが発生するエリアです。"; }
                             else if (status === 'OPTIMAL') { title="🟩 最適化ゾーン (OPTIMAL)"; desc="あなたの波長と環境波長が完全に同期し、パフォーマンスを最大化させます。"; }
                             
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
                              <td className="py-2.5 px-1 align-middle"><TooltipCell status={y} board={yearBoard} /></td>
                              <td className="py-2.5 px-1 align-middle"><TooltipCell status={m} board={monthBoard} /></td>
                              <td className="py-2.5 px-1 align-middle"><TooltipCell status={d} board={dayBoard} /></td>
                              <td className="py-2.5 pl-2 align-middle bg-zinc-950/50"><TooltipCell status={final} board={null} isFinal={true} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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

            {/* Module 3: Temporal Filter Matrix */}
            <SolarTimeTable
              date={baseTime}
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
              userEmail={userEmail}
            />
          </div>
        )}

        {/* --- TAB CONTENT: MAP --- */}
        {activeTab === "map" && (
          <div className="w-full flex flex-col items-center space-y-8 animate-fade-in">
            {/* Module 4: Tactical Magnetic Map */}
            <div className="w-full max-w-4xl mt-4">
              <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2 mb-2">
                <h2 className="text-[10px] uppercase font-mono tracking-[0.3em] text-zinc-400">
                  Tactical Magnetic Navigator
                </h2>
                <div className="h-px bg-zinc-800 grow"></div>
                <div className="text-[8px] font-mono text-zinc-600 tracking-widest">
                  LAT: {lat?.toFixed(4)} / LON: {lon?.toFixed(4)}
                </div>
              </div>

              {/* COMMANDER'S BRIEFING HUD */}
              <div className="mb-4">
                 {(() => {
                   const fv = activeVectors;
                   const allDirs = ['N','NE','E','SE','S','SW','W','NW'];
                   const optimals = Object.keys(fv).filter(k => fv[k] === 'OPTIMAL').map(k => {
                      const map:any = {N:'北',NE:'北東',E:'東',SE:'南東',S:'南',SW:'南西',W:'西',NW:'北西'};
                      return map[k] || k;
                   });
                   const safes = allDirs.filter(k => !(fv[k] || '').startsWith('NOISE') && fv[k] !== 'OPTIMAL').map(k => {
                      const map:any = {N:'北',NE:'北東',E:'東',SE:'南東',S:'南',SW:'南西',W:'西',NW:'北西'};
                      return map[k] || k;
                   });
                   
                   return (
                     <div className="flex flex-col gap-2">
                       {optimals.length > 0 && (
                         <div className="bg-emerald-950/40 border-l-4 border-emerald-500 p-3 sm:p-4 rounded-r-md">
                            <div className="text-emerald-500 font-bold text-[10px] md:text-sm uppercase tracking-widest mb-1 flex items-center gap-2">
                              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                              [ GO ] 推奨方位 (最適化エリア)
                            </div>
                            <div className="text-emerald-400 font-bold text-2xl sm:text-4xl tracking-widest mt-1">
                              {optimals.join(' / ')}
                            </div>
                         </div>
                       )}
                       {safes.length > 0 && (
                         <div className="bg-blue-950/40 border-l-4 border-blue-500 p-3 sm:p-4 rounded-r-md">
                            <div className="text-blue-500 font-bold text-[10px] md:text-sm uppercase tracking-widest mb-1 flex items-center gap-2">
                              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                              [ SAFE ] 進入可能方位 (通常エリア)
                            </div>
                            <div className="text-blue-400 font-bold text-2xl sm:text-4xl tracking-widest mt-1">
                              {safes.join(' / ')}
                            </div>
                         </div>
                       )}
                       {optimals.length === 0 && safes.length === 0 && (
                         <div className="bg-red-950/40 border-l-4 border-red-500 p-3 sm:p-4 rounded-r-md">
                            <div className="text-red-500 font-bold text-[10px] md:text-sm uppercase tracking-widest mb-1 flex items-center gap-2">
                              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                              [ ALERT ]
                            </div>
                            <div className="text-red-500 font-bold text-xl sm:text-3xl tracking-widest mt-1">
                              全方位 進入非推奨 (待機)
                            </div>
                         </div>
                       )}
                     </div>
                   );
                 })()}
              </div>

              <TacticalMagneticMap
                lat={lat || 35.0116}
                lon={lon || 135.7681}
                declination={geoData?.declination || 0}
                inclination={geoData?.inclination || 0}
                intensity={geoData?.intensity || null}
                vectors={layers?.finalVectors}
                layers={layers}
                honmeiStar={honmeiStar}
                kpIndex={spaceWeather?.kpIndex || null}
                ansLoad={ansLoad}
                shieldCapacity={shieldCapacity}
                hudLayers={hudLayers}
                toggleLayer={(layer: 'terrain' | 'weather' | 'bio') => setHudLayers(prev => ({ ...prev, [layer]: !prev[layer] }))}
                activeLayerMode={activeLayerMode}
                setActiveLayerMode={setActiveLayerMode}
              />
            </div>
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
    </div>
  );
};
