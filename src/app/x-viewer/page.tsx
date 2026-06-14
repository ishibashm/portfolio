"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Compass,
  Navigation,
  Activity,
  Shield,
  Zap,
  CloudLightning,
  Globe,
  Loader2,
  Calendar,
  MapPin,
  RefreshCw,
  Gauge,
  Sliders,
  AlertTriangle,
} from "lucide-react";

interface CityPreset {
  name: string;
  jpName: string;
  lat: number;
  lon: number;
  description: string;
}

const WORLD_CITIES: CityPreset[] = [
  {
    name: "Tokyo",
    jpName: "東京 (日本)",
    lat: 35.6895,
    lon: 139.6917,
    description: "本拠地。中緯度帯の安定した磁気シールド領域。",
  },
  {
    name: "Reykjavik",
    jpName: "レイキャビク (アイスランド)",
    lat: 64.1466,
    lon: -21.9426,
    description: "高緯度オーロラ帯。地磁気偏角の変化が極めて激しいスポット。",
  },
  {
    name: "London",
    jpName: "ロンドン (英国)",
    lat: 51.5074,
    lon: -0.1278,
    description:
      "本初子午線の起点。真太陽時と標準時（GMT）の乖離が少ない基準値。",
  },
  {
    name: "New York",
    jpName: "ニューヨーク (米国)",
    lat: 40.7128,
    lon: -74.006,
    description: "西半球の主要ポイント。磁気偏角が負（西偏）に傾くエリア。",
  },
  {
    name: "Sydney",
    jpName: "シドニー (豪州)",
    lat: -33.8688,
    lon: 151.2093,
    description:
      "南半球の監視拠点。地磁気の磁力線が上向き（負の傾角）に放出されるポイント。",
  },
  {
    name: "Cairo",
    jpName: "カイロ (エジプト)",
    lat: 30.0444,
    lon: 31.2357,
    description: "赤道に近い安定磁気プレート。日照高度角が非常に高いエリア。",
  },
  {
    name: "Honolulu",
    jpName: "ホノルル (ハワイ)",
    lat: 21.3069,
    lon: -157.8583,
    description:
      "太平洋の中心に位置する海洋性プレート。クリーンな地磁気と日照高度角の調和領域。",
  },
];

export default function XViewerPage() {
  const [selectedCity, setSelectedCity] = useState<CityPreset>(WORLD_CITIES[0]);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Custom simulation states
  const [customLat, setCustomLat] = useState("35.6895");
  const [customLon, setCustomLon] = useState("139.6917");
  const [customDate, setCustomDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [isCustomSimulated, setIsCustomSimulated] = useState(false);
  const [customResult, setCustomResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  // Fetch telemetry from API
  const fetchTelemetry = async (city: CityPreset) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/magnetic-monitor?lat=${city.lat}&lon=${city.lon}&city=${encodeURIComponent(city.name)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Failed to fetch magnetic telemetry:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry(selectedCity);
  }, [selectedCity]);

  // Auto Refresh loop
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTelemetry(selectedCity);
    }, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [selectedCity, autoRefresh]);

  const handleSelectPreset = (city: CityPreset) => {
    setIsCustomSimulated(false);
    setSelectedCity(city);
  };

  // Run custom simulation
  const handleRunCustomSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (
      isNaN(lat) ||
      lat < -90 ||
      lat > 90 ||
      isNaN(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      alert("緯度は -90〜90、経度は -180〜180 の範囲で入力してください。");
      return;
    }
    setSimulating(true);
    try {
      const res = await fetch(
        `/api/magnetic-monitor?lat=${lat}&lon=${lon}&city=CustomTarget`,
      );
      if (res.ok) {
        const data = await res.json();
        setCustomResult(data);
        setIsCustomSimulated(true);
      }
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimulating(false);
    }
  };

  // Current active data block (either preset or simulated custom)
  const activeData = isCustomSimulated ? customResult : telemetry;

  // Calculate alignment score (0 - 100) based on declination offset and solar elevation
  const alignmentScore = useMemo(() => {
    if (!activeData) return 50;
    const dec = Math.abs(activeData.magnetic?.declination || 0);
    const elev = activeData.solar?.elevation || 0;

    // Declination score: 0 offset is 50 points, 20 deg offset is 0 points
    const decScore = Math.max(0, 50 - dec * 2.5);
    // Solar Elevation score: Noon elevation > 30 is good, night elevation is low
    const elevScore =
      elev > 0 ? Math.min(50, 20 + elev * 0.6) : Math.max(0, 10 + elev * 0.2);

    return Math.round(decScore + elevScore);
  }, [activeData]);

  // Derived compass angles
  const decAngle = activeData?.magnetic?.declination || 0;
  const solarAngle = activeData?.solar?.azimuth || 180;

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-mono relative">
      {/* Retro CRT overlay effects */}
      <div className="pointer-events-none fixed inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%),linear-gradient(90deg,rgba(168,85,247,0.02),rgba(16,185,129,0.01),rgba(59,130,246,0.02))] bg-[size:100%_4px,3px_100%] opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_200px,rgba(168,85,247,0.03),transparent_80%)] pointer-events-none z-10"></div>

      {/* Sidebar: Global Cities */}
      <div className="w-72 md:w-80 flex-shrink-0 border-r border-zinc-900 flex flex-col h-full bg-zinc-950/90 z-20 backdrop-blur-md">
        <div className="p-5 border-b border-zinc-900">
          <div className="flex items-center gap-2 text-purple-400 mb-3">
            <Globe className="w-5 h-5 animate-spin-slow" />
            <h1 className="text-sm font-bold uppercase tracking-widest">
              MONITOR NODES
            </h1>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            地球上の主要磁気観測ポイント。都市を選択して天体・地磁気アライメントのリアルタイム偏差を取得します。
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {WORLD_CITIES.map((city) => {
            const isSelected =
              selectedCity.name === city.name && !isCustomSimulated;
            return (
              <button
                key={city.name}
                onClick={() => handleSelectPreset(city)}
                className={`w-full text-left p-3 rounded-xl transition-all border flex flex-col gap-1.5 ${
                  isSelected
                    ? "bg-purple-950/20 border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.05)]"
                    : "bg-zinc-950/40 border-zinc-900 hover:border-zinc-800 text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {city.name}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5 text-zinc-500" />
                    {city.lat.toFixed(1)}°, {city.lon.toFixed(1)}°
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate">
                  {city.jpName}
                </p>
                {isSelected && (
                  <p className="text-[8px] text-purple-400/80 leading-normal border-t border-purple-500/10 pt-1.5 mt-1">
                    {city.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom Simulation Form */}
        <div className="p-4 border-t border-zinc-900 bg-zinc-950">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase mb-3">
            <Sliders className="w-3.5 h-3.5 text-purple-500" />
            <span>CUSTOM TARGET SIMULATOR</span>
          </div>
          <form onSubmit={handleRunCustomSimulation} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-zinc-500 uppercase">
                  Latitude (緯度)
                </label>
                <input
                  type="text"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  className="bg-black border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-purple-500"
                  placeholder="35.6895"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-zinc-500 uppercase">
                  Longitude (経度)
                </label>
                <input
                  type="text"
                  value={customLon}
                  onChange={(e) => setCustomLon(e.target.value)}
                  className="bg-black border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-purple-500"
                  placeholder="139.6917"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={simulating}
              className="w-full bg-purple-950/30 border border-purple-500/40 text-purple-300 rounded py-1.5 text-[10px] font-bold hover:bg-purple-900/40 transition-colors uppercase tracking-widest flex items-center justify-center gap-1.5"
            >
              {simulating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "ACTIVATE SIMULATOR"
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Main Panel: Live HUD telemetry */}
      <div className="flex-1 flex flex-col h-full bg-zinc-950/40 z-10 relative overflow-y-auto">
        {loading && !activeData ? (
          <div className="flex-grow flex flex-col items-center justify-center text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-2" />
            <span className="text-xs uppercase tracking-widest">
              CONNECTING TELEMETRY NODE...
            </span>
          </div>
        ) : activeData ? (
          <div className="p-6 space-y-6 max-w-5xl w-full mx-auto pb-16">
            {/* Header info bar */}
            <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
                  <h2 className="text-lg font-bold uppercase tracking-wider text-purple-400">
                    {isCustomSimulated ? "SIMULATED_TARGET" : activeData.city}
                  </h2>
                </div>
                <span className="text-[10px] text-zinc-500">
                  LAT: {activeData.lat.toFixed(4)}° / LON:{" "}
                  {activeData.lon.toFixed(4)}° / TS:{" "}
                  {activeData.timestamp.slice(11, 19)} UTC
                </span>
              </div>

              {/* Refresh Controls */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh && !isCustomSimulated}
                    disabled={isCustomSimulated}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-zinc-800 text-purple-600 bg-black w-3.5 h-3.5 cursor-pointer disabled:opacity-50"
                  />
                  <span>10s AUTO-SYNC</span>
                </label>
                <button
                  onClick={() => fetchTelemetry(selectedCity)}
                  disabled={isCustomSimulated}
                  className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-purple-500/40 text-zinc-400 hover:text-purple-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grid 1: Compass HUD & Numerical Vectors */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Graphical Compass (Col span 7) */}
              <div className="lg:col-span-7 bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 flex flex-col items-center justify-center relative min-h-[350px] shadow-lg overflow-hidden group">
                <div className="absolute top-4 left-4 flex items-center gap-1 text-[10px] font-bold text-zinc-500 uppercase">
                  <Compass className="w-4 h-4 text-purple-500" />
                  <span>Spatial Azimuth HUD</span>
                </div>

                {/* SVG Visual Compass Dial */}
                <div className="w-72 h-72 rounded-full border border-zinc-800/60 relative flex items-center justify-center mt-4 bg-black/20">
                  {/* Cardinal markings */}
                  <span className="absolute top-2 text-[9px] text-zinc-600 font-bold">
                    N
                  </span>
                  <span className="absolute right-3 text-[9px] text-zinc-600 font-bold">
                    E
                  </span>
                  <span className="absolute bottom-2 text-[9px] text-zinc-600 font-bold">
                    S
                  </span>
                  <span className="absolute left-3 text-[9px] text-zinc-600 font-bold">
                    W
                  </span>

                  {/* Compass grid lines */}
                  <div className="absolute w-full h-[1px] bg-zinc-900/40"></div>
                  <div className="absolute w-[1px] h-full bg-zinc-900/40"></div>
                  <div className="absolute w-56 h-56 rounded-full border border-zinc-900/30"></div>
                  <div className="absolute w-40 h-40 rounded-full border border-zinc-900/10"></div>

                  {/* True North Indicator (0 deg) */}
                  <div
                    className="absolute top-0 w-[2px] h-4 bg-emerald-500"
                    title="True North"
                  ></div>

                  {/* Magnetic Declination Vector Pointer (rotates by declination angle) */}
                  <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-700 ease-out"
                    style={{ transform: `rotate(${decAngle}deg)` }}
                  >
                    {/* Compass Needle for Magnetic North */}
                    <div className="h-full w-[1.5px] relative flex flex-col justify-between items-center py-2">
                      <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-b-[24px] border-b-purple-500"></div>
                      <div className="w-[3px] h-[3px] rounded-full bg-purple-500"></div>
                      <div className="w-0 h-0 border-l-[3.5px] border-l-transparent border-r-[3.5px] border-r-transparent border-t-[20px] border-t-purple-900"></div>
                    </div>
                    {/* Declination label */}
                    <span
                      className="absolute top-8 text-[8px] font-bold text-purple-400 bg-black/90 px-1 border border-purple-500/20"
                      style={{ transform: `rotate(${-decAngle}deg)` }}
                    >
                      MAG: {decAngle.toFixed(1)}°
                    </span>
                  </div>

                  {/* Solar Azimuth Pointer (rotates by solar angle) */}
                  {activeData.solar?.success && (
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none transition-transform duration-700 ease-out"
                      style={{ transform: `rotate(${solarAngle}deg)` }}
                    >
                      {/* Sun ray line */}
                      <div className="h-full w-[1px] relative flex flex-col justify-start items-center py-1">
                        <div className="w-3.5 h-3.5 rounded-full bg-amber-500/30 border border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)] flex items-center justify-center relative top-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        </div>
                        <div className="h-28 w-[1px] bg-gradient-to-t from-transparent to-amber-500/40 border-dashed border-r border-amber-500/20"></div>
                      </div>
                      <span
                        className="absolute top-16 text-[8px] font-bold text-amber-500 bg-black/90 px-1 border border-amber-500/20"
                        style={{ transform: `rotate(${-solarAngle}deg)` }}
                      >
                        SUN: {solarAngle.toFixed(1)}°
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-4 text-[9px] text-zinc-500 font-mono">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>{" "}
                    真北 (True North)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-purple-500 rounded-full"></span>{" "}
                    磁北 (Magnetic North)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>{" "}
                    太陽高度角 (Sun Vector)
                  </span>
                </div>
              </div>

              {/* Telemetry Vectors Table (Col span 5) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {/* Score Widget */}
                <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg relative overflow-hidden flex flex-col items-center justify-center py-6">
                  {/* Subtle background score rings */}
                  <div className="absolute w-24 h-24 rounded-full border border-purple-500/5 animate-pulse"></div>

                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
                    Alignment Match Rate
                  </span>
                  <span className="text-4xl font-extrabold text-glow text-purple-400 font-mono">
                    {alignmentScore}%
                  </span>
                  <span className="text-[8px] text-zinc-600 mt-1 uppercase tracking-widest text-center">
                    {alignmentScore > 80
                      ? "Phase Synchronization: Perfect"
                      : alignmentScore > 50
                        ? "Phase Synchronization: Stable"
                        : "Phase Synchronization: Distorted"}
                  </span>
                </div>

                {/* Vector parameters */}
                <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg flex-1 flex flex-col justify-between gap-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase border-b border-zinc-900 pb-2">
                    <Gauge className="w-4 h-4 text-purple-500" />
                    <span>Magnetic Core Vectors</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-900/60">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-500 uppercase">
                          Declination (偏角)
                        </span>
                        <span className="text-[7px] text-zinc-600">
                          真北から磁北のズレ角
                        </span>
                      </div>
                      <span className="text-sm font-bold text-purple-400">
                        {decAngle.toFixed(3)}°
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-900/60">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-500 uppercase">
                          Inclination (伏角)
                        </span>
                        <span className="text-[7px] text-zinc-600">
                          地球内部に向かう磁場角度
                        </span>
                      </div>
                      <span className="text-sm font-bold text-purple-400">
                        {(activeData.magnetic?.inclination || 0).toFixed(3)}°
                      </span>
                    </div>

                    <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-900/60">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-zinc-500 uppercase">
                          Intensity (全磁力)
                        </span>
                        <span className="text-[7px] text-zinc-600">
                          磁場のエネルギー絶対値
                        </span>
                      </div>
                      <span className="text-sm font-bold text-purple-400">
                        {Math.round(
                          activeData.magnetic?.totalIntensity || 0,
                        ).toLocaleString()}{" "}
                        nT
                      </span>
                    </div>
                  </div>

                  <div className="text-[8.5px] text-zinc-500 leading-normal text-justify">
                    ※これらの地磁気情報は、国際標準地球磁気モデル (WMM)
                    の2025年ベース公式係数に基づき計算された実シミュレーション値です。
                  </div>
                </div>
              </div>
            </div>

            {/* Grid 2: Space Weather HUD & Aurora Monitoring */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Space Weather index */}
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg flex flex-col gap-3 relative overflow-hidden group">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase">
                  <CloudLightning className="w-4 h-4 text-purple-500" />
                  <span>Magnetic Storm index</span>
                </div>
                <div className="flex items-end gap-2 my-2">
                  <span className="text-3xl font-extrabold text-glow text-purple-400">
                    Kp {activeData.spaceWeather?.kpIndex}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded border mb-1.5 uppercase ${
                      activeData.spaceWeather?.kpIndex >= 5.0
                        ? "bg-red-950/20 text-red-400 border-red-500/20"
                        : activeData.spaceWeather?.kpIndex >= 3.0
                          ? "bg-amber-950/20 text-amber-400 border-amber-500/20"
                          : "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                    }`}
                  >
                    {activeData.spaceWeather?.kpIndex >= 5.0
                      ? "Danger (磁気嵐)"
                      : activeData.spaceWeather?.kpIndex >= 3.0
                        ? "Active (警報)"
                        : "Optimal (極平穏)"}
                  </span>
                </div>
                <p className="text-[9px] text-zinc-500 leading-relaxed text-justify">
                  Kp指数は地磁気撹乱度を示します。高緯度（レイキャビク等）ではKpの上昇に伴いオーロラの発生域が拡張されます。
                </p>
              </div>

              {/* Solar Wind */}
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase">
                  <Zap className="w-4 h-4 text-purple-500" />
                  <span>Solar Wind Speed</span>
                </div>
                <div className="my-2">
                  <span className="text-3xl font-extrabold text-glow text-purple-400">
                    {activeData.spaceWeather?.solarWindSpeed} km/s
                  </span>
                </div>
                {/* Visual simulated progress bar */}
                <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="bg-purple-500 h-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, ((activeData.spaceWeather?.solarWindSpeed || 300) - 300) / 4)}%`,
                    }}
                  ></div>
                </div>
                <p className="text-[9px] text-zinc-500 leading-relaxed text-justify">
                  太陽から放出されるプラズマの風速。平均風速は300km/s〜400km/sですが、フレア爆発時は700km/sを越えます。
                </p>
              </div>

              {/* Aurora Chance */}
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg flex flex-col gap-3 relative">
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase">
                  <Activity className="w-4 h-4 text-purple-500" />
                  <span>Aurora Visibility</span>
                </div>
                <div className="my-2 flex justify-between items-center">
                  <span className="text-3xl font-extrabold text-glow text-purple-400">
                    {activeData.spaceWeather?.auroraChance}%
                  </span>
                  {activeData.spaceWeather?.auroraChance > 40 && (
                    <span className="text-[8px] bg-purple-950/30 text-purple-400 border border-purple-500/20 px-1 rounded animate-pulse">
                      MAGNETIC CURTAIN ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-zinc-500 leading-relaxed text-justify">
                  夜間かつ雲が無い状態でのオーロラ視認予測度。極域シールド層への宇宙プラズマ電荷の衝突確率を示しています。
                </p>
              </div>
            </div>

            {/* Grid 3: Historical Alignment finder or Solar Noon Calculations */}
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase border-b border-zinc-900 pb-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                <span>Solar Coordinates Telemetry</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeData.solar?.success ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">
                        Sun Altitude Angle (太陽高度角)
                      </span>
                      <span className="font-bold text-zinc-300">
                        {activeData.solar.elevation.toFixed(3)}°
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">
                        Sun Azimuth (太陽方位角)
                      </span>
                      <span className="font-bold text-zinc-300">
                        {activeData.solar.azimuth.toFixed(3)}°
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-500">Solar Vector State</span>
                      <span className="font-bold text-purple-400">
                        {activeData.solar.elevation > 0
                          ? "IN PHASE (昼・太陽光結合)"
                          : "OUT OF PHASE (夜・地平線下偏向)"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-500 text-xs py-4">
                    太陽高度計算エラーが発生しました。
                  </div>
                )}

                <div className="text-[9px] text-zinc-500 leading-relaxed text-justify flex flex-col justify-center">
                  <div className="flex items-start gap-1.5 text-zinc-400 font-bold mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span>真太陽時（Solar Time）との連動</span>
                  </div>
                  <span>
                    平均太陽時（時計の時刻）は一定ですが、実際の太陽方位から算出される真太陽時は、地球の公転軌道の歪みにより日ごとに進み遅れ（均時差）が生じます。当ポータルは、このズレを精密に考慮した「真太陽時アライメント」を提供しています。
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-zinc-500">
            <span className="text-xs uppercase tracking-widest">
              NO TELEMETRY RECORDED IN CURRENT SESSION
            </span>
          </div>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .text-glow {
          text-shadow: 0 0 10px rgba(168,85,247,0.3), 0 0 20px rgba(168,85,247,0.15);
        }
        .animate-spin-slow {
          animation: spin 20s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `,
        }}
      />
    </div>
  );
}
